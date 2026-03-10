-- ============================================================
-- Migration 015: RAPTOR Hierarchical Indexing
-- ============================================================
--
-- RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval)
-- Guo et al., 2024 — used by LlamaIndex, LangChain, and Anthropic RAG systems
--
-- What this adds:
--   1. raptor_clusters table  — stores cluster summaries at each tree level
--   2. Cluster-aware search RPC — retrieves from both leaf AND summary nodes
--   3. Views for admin dashboard — cluster health, coverage gaps
--
-- How RAPTOR works:
--   Level 0: Raw KB chunks (already in hms_knowledge, chunk_level=0)
--   Level 1: Each cluster of ~10 similar chunks → 1 summary chunk
--   Level 2: Each cluster of ~5 level-1 summaries → 1 abstract summary
--
--   At retrieval time: search ALL levels simultaneously.
--   Level-0 hits → precise detail
--   Level-1 hits → topic-level context
--   Level-2 hits → cross-topic synthesis
--
-- This solves the "lost in the middle" problem for COMPLEX questions
-- that span multiple KB sections.
-- ============================================================

-- ── 1. RAPTOR clusters table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raptor_clusters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level           INTEGER NOT NULL,          -- 1, 2, 3 (0 = raw chunks in hms_knowledge)
    cluster_id      INTEGER NOT NULL,          -- cluster index within this level
    summary         TEXT NOT NULL,             -- LLM-generated summary of the cluster
    embedding       vector(1536),              -- embedding of the summary
    child_ids       TEXT[] NOT NULL,           -- IDs of child nodes (TEXT for hms_knowledge IDs, UUID text for clusters)
    child_level     INTEGER NOT NULL,          -- level of the children (level - 1)
    entry_count     INTEGER NOT NULL DEFAULT 0, -- number of leaf chunks in this cluster
    category        TEXT,                      -- dominant category among children
    entities        TEXT[] DEFAULT '{}',       -- aggregated entities from children
    source_names    TEXT[] DEFAULT '{}',       -- sources covered by this cluster
    quality_score   FLOAT DEFAULT 0.0,         -- coherence score of the cluster
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index on summary embeddings (same config as hms_knowledge)
CREATE INDEX IF NOT EXISTS raptor_clusters_embedding_idx
    ON raptor_clusters
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS raptor_clusters_level_idx ON raptor_clusters (level);
CREATE INDEX IF NOT EXISTS raptor_clusters_category_idx ON raptor_clusters (category);

-- ── 2. RAPTOR build tracking table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS raptor_build_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    triggered_by    TEXT DEFAULT 'manual',     -- 'manual' | 'ingest' | 'scheduled'
    status          TEXT DEFAULT 'running',    -- 'running' | 'complete' | 'failed'
    levels_built    INTEGER DEFAULT 0,
    clusters_built  INTEGER DEFAULT 0,
    chunks_indexed  INTEGER DEFAULT 0,
    error_msg       TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

-- ── 3. Mark chunk_level on hms_knowledge (if not already done) ───────────────

-- Preserve existing parent/child chunk semantics from migration 013
UPDATE hms_knowledge
SET chunk_level = 'child'
WHERE chunk_level IS NULL;

-- ── 4. Search RPC: search across ALL RAPTOR levels ───────────────────────────

CREATE OR REPLACE FUNCTION search_raptor_multilevel(
    query_embedding  vector(1536),
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count      INTEGER DEFAULT 6,
    max_level        INTEGER DEFAULT 2   -- search up to this RAPTOR summary level
)
RETURNS TABLE (
    id              UUID,
    content         TEXT,       -- summary text (or answer for level-0)
    category        TEXT,
    entities        TEXT[],
    source_names    TEXT[],
    similarity      FLOAT,
    raptor_level    INTEGER,    -- which tree level this hit came from
    child_count     INTEGER     -- how many leaf chunks this covers
)
LANGUAGE sql STABLE AS $$
    -- Level 1+ : RAPTOR cluster summaries only.
    -- Leaf-level retrieval stays in search_hms_knowledge to avoid double-fetching L0 chunks.
    SELECT
        rc.id,
        rc.summary AS content,
        rc.category,
        rc.entities,
        rc.source_names,
        1 - (rc.embedding <=> query_embedding) AS similarity,
        rc.level AS raptor_level,
        rc.entry_count AS child_count
    FROM raptor_clusters rc
    WHERE rc.embedding IS NOT NULL
      AND 1 - (rc.embedding <=> query_embedding) > similarity_threshold
      AND rc.level <= max_level

    ORDER BY similarity DESC
    LIMIT match_count;
$$;

-- ── 5. RPC: get children of a RAPTOR cluster (for drill-down) ────────────────

CREATE OR REPLACE FUNCTION get_raptor_children(
    p_cluster_id  UUID,
    p_child_level INTEGER
)
RETURNS TABLE (
    id         TEXT,
    content    TEXT,
    similarity FLOAT,
    level      INTEGER
)
LANGUAGE sql STABLE AS $$
    WITH target_children AS (
        SELECT UNNEST(child_ids) AS child_id
        FROM raptor_clusters
        WHERE id = p_cluster_id
    ),
    cluster_children AS (
        SELECT
            rc.id::text AS id,
            rc.summary AS content,
            rc.quality_score AS similarity,
            rc.level
        FROM raptor_clusters rc
        WHERE rc.id::text IN (SELECT child_id FROM target_children)
          AND rc.level = p_child_level
    ),
    leaf_children AS (
        SELECT
            hk.id,
            COALESCE(hk.answer, hk.content, '') AS content,
            COALESCE(hk.usage_count, 0) AS usage_count,
            0 AS level
        FROM hms_knowledge hk
        WHERE hk.id IN (SELECT child_id FROM target_children)
          AND p_child_level = 0
    ),
    leaf_stats AS (
        SELECT GREATEST(COALESCE(MAX(usage_count), 1), 1) AS max_usage
        FROM leaf_children
    )
    SELECT
        cc.id,
        cc.content,
        cc.similarity,
        cc.level
    FROM cluster_children cc

    UNION ALL

    SELECT
        lc.id,
        lc.content,
        lc.usage_count::float / ls.max_usage AS similarity,
        lc.level
    FROM leaf_children lc
    CROSS JOIN leaf_stats ls;
$$;

-- ── 6. Admin views ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW raptor_health AS
SELECT
    level,
    COUNT(*) AS cluster_count,
    SUM(entry_count) AS total_leaf_coverage,
    ROUND(AVG(quality_score)::numeric, 3) AS avg_quality,
    ROUND(AVG(entry_count)::numeric, 1) AS avg_children,
    MAX(updated_at) AS last_updated
FROM raptor_clusters
GROUP BY level
ORDER BY level;

CREATE OR REPLACE VIEW raptor_coverage_gaps AS
-- Finds categories with no RAPTOR level-1 cluster
SELECT DISTINCT
    hk.category,
    COUNT(*) AS chunk_count,
    'no_raptor_cluster' AS gap_type
FROM hms_knowledge hk
WHERE hk.is_archived = false
  AND NOT EXISTS (
      SELECT 1 FROM raptor_clusters rc
      WHERE rc.level = 1
        AND rc.category = hk.category
  )
GROUP BY hk.category
HAVING COUNT(*) >= 5  -- only flag if there's enough content to cluster
ORDER BY chunk_count DESC;
