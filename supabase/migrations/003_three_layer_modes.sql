-- ============================================================
-- MIGRATION 003 — Support 3-layer answer modes
-- Run in Supabase SQL Editor
-- ============================================================

-- Update chat_sessions to allow 'partial' answer mode
ALTER TABLE chat_sessions
  DROP CONSTRAINT IF EXISTS chat_sessions_answer_mode_check;

ALTER TABLE chat_sessions
  ADD CONSTRAINT chat_sessions_answer_mode_check
  CHECK (answer_mode IN ('rag', 'partial', 'general'));

-- Add a column to track whether user got escalated to human support
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS was_escalated BOOLEAN DEFAULT FALSE;

-- Add a view for quick insight into which questions are falling through
CREATE OR REPLACE VIEW answer_mode_summary AS
SELECT
  answer_mode,
  COUNT(*)                            AS total,
  ROUND(AVG(top_similarity)::numeric, 3) AS avg_similarity,
  ROUND(MIN(top_similarity)::numeric, 3) AS min_similarity,
  DATE_TRUNC('day', created_at)       AS day
FROM chat_sessions
GROUP BY answer_mode, DATE_TRUNC('day', created_at)
ORDER BY day DESC, total DESC;

-- Comment for clarity
COMMENT ON VIEW answer_mode_summary IS
  'Shows daily breakdown of RAG vs partial vs general answers and avg similarity scores.
   If general% is rising, your knowledge base needs more entries.
   If partial% is high, those topics are under-covered in hms-dexter-qa.json.';
