-- ============================================================
-- MIGRATION 011 — Advanced RAG Pipeline (Diversity & Recency)
-- 
-- Consolidates and enhances previous 011 attempts with:
-- 1. MMR-inspired diversity search (penalizing redundant sources)
-- 2. Time-based boosting (prioritizing recent documentation)
-- 3. KB usage tracking and management (archive/restore/cleanup)
-- 4. Deep analytics views for query performance and gaps
-- ============================================================

-- 1. CLEANUP PREVIOUS 011 ATTEMPTS (if any)
-- This ensures a clean slate for the definitive 011 migration.
DROP VIEW IF EXISTS kb_popular_entries CASCADE;
DROP VIEW IF EXISTS kb_query_analytics CASCADE;
DROP VIEW IF EXISTS kb_gaps CASCADE;
DROP VIEW IF EXISTS kb_query_performance CASCADE;
DROP VIEW IF EXISTS kb_source_efficiency CASCADE;
DROP VIEW IF EXISTS kb_discovery_gaps CASCADE;

DROP FUNCTION IF EXISTS search_hms_knowledge_mmr(vector(1536), float, int, float, int);
DROP FUNCTION IF EXISTS search_hms_knowledge_weighted(vector(1536), float, int, jsonb);
DROP FUNCTION IF EXISTS find_similar_entries(text, float, int);
DROP FUNCTION IF EXISTS record_knowledge_access(text);
DROP FUNCTION IF EXISTS archive_knowledge_entry(text);
DROP FUNCTION IF EXISTS restore_knowledge_entry(text);
DROP FUNCTION IF EXISTS bulk_archive_old_entries(int, text);
DROP FUNCTION IF EXISTS log_kb_query(text, vector(1536), int, float, text, int);

-- 2. ENHANCE KNOWLEDGE BASE TABLE
-- Track usage and state for better management.
ALTER TABLE hms_knowledge 
    ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS usage_count INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Ensure existing data has access tracking
UPDATE hms_knowledge SET last_accessed_at = created_at WHERE last_accessed_at IS NULL;

-- 3. CREATE QUERY PERFORMANCE LOG
-- Track every retrieval for deep analysis.
CREATE TABLE IF NOT EXISTS kb_query_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_text       TEXT NOT NULL,
    english_query    TEXT,
    top_similarity   FLOAT,
    matches_found    INT,
    answer_mode      TEXT,
    latency_ms       INT,
    user_id          TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for analytics
CREATE INDEX IF NOT EXISTS kb_query_log_created_at_idx ON kb_query_log (created_at DESC);
CREATE INDEX IF NOT EXISTS kb_query_log_answer_mode_idx ON kb_query_log (answer_mode);

-- 4. DIVERSIFIED MMR SEARCH (PRO-GRADE)
-- This function fetches top candidates and then applies a penalty
-- to results from the same source to ensure diversity in the answer.
--
-- MMR Approximation: score = similarity - (source_occurrence * mmr_lambda)
CREATE OR REPLACE FUNCTION search_hms_knowledge_mmr(
    query_embedding      vector(1536),
    similarity_threshold FLOAT DEFAULT 0.20,
    match_count          INT   DEFAULT 8,
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
            -- Recency boost: newer entries get up to X% bonus
            (1 + (recency_boost * EXP(- (EXTRACT(EPOCH FROM (NOW() - k.created_at)) / (86400 * 30))::FLOAT)))::FLOAT AS recency_factor
        FROM hms_knowledge k
        WHERE k.embedding IS NOT NULL
          AND k.is_archived = FALSE
          AND (1 - (k.embedding <=> query_embedding)) > similarity_threshold
        ORDER BY k.embedding <=> query_embedding
        LIMIT 30 -- Fetch a larger pool for diversification
    ),
    ranked AS (
        SELECT 
            c.*,
            ROW_NUMBER() OVER (PARTITION BY c.source_name ORDER BY c.similarity DESC) AS source_rank
        FROM candidates c
    )
    SELECT 
        r.id, r.question, r.answer, r.category, r.subcategory,
        r.content, r.source, r.source_name, r.chunk_type, r.entities,
        r.similarity,
        -- Final Score = (similarity * recency) - (source redundancy penalty)
        (r.similarity * r.recency_factor - (r.source_rank - 1) * mmr_lambda)::FLOAT AS final_score,
        r.source_rank::INT
    FROM ranked r
    ORDER BY final_score DESC
    LIMIT match_count;
END;
$$;

