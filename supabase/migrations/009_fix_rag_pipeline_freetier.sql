-- ============================================================
-- MIGRATION 009 — Fix RAG pipeline (Free Tier Compatible)
-- Uses HNSW index instead of IVFFlat — no maintenance_work_mem limit
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Drop all existing overloads of search_hms_knowledge
DROP FUNCTION IF EXISTS search_hms_knowledge(vector, float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge(vector(768), float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge(vector(1536), float, int);

-- 2. Drop the old IVFFlat index (this was causing the memory error)
DROP INDEX IF EXISTS hms_knowledge_embedding_idx;

-- 3. Create HNSW index instead — works on free tier, often FASTER than IVFFlat
--    HNSW builds incrementally and doesn't require large maintenance_work_mem
CREATE INDEX IF NOT EXISTS hms_knowledge_embedding_hnsw_idx
    ON hms_knowledge
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- 4. Recreate search function with correct 1536-dim signature
CREATE OR REPLACE FUNCTION search_hms_knowledge(
    query_embedding      vector(1536),
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count          INT   DEFAULT 7
)
RETURNS TABLE (
    id          TEXT,
    question    TEXT,
    answer      TEXT,
    category    TEXT,
    subcategory TEXT,
    content     TEXT,
    source      TEXT,
    source_name TEXT,
    similarity  FLOAT
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
        (1 - (k.embedding <=> query_embedding))::FLOAT AS similarity
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY k.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 5. Add fts column for hybrid search (if not already exists)
ALTER TABLE hms_knowledge
    ADD COLUMN IF NOT EXISTS fts tsvector
        GENERATED ALWAYS AS (
            to_tsvector('english',
                coalesce(question, '') || ' ' ||
                coalesce(answer, '') || ' ' ||
                coalesce(subcategory, '')
            )
        ) STORED;

-- 6. GIN index for full-text search (tiny memory footprint)
CREATE INDEX IF NOT EXISTS hms_knowledge_fts_idx
    ON hms_knowledge USING GIN (fts);

-- 7. Hybrid search function (vector + full-text, 70/30 blend)
CREATE OR REPLACE FUNCTION search_hms_knowledge_hybrid(
    query_embedding      vector(1536),
    query_text           TEXT,
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count          INT   DEFAULT 7
)
RETURNS TABLE (
    id            TEXT,
    question      TEXT,
    answer        TEXT,
    category      TEXT,
    subcategory   TEXT,
    content       TEXT,
    source        TEXT,
    source_name   TEXT,
    similarity    FLOAT,
    fts_rank      FLOAT,
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
        (1 - (k.embedding <=> query_embedding))::FLOAT                  AS similarity,
        COALESCE(ts_rank(k.fts, tsq), 0)::FLOAT                        AS fts_rank,
        ((1 - (k.embedding <=> query_embedding)) * 0.7 +
         COALESCE(ts_rank(k.fts, tsq), 0) * 0.3)::FLOAT               AS combined_score
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- ── Verify ────────────────────────────────────────────────────
-- Run these after migration to confirm everything works:
--
-- Check index was created:
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'hms_knowledge';
--
-- Check function signature:
--   SELECT proname, pg_get_function_arguments(oid)
--   FROM pg_proc WHERE proname = 'search_hms_knowledge';
--
-- Quick search test (replace with a real embedding from your data):
--   SELECT id, question, similarity
--   FROM search_hms_knowledge(
--     (SELECT embedding FROM hms_knowledge WHERE embedding IS NOT NULL LIMIT 1),
--     0.20, 5
--   );
-- Should return rows. If 0 rows: run VACUUM ANALYZE hms_knowledge;
-- ─────────────────────────────────────────────────────────────
