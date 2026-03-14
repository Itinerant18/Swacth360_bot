-- ============================================================
-- MIGRATION 022 - Semantic Cache Table (Tier 2 Cache)
-- ============================================================

CREATE TABLE IF NOT EXISTS semantic_cache (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash   TEXT NOT NULL,
    query_text   TEXT NOT NULL,
    embedding    vector(1536) NOT NULL,
    answer       TEXT NOT NULL,
    answer_mode  TEXT,
    language     TEXT DEFAULT 'en',
    hit_count    INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    last_hit_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS semantic_cache_embedding_idx
    ON semantic_cache
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS semantic_cache_hash_idx
    ON semantic_cache (query_hash);

CREATE INDEX IF NOT EXISTS semantic_cache_created_at_idx
    ON semantic_cache (created_at);

ALTER TABLE semantic_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role semantic_cache" ON semantic_cache;
CREATE POLICY "Allow service role semantic_cache"
    ON semantic_cache FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

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

CREATE OR REPLACE FUNCTION increment_cache_hit(p_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE semantic_cache
    SET hit_count = hit_count + 1, last_hit_at = NOW()
    WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_semantic_cache(older_than_days INT DEFAULT 7)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE deleted_count INT;
BEGIN
    DELETE FROM semantic_cache
    WHERE created_at < NOW() - (older_than_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION invalidate_cache_entry(p_query_hash TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM semantic_cache WHERE query_hash = p_query_hash;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE VIEW semantic_cache_stats AS
SELECT
    COUNT(*)                                        AS total_entries,
    SUM(hit_count)                                  AS total_hits,
    ROUND(AVG(hit_count)::numeric, 2)               AS avg_hits_per_entry,
    MAX(hit_count)                                  AS max_hits,
    COUNT(*) FILTER (WHERE hit_count = 0)           AS never_hit_entries,
    COUNT(*) FILTER (
        WHERE created_at > NOW() - INTERVAL '24 hours'
    )                                               AS added_last_24h,
    MAX(created_at)                                 AS newest_entry,
    MIN(created_at)                                 AS oldest_entry
FROM semantic_cache;
