-- ============================================================
-- MIGRATION 014 — Auth: Domain Restriction (@seple.in only)
--
-- Run in Supabase SQL Editor after 013_enhanced_rag.sql
-- ============================================================

-- 1. Enable email auth in Supabase (already on by default, but ensure OTP is on)
--    This is configured in Dashboard → Auth → Providers → Email
--    Make sure "Enable Email OTP" is ON and "Confirm Email" is ON.

-- 2. Add user_id FK to chat_sessions for linking sessions to users
ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_sessions_user_id_idx ON chat_sessions (user_id);

-- 3. Add user_id FK to unknown_questions
ALTER TABLE unknown_questions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. RLS: chat_sessions — users can only see their own sessions
--    (Admin can still see all via service role key)
DROP POLICY IF EXISTS "Allow anon chat_sessions" ON chat_sessions;

CREATE POLICY "Users see own sessions"
ON chat_sessions FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users insert own sessions"
ON chat_sessions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Still allow anon reads for backward compat (chat API uses anon key)
CREATE POLICY "Allow anon read chat_sessions"
ON chat_sessions FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert chat_sessions"
ON chat_sessions FOR INSERT TO anon WITH CHECK (true);

-- 5. Enforce domain restriction via DB hook (belt + suspenders)
--    This fires on every signup and blocks non-seple.in emails at DB level.
CREATE OR REPLACE FUNCTION enforce_seple_domain()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.email NOT LIKE '%@seple.in' THEN
        RAISE EXCEPTION 'Only @seple.in email addresses are permitted';
    END IF;
    RETURN NEW;
END;
$$;

-- Attach trigger to auth.users (fires before insert)
DROP TRIGGER IF EXISTS enforce_seple_domain_trigger ON auth.users;
CREATE TRIGGER enforce_seple_domain_trigger
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION enforce_seple_domain();

-- 6. View: active users (admin dashboard use)
CREATE OR REPLACE VIEW active_users AS
SELECT
    u.id,
    u.email,
    u.last_sign_in_at,
    u.created_at,
    COUNT(cs.id) AS total_chats,
    MAX(cs.created_at) AS last_chat
FROM auth.users u
LEFT JOIN chat_sessions cs ON cs.user_id = u.id
WHERE u.email LIKE '%@seple.in'
GROUP BY u.id, u.email, u.last_sign_in_at, u.created_at
ORDER BY last_chat DESC NULLS LAST;

-- ── Verification ──────────────────────────────────────────────
-- Check trigger exists:
--   SELECT trigger_name, event_object_schema, event_object_table
--   FROM information_schema.triggers
--   WHERE trigger_name = 'enforce_seple_domain_trigger';
--
-- Test the trigger (should fail):
--   INSERT INTO auth.users (email, encrypted_password)
--   VALUES ('outsider@gmail.com', '');
--   -- Expected: ERROR: Only @seple.in email addresses are permitted
