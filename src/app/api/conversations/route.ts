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

        // Only return conversations that have been explicitly saved (title != null and not defaults)
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select(`
                id,
                title,
                created_at,
                updated_at,
                messages ( id )
            `)
            .neq('title', '')
            .neq('title', 'New Conversation')
            .neq('title', 'Untitled')
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching conversations:', error);
            return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
        }

        const result = (conversations ?? []).map((c: {
            id: string;
            title: string | null;
            created_at: string;
            updated_at: string;
            messages: { id: string }[] | { id: string } | null;
        }) => ({
            id: c.id,
            title: c.title,
            created_at: c.created_at,
            updated_at: c.updated_at,
            message_count: Array.isArray(c.messages) ? c.messages.length : (c.messages ? 1 : 0),
        }));

        return NextResponse.json(result);
    } catch (err) {
        console.error('Conversations API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
