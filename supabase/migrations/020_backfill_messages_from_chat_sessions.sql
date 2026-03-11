-- ============================================================
-- MIGRATION 020 - Backfill canonical messages from chat_sessions
--
-- Purpose:
-- 1. Repair legacy conversations that exist in conversations/chat_sessions
--    but have no rows in messages.
-- 2. Preserve chronological replay order for resume-conversation.
-- 3. Reset updated_at to the original last activity instead of NOW().
-- ============================================================

CREATE TEMP TABLE tmp_zero_message_conversations
ON COMMIT DROP
AS
SELECT c.id
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id
GROUP BY c.id
HAVING COUNT(m.id) = 0;

WITH session_rows AS (
    SELECT
        cs.conversation_id,
        cs.created_at,
        cs.user_question,
        cs.bot_answer
    FROM chat_sessions cs
    INNER JOIN tmp_zero_message_conversations zm
        ON zm.id = cs.conversation_id
    WHERE cs.conversation_id IS NOT NULL
),
rows_to_insert AS (
    SELECT
        gen_random_uuid() AS id,
        conversation_id,
        'user'::text AS role,
        user_question AS content,
        created_at AS created_at
    FROM session_rows
    WHERE user_question IS NOT NULL
      AND btrim(user_question) <> ''

    UNION ALL

    SELECT
        gen_random_uuid() AS id,
        conversation_id,
        'assistant'::text AS role,
        bot_answer AS content,
        created_at + INTERVAL '1 millisecond' AS created_at
    FROM session_rows
    WHERE bot_answer IS NOT NULL
      AND btrim(bot_answer) <> ''
)
INSERT INTO messages (id, conversation_id, role, content, created_at)
SELECT id, conversation_id, role, content, created_at
FROM rows_to_insert
ORDER BY conversation_id, created_at;

WITH repaired_conversations AS (
    SELECT
        cs.conversation_id,
        MAX(cs.created_at + INTERVAL '1 millisecond') AS last_activity_at
    FROM chat_sessions cs
    INNER JOIN tmp_zero_message_conversations zm
        ON zm.id = cs.conversation_id
    WHERE cs.conversation_id IS NOT NULL
    GROUP BY cs.conversation_id
)
UPDATE conversations c
SET updated_at = repaired_conversations.last_activity_at
FROM repaired_conversations
WHERE c.id = repaired_conversations.conversation_id;
