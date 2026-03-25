/**
 * GET /api/conversations       — list saved conversations (title IS NOT NULL)
 * DELETE /api/conversations/[id] — see [id]/route.ts
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/auth-server';

export async function GET() {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Return all conversations that belong to the user
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select(`
                id,
                title,
                created_at,
                updated_at,
                messages ( id, content, role )
            `)
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching conversations:', error);
            return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
        }

        const result = (conversations ?? [])
            .filter((c: {
                messages: { id: string; content: string; role: string }[] | null;
            }) => {
                // Only show conversations that have at least 1 message
                return Array.isArray(c.messages) && c.messages.length > 0;
            })
            .map((c: {
                id: string;
                title: string | null;
                created_at: string;
                updated_at: string;
                messages: { id: string; content: string; role: string }[] | null;
            }) => {
                // Auto-generate title from first user message if title is empty/missing
                let displayTitle = c.title?.trim() || '';
                if (!displayTitle || displayTitle === 'New Conversation' || displayTitle === 'Untitled') {
                    const firstUserMsg = Array.isArray(c.messages)
                        ? c.messages.find(m => m.role === 'user')
                        : null;
                    if (firstUserMsg?.content) {
                        displayTitle = firstUserMsg.content.slice(0, 60).trim();
                        if (firstUserMsg.content.length > 60) displayTitle += '…';
                    } else {
                        displayTitle = 'New Chat';
                    }
                }

                return {
                    id: c.id,
                    title: displayTitle,
                    created_at: c.created_at,
                    updated_at: c.updated_at,
                    message_count: Array.isArray(c.messages) ? c.messages.length : 0,
                };
            });

        return NextResponse.json(result);
    } catch (err) {
        console.error('Conversations API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
