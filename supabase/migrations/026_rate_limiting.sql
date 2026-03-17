-- ============================================================
-- MIGRATION 026 - Rate Limiting & Token Budget Tracking
-- ============================================================
-- Tracks per-user token usage for budget enforcement.
-- The actual rate limiting happens in-memory/Redis (rate-limiter.ts),
-- but this table provides persistent token budget tracking.

CREATE TABLE IF NOT EXISTS token_usage (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    ip_address  TEXT,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 1,
    period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', NOW()),
    period_end   TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', NOW()) + INTERVAL '1 day',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS token_usage_user_period_idx
    ON token_usage (user_id, period_start);
CREATE INDEX IF NOT EXISTS token_usage_ip_period_idx
    ON token_usage (ip_address, period_start);

ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role token_usage" ON token_usage;
CREATE POLICY "Allow service role token_usage"
    ON token_usage FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Upsert function: track token usage per user/IP per day
CREATE OR REPLACE FUNCTION track_token_usage(
    p_user_id UUID DEFAULT NULL,
    p_ip_address TEXT DEFAULT NULL,
    p_tokens INTEGER DEFAULT 0
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    today TIMESTAMPTZ := date_trunc('day', NOW());
    tomorrow TIMESTAMPTZ := today + INTERVAL '1 day';
BEGIN
    INSERT INTO token_usage (user_id, ip_address, tokens_used, request_count, period_start, period_end)
    VALUES (p_user_id, p_ip_address, p_tokens, 1, today, tomorrow)
    ON CONFLICT ON CONSTRAINT token_usage_unique_period
    DO UPDATE SET
        tokens_used = token_usage.tokens_used + p_tokens,
        request_count = token_usage.request_count + 1,
        updated_at = NOW();
END;
$$;

-- Unique constraint for upsert (one row per user/ip per day)
-- NULLS NOT DISTINCT ensures NULL user_id rows for same IP merge correctly
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'token_usage_unique_period'
    ) THEN
        ALTER TABLE token_usage
        ADD CONSTRAINT token_usage_unique_period
        UNIQUE NULLS NOT DISTINCT (user_id, ip_address, period_start);
    END IF;
END;
$$;

-- View for admin dashboard
CREATE OR REPLACE VIEW token_usage_summary AS
SELECT
    COALESCE(user_id::TEXT, ip_address, 'unknown') AS identifier,
    user_id IS NOT NULL AS is_authenticated,
    SUM(tokens_used) AS total_tokens,
    SUM(request_count) AS total_requests,
    MAX(updated_at) AS last_active,
    COUNT(DISTINCT period_start) AS active_days
FROM token_usage
WHERE period_start > NOW() - INTERVAL '30 days'
GROUP BY user_id, ip_address
ORDER BY total_tokens DESC;

-- Cleanup old token usage data (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_token_usage(older_than_days INT DEFAULT 90)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE deleted_count INT;
BEGIN
    DELETE FROM token_usage
    WHERE period_end < NOW() - (older_than_days || ' days')::INTERVAL;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
