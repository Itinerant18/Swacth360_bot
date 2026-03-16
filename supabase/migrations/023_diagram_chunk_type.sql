-- ============================================================
-- MIGRATION 023 — Diagram Chunk Type Support
-- ============================================================

-- 1. Drop existing chunk_type CHECK constraint
ALTER TABLE hms_knowledge
    DROP CONSTRAINT IF EXISTS hms_knowledge_chunk_type_check;

-- 2. Re-add with 'diagram' included
ALTER TABLE hms_knowledge
    ADD CONSTRAINT hms_knowledge_chunk_type_check
    CHECK (chunk_type IN ('chunk', 'proposition', 'image', 'qa', 'diagram'));

-- 3. Add diagram_source column to track which pipeline created it
ALTER TABLE hms_knowledge
    ADD COLUMN IF NOT EXISTS diagram_source TEXT
    CHECK (diagram_source IN ('manual', 'admin', 'pdf_image'));

-- 4. Index for fast diagram retrieval
CREATE INDEX IF NOT EXISTS hms_knowledge_diagram_idx
    ON hms_knowledge (chunk_type)
    WHERE chunk_type = 'diagram';

-- 5. View: diagram inventory for admin dashboard
CREATE OR REPLACE VIEW diagram_inventory AS
SELECT
    id,
    question                        AS diagram_title,
    subcategory                     AS diagram_type,
    diagram_source,
    source_name,
    LENGTH(answer)                  AS markdown_length,
    COALESCE(usage_count, 0)        AS times_served,
    created_at
FROM hms_knowledge
WHERE chunk_type = 'diagram'
ORDER BY created_at DESC;

SELECT 'Migration 023 complete!' AS status;
