-- ============================================================
-- MIGRATION 021 - Weighted retrieval for route-aware chunk types
-- ============================================================

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
