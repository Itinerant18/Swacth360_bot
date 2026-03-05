-- ============================================================
-- MIGRATION 008 — Diagram Support in Analytics
-- Run in Supabase SQL Editor after 007_langextract_support.sql
-- ============================================================

-- 1. Update chat_sessions to allow 'diagram' answer mode
ALTER TABLE chat_sessions
    DROP CONSTRAINT IF EXISTS chat_sessions_answer_mode_check;

ALTER TABLE chat_sessions
    ADD CONSTRAINT chat_sessions_answer_mode_check
    CHECK (answer_mode IN ('rag', 'partial', 'general', 'live', 'diagram'));

-- 2. Add diagram_type column for tracking which diagram types are requested
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS diagram_type TEXT;

-- 3. View: diagram request analytics
CREATE OR REPLACE VIEW diagram_analytics AS
SELECT
    diagram_type,
    COUNT(*)                                        AS total_requests,
    ROUND(AVG(top_similarity)::numeric, 3)          AS avg_kb_relevance,
    DATE_TRUNC('day', created_at)                   AS day
FROM chat_sessions
WHERE answer_mode = 'diagram'
GROUP BY diagram_type, DATE_TRUNC('day', created_at)
ORDER BY day DESC, total_requests DESC;

COMMENT ON VIEW diagram_analytics IS
'Tracks which diagram types (wiring, power, network, panel, etc.) are most requested.
 avg_kb_relevance shows whether KB context was found (>0.5 = KB used, <0.5 = generic diagram).
 Use this to know which panel types to add PDF documentation for.';

-- 4. Update analytics answer_mode_summary view to include diagram mode
CREATE OR REPLACE VIEW answer_mode_summary AS
SELECT
    answer_mode,
    COUNT(*)                                        AS total,
    ROUND(AVG(top_similarity)::numeric, 3)          AS avg_similarity,
    ROUND(MIN(top_similarity)::numeric, 3)          AS min_similarity,
    DATE_TRUNC('day', created_at)                   AS day
FROM chat_sessions
GROUP BY answer_mode, DATE_TRUNC('day', created_at)
ORDER BY day DESC, total DESC;

-- ── Verify after running ──────────────────────────────────────
-- SELECT * FROM diagram_analytics;
-- SELECT answer_mode, COUNT(*) FROM chat_sessions GROUP BY answer_mode;
-- Should show 'diagram' as a valid answer_mode now.
