-- ============================================================
-- MIGRATION 024 — Fix active_users view
--
-- Join user_profiles to expose full_name and phone
-- alongside conversation/message counts.
-- ============================================================

DROP VIEW IF EXISTS active_users;
CREATE VIEW active_users AS
SELECT
    u.id,
    u.email,
    u.last_sign_in_at,
    u.created_at,
    COALESCE(p.full_name, '') AS full_name,
    COALESCE(p.phone, '')     AS phone,
    COUNT(DISTINCT c.id)      AS total_conversations,
    COUNT(m.id)               AS total_messages,
    MAX(m.created_at)         AS last_message
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
LEFT JOIN conversations c ON c.user_id = u.id
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY u.id, u.email, u.last_sign_in_at, u.created_at, p.full_name, p.phone
ORDER BY last_message DESC NULLS LAST;
