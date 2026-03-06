-- ============================================================
-- MIGRATION 010 — Frontier RAG Pipeline
-- Supports: proposition storage, parent-child chunks, 
--           entity indexes, semantic dedup helpers
-- Run in Supabase SQL Editor after 009_fix_rag_pipeline_freetier.sql
-- ============================================================

-- 1. Add parent_content column for parent-child chunking
--    child chunk is stored as `content` (for retrieval)
--    parent chunk is stored here (for LLM context)

ALTER TABLE hms_knowledge
    ADD COLUMN IF NOT EXISTS parent_content TEXT,
    ADD COLUMN IF NOT EXISTS chunk_type TEXT DEFAULT 'chunk',
    ADD COLUMN IF NOT EXISTS entities TEXT[] DEFAULT '{}';

-- Step 2 — Add the CHECK constraint separately:
ALTER TABLE hms_knowledge
    ADD CONSTRAINT hms_knowledge_chunk_type_check
    CHECK (chunk_type IN ('chunk', 'proposition', 'image', 'qa'));

-- Step 3 — Now drop and recreate the view:
DROP VIEW IF EXISTS kb_sources CASCADE;

CREATE OR REPLACE VIEW kb_sources AS
SELECT
    source,
    source_name,
    COUNT(*)                                            AS entry_count,
    COUNT(*) FILTER (WHERE chunk_type = 'chunk')        AS chunks,
    COUNT(*) FILTER (WHERE chunk_type = 'proposition')  AS propositions,
    COUNT(*) FILTER (WHERE chunk_type = 'image')        AS images,
    MAX(created_at)                                     AS last_updated,
    ROUND(AVG(LENGTH(answer))::numeric, 0)              AS avg_answer_length,
    CASE source
        WHEN 'json'        THEN '📚 JSON Knowledge Base'
        WHEN 'pdf'         THEN '📄 PDF Text + Propositions'
        WHEN 'pdf_image'   THEN '🖼️  PDF Visual Content'
        WHEN 'admin'       THEN '👤 Admin Added'
        WHEN 'langextract' THEN '🔬 LangExtract (Structured)'
        ELSE source
    END AS source_label
FROM hms_knowledge
GROUP BY source, source_name
ORDER BY entry_count DESC;

-- Step 4 — Verify it worked:
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'hms_knowledge'
AND column_name IN ('parent_content', 'chunk_type', 'entities');

-- Step 5 — Create indexes:
CREATE INDEX IF NOT EXISTS hms_knowledge_chunk_type_idx
    ON hms_knowledge (chunk_type);

CREATE INDEX IF NOT EXISTS hms_knowledge_entities_idx
    ON hms_knowledge USING GIN (entities);

-- Step 6 — Recreate search function with new columns:
DROP FUNCTION IF EXISTS search_hms_knowledge(vector(1536), float, int);

CREATE OR REPLACE FUNCTION search_hms_knowledge(
    query_embedding      vector(1536),
    similarity_threshold FLOAT DEFAULT 0.18,
    match_count          INT   DEFAULT 8
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
        COALESCE(k.chunk_type, 'chunk')    AS chunk_type,
        COALESCE(k.entities, '{}')         AS entities,
        (1 - (k.embedding <=> query_embedding))::FLOAT AS similarity
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY k.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Step 7 — Create frontier hybrid search function:
CREATE OR REPLACE FUNCTION search_hms_knowledge_frontier(
    query_embedding      vector(1536),
    query_text           TEXT,
    query_entities       TEXT[]  DEFAULT '{}',
    similarity_threshold FLOAT   DEFAULT 0.18,
    match_count          INT     DEFAULT 8
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
        COALESCE(k.chunk_type, 'chunk')                              AS chunk_type,
        COALESCE(k.entities, '{}')                                   AS entities,
        (1 - (k.embedding <=> query_embedding))::FLOAT               AS vector_score,
        COALESCE(ts_rank(k.fts, tsq), 0)::FLOAT                     AS fts_score,
        CASE
            WHEN array_length(query_entities, 1) > 0 THEN (
                SELECT COUNT(*)::FLOAT / array_length(query_entities, 1)
                FROM unnest(query_entities) qe
                WHERE qe = ANY(k.entities)
            )
            ELSE 0
        END                                                           AS entity_score,
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
        )::FLOAT                                                      AS combined_score
    FROM hms_knowledge k
    WHERE k.embedding IS NOT NULL
      AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;

-- Step 8 — Create deduplication function:
CREATE OR REPLACE FUNCTION find_near_duplicates(
    query_embedding vector(1536),
    threshold       FLOAT DEFAULT 0.92,
    max_results     INT   DEFAULT 3
)
RETURNS TABLE (
    id          TEXT,
    question    TEXT,
    similarity  FLOAT
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

-- Step 9 — Create analytics views:
CREATE OR REPLACE VIEW kb_health AS
SELECT
    chunk_type,
    COUNT(*)                                        AS total_entries,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL)   AS with_embeddings,
    COUNT(*) FILTER (WHERE entities != '{}')        AS with_entities,
    ROUND(AVG(LENGTH(answer))::numeric, 0)          AS avg_answer_length,
    MAX(created_at)                                 AS last_updated
FROM hms_knowledge
GROUP BY chunk_type
ORDER BY total_entries DESC;

CREATE OR REPLACE VIEW kb_entity_coverage AS
SELECT
    entity,
    COUNT(*) AS mention_count,
    STRING_AGG(DISTINCT category, ', ' ORDER BY category) AS categories
FROM hms_knowledge,
     unnest(entities) AS entity
WHERE entity != ''
GROUP BY entity
ORDER BY mention_count DESC
LIMIT 100;

-- Step 10 — Final verification:
-- Should return 3 functions
SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc
WHERE proname IN (
    'search_hms_knowledge',
    'search_hms_knowledge_frontier',
    'find_near_duplicates'
);

-- Should return all views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
AND table_name IN ('kb_sources', 'kb_health', 'kb_entity_coverage');

-- Should show chunk_type distribution
SELECT * FROM kb_health;
