-- ============================================================
-- MIGRATION 029 - Migrate to text-embedding-3-large (1536 dims via Matryoshka)
-- ============================================================
--
-- This migration upgrades every active vector storage/retrieval boundary
-- from text-embedding-3-small (1536d) to text-embedding-3-large (1536d via Matryoshka).
-- We keep 1536 dims to stay within pgvector's 2000-dim HNSW index limit
-- while gaining the superior embedding quality of text-embedding-3-large.
--
-- IMPORTANT:
-- 1. Existing embeddings become invalid and are cleared.
-- 2. semantic_cache is truncated because cached answers depend on old vectors.
-- 3. raptor_clusters is truncated because RAPTOR summaries must be re-embedded.
-- 4. All active vector RPCs are recreated with vector(1536) signatures.
--
-- Run this migration before re-ingesting content.
-- After migration:
--   - re-ingest hms_knowledge
--   - rebuild RAPTOR
--   - allow semantic cache to refill naturally
-- ============================================================

BEGIN;

-- Drop vector indexes before changing dimensions.
DROP INDEX IF EXISTS hms_knowledge_embedding_hnsw_idx;
DROP INDEX IF EXISTS hms_knowledge_embedding_idx;
DROP INDEX IF EXISTS semantic_cache_embedding_idx;
DROP INDEX IF EXISTS raptor_clusters_embedding_idx;

-- Clear derived/vector-dependent data before type changes.
TRUNCATE TABLE semantic_cache;
TRUNCATE TABLE raptor_clusters;

-- Invalidate legacy embeddings in the primary KB to prevent mixed models.
UPDATE hms_knowledge
SET embedding = NULL
WHERE embedding IS NOT NULL;

-- Upgrade vector columns (dimensions unchanged at 1536, but embeddings are now from text-embedding-3-large).
ALTER TABLE hms_knowledge
    ALTER COLUMN embedding TYPE vector(1536)
    USING NULL::vector(1536);

ALTER TABLE semantic_cache
    ALTER COLUMN embedding TYPE vector(1536)
    USING NULL::vector(1536);

ALTER TABLE raptor_clusters
    ALTER COLUMN embedding TYPE vector(1536)
    USING NULL::vector(1536);

