-- ============================================================
-- MIGRATION 027 - Observability Logs for AI Assistant
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_logs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id           TEXT NOT NULL,
    query                TEXT NOT NULL,
    rewritten_query      TEXT,
    intent               TEXT,
    retrieved_chunks     JSONB DEFAULT '[]'::jsonb,
    final_chunks         JSONB DEFAULT '[]'::jsonb,
    confidence           FLOAT DEFAULT 0,
    response_time_ms     FLOAT DEFAULT 0,
    success              BOOLEAN DEFAULT true,
    fallback_triggered   BOOLEAN DEFAULT false,
    cache_source         TEXT DEFAULT 'none',
    hyde_used            BOOLEAN DEFAULT false,
    query_expansion_used BOOLEAN DEFAULT false,
    llm_calls            INTEGER DEFAULT 0,
    error                TEXT,
    created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS failures (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  TEXT,
    query       TEXT NOT NULL,
    reason      TEXT NOT NULL,
    confidence  FLOAT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx
    ON chat_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS chat_logs_request_id_idx
    ON chat_logs (request_id);
CREATE INDEX IF NOT EXISTS chat_logs_confidence_idx
    ON chat_logs (confidence);
CREATE INDEX IF NOT EXISTS chat_logs_success_idx
    ON chat_logs (success, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_logs_cache_source_idx
    ON chat_logs (cache_source, created_at DESC);

CREATE INDEX IF NOT EXISTS failures_created_at_idx
    ON failures (created_at DESC);
CREATE INDEX IF NOT EXISTS failures_reason_idx
    ON failures (reason);

ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role chat_logs" ON chat_logs;
CREATE POLICY "Allow service role chat_logs"
    ON chat_logs FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role failures" ON failures;
CREATE POLICY "Allow service role failures"
    ON failures FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE OR REPLACE VIEW chat_logs_summary AS
SELECT
    COUNT(*) AS total_requests,
    ROUND(AVG(response_time_ms)::numeric, 2) AS avg_latency_ms,
    ROUND(AVG(confidence)::numeric, 3) AS avg_confidence,
    COUNT(*) FILTER (WHERE success = false) AS failed_requests,
    COUNT(*) FILTER (WHERE fallback_triggered = true) AS fallback_requests,
    COUNT(*) FILTER (WHERE cache_source <> 'none') AS cache_hits,
    COUNT(*) FILTER (WHERE hyde_used = true) AS hyde_requests,
    COUNT(*) FILTER (WHERE query_expansion_used = true) AS expansion_requests
FROM chat_logs;

CREATE OR REPLACE VIEW failures_summary AS
SELECT
    reason,
    COUNT(*) AS total_failures,
    MAX(created_at) AS last_seen
FROM failures
GROUP BY reason
ORDER BY total_failures DESC, last_seen DESC;
