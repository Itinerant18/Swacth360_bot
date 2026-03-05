-- ============================================================
-- MIGRATION 005 — Upgrade vector dimensions: 768 → 1536
--
-- Run this BEFORE switching to OpenAI embeddings.
-- Required because nomic-embed-text = 768 dims,
--                   OpenAI text-embedding-3-small = 1536 dims.
--
-- ⚠️  This DROPS all existing embeddings.
--     After running this, re-seed with:
--     npx tsx scripts/clear.ts
--     npx tsx scripts/seed-supabase.ts
-- ============================================================

-- 1. Drop the IVFFlat index (must be done before changing column type)
DROP INDEX IF EXISTS hms_knowledge_embedding_idx;

-- 2. Drop the old 768-dim embedding column
ALTER TABLE hms_knowledge DROP COLUMN IF EXISTS embedding;

-- 3. Add new 1536-dim embedding column (OpenAI text-embedding-3-small)
ALTER TABLE hms_knowledge ADD COLUMN embedding vector(1536);

-- 4. Rebuild the IVFFlat index for the new dimensions
--    lists=100 is better for larger datasets (>500 entries)
CREATE INDEX hms_knowledge_embedding_idx
    ON hms_knowledge
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- 5. Drop old function first (required because parameter types change)
DROP FUNCTION IF EXISTS search_hms_knowledge(vector, double precision, integer);

-- 6. Recreate the search function for new dimensions
CREATE OR REPLACE FUNCTION search_hms_knowledge(
    query_embedding vector(1536),     -- changed from vector(768)
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

-- ── Verify the change ──────────────────────────────────────────
-- Run this after migration to confirm:
--
--   SELECT column_name, data_type, udt_name
--   FROM information_schema.columns
--   WHERE table_name = 'hms_knowledge' AND column_name = 'embedding';
--
-- Should show: udt_name = 'vector' and dimension = 1536
-- ──────────────────────────────────────────────────────────────

-- ── What to do after this migration ───────────────────────────
-- 1. Add OPENAI_API_KEY to .env.local
-- 2. Remove OLLAMA_BASE_URL from .env.local (no longer needed)
-- 3. Replace scripts/seed-supabase.ts  → seed-supabase-openai.ts
-- 4. Replace scripts/ingest-pdf.ts     → ingest-pdf-openai.ts
-- 5. Replace src/lib/embeddings.ts     → embeddings.ts (OpenAI version)
-- 6. Replace src/app/api/chat/route.ts → chat-route-openai.ts
-- 7. Run: npx tsx scripts/clear.ts
-- 8. Run: npx tsx scripts/seed-supabase.ts
-- ──────────────────────────────────────────────────────────────