-- ============================================================
-- MIGRATION 019 — Open Auth + Chat History
--
-- 1. Remove @seple.in domain restriction
-- 2. Create conversations + messages tables with RLS
-- 3. Auto-update trigger for conversation timestamps
-- 4. Link chat_sessions to conversations for analytics
-- 5. Update active_users view for any-domain support
-- ============================================================

-- ─── 1. Remove domain restriction ────────────────────────────
DROP TRIGGER IF EXISTS enforce_seple_domain_trigger ON auth.users;
DROP FUNCTION IF EXISTS enforce_seple_domain();

-- ─── 2a. Conversations table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL DEFAULT 'New Conversation',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversations_user_id_idx
    ON conversations (user_id, updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own conversations"
    ON conversations FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ─── 2b. Messages table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content          TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx
    ON messages (conversation_id, created_at ASC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own messages"
    ON messages FOR ALL
    TO authenticated
    USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    )
    WITH CHECK (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    );

-- ─── 3. Auto-update conversation timestamp on new message ────
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER messages_update_conversation_ts
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

-- ─── 4. Link chat_sessions to conversations ──────────────────
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL;

-- ─── 5. Update active_users view (remove domain filter) ──────
CREATE OR REPLACE VIEW active_users AS
SELECT
    u.id,
    u.email,
    u.last_sign_in_at,
    u.created_at,
    COUNT(DISTINCT c.id) AS total_conversations,
    COUNT(m.id) AS total_messages,
    MAX(m.created_at) AS last_message
FROM auth.users u
LEFT JOIN conversations c ON c.user_id = u.id
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY u.id, u.email, u.last_sign_in_at, u.created_at
ORDER BY last_message DESC NULLS LAST;
