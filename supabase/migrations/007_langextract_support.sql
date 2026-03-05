-- ============================================================
-- MIGRATION 007 — Support langextract source type
-- Run in Supabase SQL Editor after 006_image_support.sql
-- ============================================================

-- 1. Update kb_sources view to include langextract label
CREATE OR REPLACE VIEW kb_sources AS
SELECT
    source,
    source_name,
    COUNT(*)                                        AS entry_count,
    MAX(created_at)                                 AS last_updated,
    ROUND(AVG(LENGTH(answer))::numeric, 0)          AS avg_answer_length,
    CASE source
        WHEN 'json'          THEN '📚 JSON Knowledge Base'
        WHEN 'pdf'           THEN '📄 PDF Text Content'
        WHEN 'pdf_image'     THEN '🖼️  PDF Visual Content (Diagrams)'
        WHEN 'admin'         THEN '👤 Admin Added'
        WHEN 'langextract'   THEN '🔬 LangExtract (Structured Entities)'
        ELSE source
    END AS source_label
FROM hms_knowledge
GROUP BY source, source_name
ORDER BY entry_count DESC;

-- 2. View that breaks down langextract entries by entity class (subcategory)
--    Subcategory stores: "Error Codes", "Wiring & Connections", etc.
CREATE OR REPLACE VIEW langextract_summary AS
SELECT
    source_name,
    subcategory                                     AS entity_type,
    COUNT(*)                                        AS count,
    MAX(created_at)                                 AS last_updated
FROM hms_knowledge
WHERE source = 'langextract'
GROUP BY source_name, subcategory
ORDER BY source_name, count DESC;

-- 3. Index for fast entity type filtering
CREATE INDEX IF NOT EXISTS hms_knowledge_langextract_idx
    ON hms_knowledge (source, subcategory)
    WHERE source = 'langextract';

-- ── Verify after running ──────────────────────────────────────
-- SELECT * FROM kb_sources;
-- SELECT * FROM langextract_summary;
-- Should show:
--   🔬 LangExtract entries for each PDF processed
--   Breakdown: Error Codes | Wiring & Connections | Technical Specifications | Procedures | Component Specifications
