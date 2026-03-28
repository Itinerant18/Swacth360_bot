-- ============================================================
-- MIGRATION 030 - Language-filtered semantic cache search
-- ============================================================

DROP FUNCTION IF EXISTS search_semantic_cache(vector(1536), float, int);
DROP FUNCTION IF EXISTS search_semantic_cache(vector(1536), float, int, text);

CREATE OR REPLACE FUNCTION search_semantic_cache(
    query_embedding  vector(1536),
    similarity_threshold FLOAT DEFAULT 0.90,
    match_count      INT DEFAULT 1,
    target_language  TEXT DEFAULT 'en'
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
    WHERE sc.language = COALESCE(target_language, sc.language)
      AND (1 - (sc.embedding <=> query_embedding)) >= similarity_threshold
    ORDER BY sc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