-- 5. KNOWLEDGE BASE MANAGEMENT TOOLS
-- Functions for admins to maintain the KB health.

-- Track usage
CREATE OR REPLACE FUNCTION record_knowledge_access(p_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE hms_knowledge 
    SET 
        last_accessed_at = NOW(),
        usage_count = usage_count + 1
    WHERE id = p_id;
END;
$$;

-- Manage entry state
CREATE OR REPLACE FUNCTION archive_knowledge_entry(p_id TEXT) 
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
    UPDATE hms_knowledge SET is_archived = TRUE WHERE id = p_id;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION restore_knowledge_entry(p_id TEXT) 
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
    UPDATE hms_knowledge SET is_archived = FALSE WHERE id = p_id;
    RETURN FOUND;
END;
$$;

-- Cleanup duplicates (Semantic Deduplication)
-- Marks entries as archived if they are nearly identical to another.
CREATE OR REPLACE FUNCTION cleanup_kb_duplicates(p_threshold FLOAT DEFAULT 0.98)
RETURNS TABLE (deleted_count INT)
LANGUAGE plpgsql AS $$
DECLARE
    cnt INT;
BEGIN
    WITH duplicates AS (
        SELECT k1.id as duplicate_id
        FROM hms_knowledge k1
        JOIN hms_knowledge k2 ON k1.id > k2.id -- avoid self-match and redundant pairs
        WHERE k1.embedding <=> k2.embedding < (1 - p_threshold)
          AND k1.is_archived = FALSE
          AND k2.is_archived = FALSE
    )
    UPDATE hms_knowledge 
    SET is_archived = TRUE 
    WHERE id IN (SELECT duplicate_id FROM duplicates);
    
    GET DIAGNOSTICS cnt = ROW_COUNT;
    RETURN QUERY SELECT cnt;
END;
$$;

-- 6. LOGGING HELPER
CREATE OR REPLACE FUNCTION log_kb_query(
    p_query_text     TEXT,
    p_english_query  TEXT,
    p_top_similarity FLOAT,
    p_matches_found  INT,
    p_answer_mode    TEXT,
    p_latency_ms     INT,
    p_user_id        TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO kb_query_log (
        query_text, english_query, top_similarity, 
        matches_found, answer_mode, latency_ms, user_id
    ) VALUES (
        p_query_text, p_english_query, p_top_similarity,
        p_matches_found, p_answer_mode, p_latency_ms, p_user_id
    );
END;
$$;

-- 7. PERFORMANCE ANALYTICS VIEWS
-- Deep insights into how the RAG pipeline is performing.

-- Global performance metrics
CREATE OR REPLACE VIEW kb_query_performance AS
SELECT 
    DATE_TRUNC('hour', created_at) AS time_bucket,
    answer_mode,
    COUNT(*) AS query_count,
    ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0) AS p95_latency_ms,
    ROUND(AVG(top_similarity)::numeric, 3) AS avg_confidence,
    ROUND(AVG(matches_found)::numeric, 1) AS avg_sources_retrieved
FROM kb_query_log
GROUP BY 1, 2
ORDER BY 1 DESC;

-- Discovery Gaps (queries with low confidence)
CREATE OR REPLACE VIEW kb_discovery_gaps AS
SELECT 
    english_query AS problematic_query,
    COUNT(*) AS occurrence_count,
    ROUND(AVG(top_similarity)::numeric, 3) AS avg_confidence,
    MAX(created_at) AS last_seen
FROM kb_query_log
WHERE top_similarity < 0.35 -- matches that fell into 'general' mode
GROUP BY 1
HAVING COUNT(*) >= 2
ORDER BY 2 DESC
LIMIT 20;

-- Source Efficiency (which files are actually used)
CREATE OR REPLACE VIEW kb_source_efficiency AS
SELECT 
    source_name,
    category,
    COUNT(*) AS entry_count,
    SUM(usage_count) AS total_retrievals,
    ROUND(AVG(usage_count)::numeric, 1) AS avg_usage_per_chunk,
    MAX(last_accessed_at) AS last_used
FROM hms_knowledge
GROUP BY 1, 2
ORDER BY 4 DESC;

-- 8. VERIFICATION
SELECT proname FROM pg_proc WHERE proname IN (
    'search_hms_knowledge_mmr', 
    'cleanup_kb_duplicates',
    'record_knowledge_access',
    'log_kb_query'
);

SELECT table_name FROM information_schema.views 
WHERE table_name IN ('kb_query_performance', 'kb_discovery_gaps', 'kb_source_efficiency');
