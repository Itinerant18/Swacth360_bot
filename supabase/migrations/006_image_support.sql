
CREATE OR REPLACE VIEW kb_sources AS
SELECT
    source,
    source_name,
    COUNT(*)                                        AS entry_count,
    MAX(created_at)                                 AS last_updated,
    ROUND(AVG(LENGTH(answer))::numeric, 0)          AS avg_answer_length,
    CASE source
        WHEN 'json'      THEN '📚 JSON Knowledge Base'
        WHEN 'pdf'       THEN '📄 PDF Text Content'
        WHEN 'pdf_image' THEN '🖼️  PDF Visual Content (Diagrams)'
        WHEN 'admin'     THEN '👤 Admin Added'
        ELSE source
    END AS source_label
FROM hms_knowledge
GROUP BY source, source_name
ORDER BY entry_count DESC;

-- 3. Update chat_sessions to allow 'live' answer mode (ThingsBoard)
ALTER TABLE chat_sessions
    DROP CONSTRAINT IF EXISTS chat_sessions_answer_mode_check;

ALTER TABLE chat_sessions
    ADD CONSTRAINT chat_sessions_answer_mode_check
    CHECK (answer_mode IN ('rag', 'partial', 'general', 'live'));

-- 4. Index for fast subcategory filtering (useful for image content queries)
CREATE INDEX IF NOT EXISTS hms_knowledge_subcategory_idx
    ON hms_knowledge (subcategory);

-- ── Verify after running ──────────────────────────────────────
-- SELECT * FROM kb_sources;
-- Should now show pdf_image entries with 🖼️ label after PDF upload with images.
