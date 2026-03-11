/**
 * GET /api/conversations/[id]/messages
 *
 * Returns all messages for a conversation ordered chronologically.
 * Uses RLS — only accessible to the conversation owner.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/auth-server';

type MessageRow = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
};

type ChatSessionRow = {
    id: string;
    user_question: string | null;
    bot_answer: string | null;
    created_at: string;
};

function normalizeStoredMessages(messages: MessageRow[]) {
    return messages.map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
    }));
}

function buildRecoveredMessages(sessions: ChatSessionRow[]) {
    const recoveredMessages: MessageRow[] = [];

    for (const session of sessions) {
        if (session.user_question?.trim()) {
            recoveredMessages.push({
                id: `${session.id}:user`,
                role: 'user',
                content: session.user_question,
                created_at: session.created_at,
            });
        }

        if (session.bot_answer?.trim()) {
            recoveredMessages.push({
                id: `${session.id}:assistant`,
                role: 'assistant',
                content: session.bot_answer,
                created_at: session.created_at,
            });
        }
    }

    return recoveredMessages;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: conversation, error: conversationError } = await supabase
            .from('conversations')
            .select('id')
            .eq('id', id)
            .single();

        if (conversationError || !conversation) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
        }

        const { data: messages, error } = await supabase
            .from('messages')
            .select('id, role, content, created_at')
            .eq('conversation_id', id)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching messages:', error);
            return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
        }

        if ((messages?.length ?? 0) === 0) {
            const { data: sessions, error: sessionError } = await supabase
                .from('chat_sessions')
                .select('id, user_question, bot_answer, created_at')
                .eq('conversation_id', id)
                .order('created_at', { ascending: true });

            if (sessionError) {
                console.error('Error fetching chat session fallback:', sessionError);
            }

            const recoveredMessages = buildRecoveredMessages((sessions ?? []) as ChatSessionRow[]);

            if (recoveredMessages.length > 0) {
                // Best-effort repair so future resume/continuation reads from the canonical messages log.
                const rowsToInsert = recoveredMessages.map((message, index) => ({
                    conversation_id: id,
                    role: message.role,
                    content: message.content,
                    created_at: new Date(new Date(message.created_at).getTime() + index).toISOString(),
                }));

                const { error: insertError } = await supabase
                    .from('messages')
                    .insert(rowsToInsert);

                if (insertError) {
                    console.error('Error backfilling recovered messages:', insertError);
                }

                return NextResponse.json({
                    messages: normalizeStoredMessages(
                        recoveredMessages.map((message, index) => ({
                            ...message,
                            created_at: new Date(new Date(message.created_at).getTime() + index).toISOString(),
                        }))
                    ),
                    recoveredFromChatSessions: true,
                });
            }
        }

        return NextResponse.json({
            messages: normalizeStoredMessages((messages ?? []) as MessageRow[]),
            recoveredFromChatSessions: false,
        });
    } catch (err) {
        console.error('Messages API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
