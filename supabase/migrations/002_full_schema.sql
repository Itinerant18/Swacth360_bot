-- ============================================================
-- DEXTER HMS BOT v2 — PHASE 2 MIGRATION
-- Run after 001_setup_pgvector.sql
-- ============================================================

-- 1. Add source columns to hms_knowledge (for PDF vs JSON distinction)
ALTER TABLE hms_knowledge
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'json',        -- 'json' or 'pdf'
    ADD COLUMN IF NOT EXISTS source_name TEXT DEFAULT 'hms-dexter-qa.json';

-- 2. Create unknown_questions table
CREATE TABLE IF NOT EXISTS unknown_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_question   TEXT NOT NULL,              -- original Bengali question
    english_text    TEXT NOT NULL,              -- translated English
    top_similarity  FLOAT DEFAULT 0,
    frequency       INT DEFAULT 1,
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    admin_answer    TEXT,                       -- answer written by admin
    category        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Upsert function for deduplication — same English question bumps frequency
CREATE OR REPLACE FUNCTION upsert_unknown_question(
    p_user_question TEXT,
    p_english_text TEXT,
    p_top_similarity FLOAT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO unknown_questions (user_question, english_text, top_similarity, frequency)
    VALUES (p_user_question, p_english_text, p_top_similarity, 1)
    ON CONFLICT ON CONSTRAINT unknown_questions_english_unique
    DO UPDATE SET
        frequency = unknown_questions.frequency + 1,
        top_similarity = GREATEST(unknown_questions.top_similarity, EXCLUDED.top_similarity),
        updated_at = NOW();
END;
$$;

-- 4. Add uniqueness constraint on english_text for dedup
ALTER TABLE unknown_questions
    DROP CONSTRAINT IF EXISTS unknown_questions_english_unique;
ALTER TABLE unknown_questions
    ADD CONSTRAINT unknown_questions_english_unique UNIQUE (english_text);

-- 5. Fix chat_sessions — drop and recreate with all required columns
DROP TABLE IF EXISTS chat_sessions;
CREATE TABLE chat_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_question       TEXT NOT NULL,
    english_translation TEXT,
    answer_mode         TEXT CHECK (answer_mode IN ('rag', 'general')),
    top_similarity      FLOAT,
    bot_answer          TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RLS policies for anon access (since we use anon key)
ALTER TABLE unknown_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon unknown_questions" ON unknown_questions;
CREATE POLICY "Allow anon unknown_questions"
ON unknown_questions FOR ALL TO anon
USING (true) WITH CHECK (true);

-- Re-apply RLS on recreated chat_sessions
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon chat_sessions" ON chat_sessions;
CREATE POLICY "Allow anon chat_sessions"
ON chat_sessions FOR ALL TO anon
USING (true) WITH CHECK (true);
