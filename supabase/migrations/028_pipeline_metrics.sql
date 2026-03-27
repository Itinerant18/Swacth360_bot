-- ============================================================
-- MIGRATION 028 - Pipeline Metrics for Admin Dashboard
-- ============================================================
-- Stores per-request pipeline performance data with stage-level
-- timing breakdown. Used by /api/admin/metrics for historical
-- performance analysis and cost savings tracking.

CREATE TABLE IF NOT EXISTS pipeline_metrics (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id             TEXT NOT NULL,
    total_latency_ms       FLOAT DEFAULT 0,
    stage_auth_ms          FLOAT,
    stage_translation_ms   FLOAT,
    stage_cache_ms         FLOAT,
    stage_embedding_ms     FLOAT,
    stage_retrieval_ms     FLOAT,
    stage_reranking_ms     FLOAT,
    stage_llm_ms           FLOAT,
    cache_hit              BOOLEAN DEFAULT false,
    cache_tier             SMALLINT,
    answer_mode            TEXT,
    confidence             FLOAT DEFAULT 0,
    match_count            INTEGER DEFAULT 0,
    hyde_used              BOOLEAN DEFAULT false,
    query_expansion_used   BOOLEAN DEFAULT false,
    error                  TEXT,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pipeline_metrics_created_at_idx
    ON pipeline_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_metrics_request_id_idx
    ON pipeline_metrics (request_id);
CREATE INDEX IF NOT EXISTS pipeline_metrics_answer_mode_idx
    ON pipeline_metrics (answer_mode, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_metrics_cache_hit_idx
    ON pipeline_metrics (cache_hit, created_at DESC);

ALTER TABLE pipeline_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role pipeline_metrics" ON pipeline_metrics;
CREATE POLICY "Allow service role pipeline_metrics"
    ON pipeline_metrics FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);
