CREATE TABLE IF NOT EXISTS rag_evals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text        TEXT NOT NULL,
  answer_text       TEXT,
  answer_mode       TEXT,
  match_count       INTEGER DEFAULT 0,
  latency_ms        FLOAT,
  faithfulness      FLOAT,
  answer_relevancy  FLOAT,
  context_recall    FLOAT,
  context_precision FLOAT,
  overall_score     FLOAT,
  has_flags         BOOLEAN DEFAULT false,
  flags             JSONB DEFAULT '[]',
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rag_evals_overall_score_idx ON rag_evals (overall_score);
CREATE INDEX IF NOT EXISTS rag_evals_answer_mode_idx ON rag_evals (answer_mode);
CREATE INDEX IF NOT EXISTS rag_evals_created_at_idx ON rag_evals (created_at DESC);

CREATE OR REPLACE VIEW eval_summary AS
SELECT
  answer_mode,
  COUNT(*) AS total_evals,
  ROUND(AVG(faithfulness)::numeric, 3)      AS avg_faithfulness,
  ROUND(AVG(answer_relevancy)::numeric, 3)  AS avg_relevancy,
  ROUND(AVG(context_recall)::numeric, 3)    AS avg_recall,
  ROUND(AVG(context_precision)::numeric, 3) AS avg_precision,
  ROUND(AVG(overall_score)::numeric, 3)     AS avg_overall,
  ROUND(AVG(latency_ms)::numeric, 0)        AS avg_latency_ms,
  COUNT(*) FILTER (WHERE has_flags = true)  AS flagged_count
FROM rag_evals
GROUP BY answer_mode
ORDER BY total_evals DESC;
