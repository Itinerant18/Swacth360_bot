-- ============================================================
-- SUPABASE SETUP FOR DEXTER HMS SUPPORT BOT
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the knowledge base table
CREATE TABLE IF NOT EXISTS hms_knowledge (
    id          TEXT PRIMARY KEY,               -- e.g. "qa_001"
    product     TEXT,
    category    TEXT,
    subcategory TEXT,
    tags        TEXT[],
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    embedding   vector(768),                    -- nomic-embed-text outputs 768 dims
    content     TEXT NOT NULL,                  -- full text used for embedding
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create an index for fast vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS hms_knowledge_embedding_idx
    ON hms_knowledge
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- 4. Create a function for similarity search
CREATE OR REPLACE FUNCTION search_hms_knowledge(
    query_embedding vector(768),
    similarity_threshold FLOAT DEFAULT 0.60,
    match_count INT DEFAULT 3
)
RETURNS TABLE (
    id          TEXT,
    question    TEXT,
    answer      TEXT,
    category    TEXT,
    content     TEXT,
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
        1 - (hms_knowledge.embedding <=> query_embedding) AS similarity
    FROM hms_knowledge
    WHERE 1 - (hms_knowledge.embedding <=> query_embedding) > similarity_threshold
    ORDER BY hms_knowledge.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 5. (Optional) Chat history table for analytics
CREATE TABLE IF NOT EXISTS chat_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_question   TEXT NOT NULL,              -- original Bengali
    english_translation TEXT,
    answer_mode     TEXT CHECK (answer_mode IN ('rag', 'general')),
    top_similarity  FLOAT,
    bot_answer      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);              