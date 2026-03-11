/**
 * GET /api/conversations
 *
 * Returns the authenticated user's conversations ordered by most recent.
 * Uses the anon key + RLS (not service role) for security.
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

        // Fetch conversations with message counts and last message preview
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select(`
                id,
                title,
                created_at,
                updated_at,
                messages ( id )
            `)
            .order('updated_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error fetching conversations:', error);
            return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
        }

        // Transform: count messages and format
        const result = (conversations ?? []).map((c: any) => ({
            id: c.id,
            title: c.title,
            created_at: c.created_at,
            updated_at: c.updated_at,
            message_count: c.messages?.length ?? 0,
        }));

        return NextResponse.json(result);
    } catch (err) {
        console.error('Conversations API error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