-- Recreate vector indexes.
CREATE INDEX IF NOT EXISTS hms_knowledge_embedding_hnsw_idx
    ON hms_knowledge
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx
    ON semantic_cache
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS raptor_clusters_embedding_idx
    ON raptor_clusters
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Remove any prior function signatures to ensure clean recreation.
DROP FUNCTION IF EXISTS search_hms_knowledge(vector(1536), float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge(vector(1536), float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge_frontier(vector(1536), text, text[], float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge_frontier(vector(1536), text, text[], float, int);
DROP FUNCTION IF EXISTS find_near_duplicates(vector(1536), float, int);
DROP FUNCTION IF EXISTS find_near_duplicates(vector(1536), float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge_mmr(vector(1536), float, int, float, float);
DROP FUNCTION IF EXISTS search_hms_knowledge_mmr(vector(1536), float, int, float, float);
DROP FUNCTION IF EXISTS search_hms_knowledge_weighted(vector(1536), float, int, jsonb);
DROP FUNCTION IF EXISTS search_hms_knowledge_weighted(vector(1536), float, int, jsonb);
DROP FUNCTION IF EXISTS hybrid_search_hms(text, vector(1536), float, int, float);
DROP FUNCTION IF EXISTS hybrid_search_hms(text, vector(1536), float, int, float);
DROP FUNCTION IF EXISTS get_boosted_results(vector(1536), int, float);
DROP FUNCTION IF EXISTS get_boosted_results(vector(1536), int, float);
DROP FUNCTION IF EXISTS mmr_with_graph_boost(vector(1536), text[], float, int, float, float);
DROP FUNCTION IF EXISTS mmr_with_graph_boost(vector(1536), text[], float, int, float, float);
DROP FUNCTION IF EXISTS search_semantic_cache(vector(1536), float, int);
DROP FUNCTION IF EXISTS search_semantic_cache(vector(1536), float, int);
DROP FUNCTION IF EXISTS search_raptor_multilevel(vector(1536), float, integer, integer);
DROP FUNCTION IF EXISTS search_raptor_multilevel(vector(1536), float, integer, integer);

CREATE OR REPLACE FUNCTION search_hms_knowledge(
    query_embedding      vector(1536),
    similarity_threshold FLOAT DEFAULT 0.18,
    match_count          INT DEFAULT 8
)
RETURNS TABLE (
    id           TEXT,
    question     TEXT,
    answer       TEXT,
    category     TEXT,
    subcategory  TEXT,
    content      TEXT,
    source       TEXT,
    source_name  TEXT,
    chunk_type   TEXT,
    entities     TEXT[],
    similarity   FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.id,
        k.question,
        k.answer,
        k.category,
        k.subcategory,
        k.content,
        k.source,
        k.source_name,
        COALESCE(k.chunk_type, 'chunk') AS chunk_type,
        COALESCE(k.entities, '{}') AS entities,
        (1 - (k.embedding <=> query_embedding))::FLOAT AS similarity
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY k.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_hms_knowledge_frontier(
    query_embedding      vector(1536),
    query_text           TEXT,
    query_entities       TEXT[] DEFAULT '{}',
    similarity_threshold FLOAT DEFAULT 0.18,
    match_count          INT DEFAULT 8
)
RETURNS TABLE (
    id             TEXT,
    question       TEXT,
    answer         TEXT,
    category       TEXT,
    subcategory    TEXT,
    content        TEXT,
    source         TEXT,
    source_name    TEXT,
    chunk_type     TEXT,
    entities       TEXT[],
    vector_score   FLOAT,
    fts_score      FLOAT,
    entity_score   FLOAT,
    combined_score FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
    tsq tsquery;
BEGIN
    BEGIN
        tsq := websearch_to_tsquery('english', query_text);
    EXCEPTION WHEN OTHERS THEN
        tsq := plainto_tsquery('english', query_text);
    END;

    RETURN QUERY
    SELECT
        k.id,
        k.question,
        k.answer,
        k.category,
        k.subcategory,
        k.content,
        k.source,
        k.source_name,
        COALESCE(k.chunk_type, 'chunk') AS chunk_type,
        COALESCE(k.entities, '{}') AS entities,
        (1 - (k.embedding <=> query_embedding))::FLOAT AS vector_score,
        COALESCE(ts_rank(k.fts, tsq), 0)::FLOAT AS fts_score,
        CASE
            WHEN array_length(query_entities, 1) > 0 THEN (
                SELECT COUNT(*)::FLOAT / array_length(query_entities, 1)
                FROM unnest(query_entities) qe
                WHERE qe = ANY(k.entities)
            )
            ELSE 0
        END AS entity_score,
        (
            (1 - (k.embedding <=> query_embedding)) * 0.60 +
            COALESCE(ts_rank(k.fts, tsq), 0) * 0.20 +
            CASE
                WHEN array_length(query_entities, 1) > 0 THEN (
                    SELECT COUNT(*)::FLOAT / array_length(query_entities, 1)
                    FROM unnest(query_entities) qe
                    WHERE qe = ANY(k.entities)
                ) * 0.20
                ELSE 0
            END
        )::FLOAT AS combined_score
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION find_near_duplicates(
    query_embedding vector(1536),
    threshold       FLOAT DEFAULT 0.92,
    max_results     INT DEFAULT 3
)
RETURNS TABLE (
    id         TEXT,
    question   TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.id,
        k.question,
        (1 - (k.embedding <=> query_embedding))::FLOAT AS similarity
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > threshold
    ORDER BY k.embedding <=> query_embedding
    LIMIT max_results;
END;
$$;

CREATE OR REPLACE FUNCTION search_hms_knowledge_mmr(
    query_embedding      vector(1536),
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count          INT DEFAULT 8,
    mmr_lambda           FLOAT DEFAULT 0.05,
    recency_boost        FLOAT DEFAULT 0.10
)
RETURNS TABLE (
    id           TEXT,
    question     TEXT,
    answer       TEXT,
    category     TEXT,
    subcategory  TEXT,
    content      TEXT,
    source       TEXT,
    source_name  TEXT,
    chunk_type   TEXT,
    entities     TEXT[],
    similarity   FLOAT,
    final_score  FLOAT,
    source_rank  INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH candidates AS (
        SELECT
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') AS chunk_type,
            COALESCE(k.entities, '{}') AS entities,
            (1 - (k.embedding <=> query_embedding))::FLOAT AS similarity,
            (1 + (recency_boost * EXP(- (EXTRACT(EPOCH FROM (NOW() - k.created_at)) / (86400 * 30))::FLOAT)))::FLOAT AS recency_factor
        FROM hms_knowledge k
        WHERE k.embedding IS NOT NULL
          AND k.is_archived = FALSE
          AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
        ORDER BY k.embedding <=> query_embedding
        LIMIT 30
    ),
    ranked AS (
        SELECT
            c.*,
            ROW_NUMBER() OVER (PARTITION BY c.source_name ORDER BY c.similarity DESC) AS source_rank
        FROM candidates c
    )
    SELECT
        r.id,
        r.question,
        r.answer,
        r.category,
        r.subcategory,
        r.content,
        r.source,
        r.source_name,
        r.chunk_type,
        r.entities,
        r.similarity,
        (r.similarity * r.recency_factor - (r.source_rank - 1) * mmr_lambda)::FLOAT AS final_score,
        r.source_rank::INT
    FROM ranked r
    ORDER BY final_score DESC
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_hms_knowledge_weighted(
    query_embedding      vector(1536),
    similarity_threshold FLOAT DEFAULT 0.18,
    match_count          INT DEFAULT 8,
    chunk_weights        JSONB DEFAULT '{"proposition": 1.15, "chunk": 1.0, "image": 0.95, "qa": 1.0}'::jsonb
)
RETURNS TABLE (
    id             TEXT,
    question       TEXT,
    answer         TEXT,
    category       TEXT,
    subcategory    TEXT,
    content        TEXT,
    source         TEXT,
    source_name    TEXT,
    chunk_type     TEXT,
    similarity     FLOAT,
    weighted_score FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        k.id,
        k.question,
        k.answer,
        k.category,
        k.subcategory,
        k.content,
        k.source,
        k.source_name,
        COALESCE(k.chunk_type, 'chunk') AS chunk_type,
        (1 - (k.embedding <=> query_embedding))::FLOAT AS similarity,
        (
            (1 - (k.embedding <=> query_embedding))
            * COALESCE((chunk_weights ->> COALESCE(k.chunk_type, 'chunk'))::FLOAT, 1.0)
        )::FLOAT AS weighted_score
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND COALESCE(k.is_archived, FALSE) = FALSE
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY weighted_score DESC
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION hybrid_search_hms(
    query_text TEXT,
    query_vector vector(1536),
    alpha FLOAT DEFAULT 0.5,
    top_k INT DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.15
)
RETURNS TABLE (
    id TEXT,
    question TEXT,
    answer TEXT,
    category TEXT,
    subcategory TEXT,
    content TEXT,
    source TEXT,
    source_name TEXT,
    chunk_type TEXT,
    entities TEXT[],
    similarity FLOAT,
    hybrid_score FLOAT,
    rank_position INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH bm25_results AS (
        SELECT
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') AS chunk_type,
            COALESCE(k.entities, '{}') AS entities,
            COALESCE(
                ts_rank(
                    to_tsvector('english', COALESCE(k.question, '') || ' ' || COALESCE(k.content, '')),
                    plainto_tsquery('english', query_text)
                ),
                0
            ) AS bm25_score
        FROM hms_knowledge k
        WHERE k.content IS NOT NULL
          AND to_tsvector('english', COALESCE(k.question, '') || ' ' || COALESCE(k.content, ''))
              @@ plainto_tsquery('english', query_text)
          AND COALESCE(k.is_archived, FALSE) = FALSE
    ),
    vector_results AS (
        SELECT
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') AS chunk_type,
            COALESCE(k.entities, '{}') AS entities,
            (1 - (k.embedding <=> query_vector))::FLOAT AS vector_score
        FROM hms_knowledge k
        WHERE k.embedding IS NOT NULL
          AND (1 - (k.embedding <=> query_vector)) > similarity_threshold
          AND COALESCE(k.is_archived, FALSE) = FALSE
    ),
    normalized AS (
        SELECT
            v.id,
            v.question,
            v.answer,
            v.category,
            v.subcategory,
            v.content,
            v.source,
            v.source_name,
            v.chunk_type,
            v.entities,
            v.vector_score,
            b.bm25_score,
            CASE
                WHEN MAX(b.bm25_score) OVER() > 0
                THEN b.bm25_score / MAX(b.bm25_score) OVER()
                ELSE 0
            END AS normalized_bm25,
            CASE
                WHEN MAX(v.vector_score) OVER() > 0
                THEN v.vector_score
                ELSE 0
            END AS normalized_vector
        FROM vector_results v
        LEFT JOIN bm25_results b ON v.id = b.id
    )
    SELECT
        n.id,
        n.question,
        n.answer,
        n.category,
        n.subcategory,
        n.content,
        n.source,
        n.source_name,
        n.chunk_type,
        n.entities,
        n.vector_score AS similarity,
        (COALESCE(n.normalized_vector, 0) * alpha + COALESCE(n.normalized_bm25, 0) * (1 - alpha))::FLOAT AS hybrid_score,
        ROW_NUMBER() OVER (
            ORDER BY (COALESCE(n.normalized_vector, 0) * alpha + COALESCE(n.normalized_bm25, 0)) DESC
        ) AS rank_position
    FROM normalized n
    ORDER BY hybrid_score DESC
    LIMIT top_k;
END;
$$;

CREATE OR REPLACE FUNCTION get_boosted_results(
    query_vector vector(1536),
    days_since INT DEFAULT 30,
    boost_weight FLOAT DEFAULT 0.15
)
RETURNS TABLE(id TEXT, boost_score FLOAT)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        k.id,
        COALESCE(
            AVG(
                CASE f.rating
                    WHEN 5 THEN 1.0
                    WHEN 4 THEN 0.75
                    WHEN 3 THEN 0.5
                    WHEN 2 THEN 0.25
                    ELSE 0
                END
            ),
            0
        ) * boost_weight AS boost_score
    FROM hms_knowledge k
    LEFT JOIN retrieval_feedback f ON k.id = f.result_id
    WHERE f.created_at > NOW() - (days_since || ' days')::INTERVAL
    GROUP BY k.id;
END;
$$;

CREATE OR REPLACE FUNCTION mmr_with_graph_boost(
    query_vector vector(1536),
    query_entities TEXT[],
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count INT DEFAULT 10,
    mmr_lambda FLOAT DEFAULT 0.5,
    graph_boost_weight FLOAT DEFAULT 0.1
)
RETURNS TABLE (
    id TEXT,
    question TEXT,
    answer TEXT,
    category TEXT,
    subcategory TEXT,
    content TEXT,
    source TEXT,
    source_name TEXT,
    chunk_type TEXT,
    entities TEXT[],
    similarity FLOAT,
    mmr_score FLOAT,
    rank_position INT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH scored AS (
        SELECT
            k.id,
            k.question,
            k.answer,
            k.category,
            k.subcategory,
            k.content,
            k.source,
            k.source_name,
            COALESCE(k.chunk_type, 'chunk') AS chunk_type,
            COALESCE(k.entities, '{}') AS entities,
            (1 - (k.embedding <=> query_vector))::FLOAT AS similarity,
            COALESCE(
                (
                    SELECT MAX(kg.confidence * graph_boost_weight)
                    FROM knowledge_graph kg
                    WHERE kg.entity_a = ANY(query_entities)
                      AND kg.entity_b = ANY(k.entities)
                ),
                0
            ) AS graph_boost,
            EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - k.created_at)) / 86400 AS days_old
        FROM hms_knowledge k
        WHERE k.embedding IS NOT NULL
          AND COALESCE(k.is_archived, FALSE) = FALSE
          AND (1 - (k.embedding <=> query_vector)) > similarity_threshold
    )
    SELECT
        s.id,
        s.question,
        s.answer,
        s.category,
        s.subcategory,
        s.content,
        s.source,
        s.source_name,
        s.chunk_type,
        s.entities,
        s.similarity,
        (
            (s.similarity * (1 - mmr_lambda) + s.similarity * mmr_lambda - s.graph_boost)
            * CASE
                WHEN s.days_old < 30 THEN 1.15
                WHEN s.days_old < 90 THEN 1.0
                ELSE 0.95
            END
        ) AS mmr_score,
        ROW_NUMBER() OVER (ORDER BY s.similarity DESC) AS rank_position
    FROM scored s
    ORDER BY s.similarity DESC
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_semantic_cache(
    query_embedding  vector(1536),
    similarity_threshold FLOAT DEFAULT 0.90,
    match_count      INT DEFAULT 1
)
RETURNS TABLE (
    id          UUID,
    query_text  TEXT,
    answer      TEXT,
    answer_mode TEXT,
    language    TEXT,
    similarity  FLOAT,
    hit_count   INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sc.id,
        sc.query_text,
        sc.answer,
        sc.answer_mode,
        sc.language,
        (1 - (sc.embedding <=> query_embedding))::FLOAT AS similarity,
        sc.hit_count
    FROM semantic_cache sc
    WHERE (1 - (sc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY sc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_raptor_multilevel(
    query_embedding vector(1536),
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count INTEGER DEFAULT 6,
    max_level INTEGER DEFAULT 2
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    category TEXT,
    entities TEXT[],
    source_names TEXT[],
    similarity FLOAT,
    raptor_level INTEGER,
    child_count INTEGER
)
LANGUAGE sql
STABLE
AS $$
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

ANALYZE hms_knowledge;
ANALYZE semantic_cache;
ANALYZE raptor_clusters;

COMMIT;
