-- ============================================================
-- MIGRATION 025 - Feedback-Driven Reranking
-- ============================================================
-- Stores aggregated feedback scores per KB entry.
-- Used by feedback-reranker.ts to boost/penalize entries based
-- on historical user feedback.
-- NOTE: hms_knowledge.id is TEXT, not UUID.

CREATE TABLE IF NOT EXISTS feedback_scores (
    knowledge_id  TEXT PRIMARY KEY REFERENCES hms_knowledge(id) ON DELETE CASCADE,
    score         FLOAT DEFAULT 0,
    positive_count INTEGER DEFAULT 0,
    negative_count INTEGER DEFAULT 0,
    last_feedback_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_scores_score_idx ON feedback_scores (score DESC);

-- Feedback log for analytics (individual feedback events)
CREATE TABLE IF NOT EXISTS feedback_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_id  TEXT REFERENCES hms_knowledge(id) ON DELETE SET NULL,
    query_text    TEXT,
    is_positive   BOOLEAN NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_log_created_at_idx ON feedback_log (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_log_knowledge_id_idx ON feedback_log (knowledge_id);

-- RLS
ALTER TABLE feedback_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role feedback_scores" ON feedback_scores;
CREATE POLICY "Allow service role feedback_scores"
    ON feedback_scores FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role feedback_log" ON feedback_log;
CREATE POLICY "Allow service role feedback_log"
    ON feedback_log FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- Upsert function: increment or decrement score, apply time decay
CREATE OR REPLACE FUNCTION upsert_feedback_score(
    p_knowledge_id TEXT,
    p_delta INT,
    p_query_text TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    decay_factor FLOAT := 0.95;
BEGIN
    -- Apply time decay to existing score, then add delta
    INSERT INTO feedback_scores (knowledge_id, score, positive_count, negative_count, last_feedback_at)
    VALUES (
        p_knowledge_id,
        p_delta,
        CASE WHEN p_delta > 0 THEN 1 ELSE 0 END,
        CASE WHEN p_delta < 0 THEN 1 ELSE 0 END,
        NOW()
    )
    ON CONFLICT (knowledge_id) DO UPDATE SET
        score = (feedback_scores.score * decay_factor) + p_delta,
        positive_count = feedback_scores.positive_count + CASE WHEN p_delta > 0 THEN 1 ELSE 0 END,
        negative_count = feedback_scores.negative_count + CASE WHEN p_delta < 0 THEN 1 ELSE 0 END,
        last_feedback_at = NOW(),
        updated_at = NOW();

    -- Log the feedback event
    INSERT INTO feedback_log (knowledge_id, query_text, is_positive)
    VALUES (p_knowledge_id, p_query_text, p_delta > 0);
END;
$$;

-- View for admin dashboard
CREATE OR REPLACE VIEW feedback_summary AS
SELECT
    fs.knowledge_id,
    hk.question,
    hk.category,
    fs.score,
    fs.positive_count,
    fs.negative_count,
    fs.last_feedback_at,
    CASE
        WHEN fs.score > 2 THEN 'highly_rated'
        WHEN fs.score > 0 THEN 'positive'
        WHEN fs.score = 0 THEN 'neutral'
        WHEN fs.score > -2 THEN 'negative'
        ELSE 'poorly_rated'
    END AS rating_tier
FROM feedback_scores fs
JOIN hms_knowledge hk ON hk.id = fs.knowledge_id
ORDER BY fs.score DESC;
