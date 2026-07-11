-- ============================================================
-- MIGRATION 032 - Add knowledge_id column to messages and cache
-- ============================================================

-- 1. Add knowledge_id column to public.messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS knowledge_id TEXT REFERENCES public.hms_knowledge(id) ON DELETE SET NULL;

-- 2. Add knowledge_id column to public.semantic_cache table
ALTER TABLE public.semantic_cache 
ADD COLUMN IF NOT EXISTS knowledge_id TEXT REFERENCES public.hms_knowledge(id) ON DELETE SET NULL;

-- 3. Recreate search_semantic_cache function to return knowledge_id
DROP FUNCTION IF EXISTS search_semantic_cache(vector, double precision, integer);
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
    hit_count   INTEGER,
    knowledge_id TEXT
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
        sc.hit_count,
        sc.knowledge_id
    FROM semantic_cache sc
    WHERE (1 - (sc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY sc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
