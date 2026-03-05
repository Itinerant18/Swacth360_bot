-- ============================================================
-- MIGRATION 004 — Ingest Tracking + Source Management
-- Run in Supabase SQL Editor after 003_three_layer_modes.sql
-- ============================================================

-- 1. Add source_name to hms_knowledge if not already there
ALTER TABLE hms_knowledge
    ADD COLUMN IF NOT EXISTS source      TEXT DEFAULT 'json',
    ADD COLUMN IF NOT EXISTS source_name TEXT DEFAULT 'hms-dexter-qa.json';

-- 2. Create ingestion_log table — tracks every PDF/text ingestion
CREATE TABLE IF NOT EXISTS ingestion_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name   TEXT NOT NULL,                        -- e.g. "Anybus Manual v2.3"
    input_type    TEXT CHECK (input_type IN ('pdf', 'text', 'json', 'admin')),
    total_chunks  INT DEFAULT 0,
    success_count INT DEFAULT 0,
    error_count   INT DEFAULT 0,
    skip_count    INT DEFAULT 0,
    status        TEXT DEFAULT 'completed'
                  CHECK (status IN ('completed', 'failed', 'partial')),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    created_by    TEXT DEFAULT 'admin'
);

-- 3. RLS for ingestion_log (allow anon/service role access)
ALTER TABLE ingestion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service role ingestion_log" ON ingestion_log;
CREATE POLICY "Allow service role ingestion_log"
ON ingestion_log FOR ALL TO anon
USING (true) WITH CHECK (true);

-- 4. View: knowledge base composition by source
CREATE OR REPLACE VIEW kb_sources AS
SELECT
    source,
    source_name,
    COUNT(*)                                        AS entry_count,
    MAX(created_at)                                 AS last_updated,
    ROUND(AVG(LENGTH(answer))::numeric, 0)          AS avg_answer_length
FROM hms_knowledge
GROUP BY source, source_name
ORDER BY entry_count DESC;

COMMENT ON VIEW kb_sources IS
'Shows what content is in the knowledge base and where it came from.
 Use this to track which PDFs have been ingested and how many Q&A pairs each produced.';

-- 5. View: ingestion history
CREATE OR REPLACE VIEW ingestion_history AS
SELECT
    il.source_name,
    il.input_type,
    il.total_chunks,
    il.success_count,
    il.error_count,
    il.skip_count,
    il.status,
    il.created_at,
    COUNT(k.id) AS current_entries_in_kb   -- entries still in hms_knowledge from this source
FROM ingestion_log il
LEFT JOIN hms_knowledge k ON k.source_name = il.source_name
GROUP BY il.id, il.source_name, il.input_type, il.total_chunks,
         il.success_count, il.error_count, il.skip_count, il.status, il.created_at
ORDER BY il.created_at DESC;

-- 6. Index for fast source filtering
CREATE INDEX IF NOT EXISTS hms_knowledge_source_idx    ON hms_knowledge (source);
CREATE INDEX IF NOT EXISTS hms_knowledge_source_name_idx ON hms_knowledge (source_name);

-- 7. Update search function to include source_name in results
CREATE OR REPLACE FUNCTION search_hms_knowledge(
    query_embedding vector(768),
    similarity_threshold FLOAT DEFAULT 0.55,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id          TEXT,
    question    TEXT,
    answer      TEXT,
    category    TEXT,
    content     TEXT,
    source      TEXT,
    source_name TEXT,
    similarity  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        hms_knowledge.id,
        hms_knowledge.question,
        hms_knowledge.answer,
        hms_knowledge.category,
        hms_knowledge.content,
        hms_knowledge.source,
        hms_knowledge.source_name,
        1 - (hms_knowledge.embedding <=> query_embedding) AS similarity
    FROM hms_knowledge
    WHERE 1 - (hms_knowledge.embedding <=> query_embedding) > similarity_threshold
    ORDER BY hms_knowledge.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- ── How to use ──────────────────────────────────────────────
-- After admin uploads a PDF via the admin panel "Train Bot" tab,
-- entries will appear in hms_knowledge with source='pdf'.
-- Run these to inspect:
--
--   SELECT * FROM kb_sources;
--   SELECT * FROM ingestion_history ORDER BY created_at DESC LIMIT 10;
--   SELECT source, COUNT(*) FROM hms_knowledge GROUP BY source;