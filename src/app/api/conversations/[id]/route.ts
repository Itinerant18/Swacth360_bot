/**
 * /api/conversations/[id]
 *
 * PATCH  — Rename / save a conversation (set title)
 * DELETE — Delete a conversation. Messages cascade-delete via FK.
 *
 * Uses RLS — only the conversation owner can modify/delete.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/auth-server';

// ─── PATCH — Save/rename a conversation ──────────────────────
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createServerSupabaseClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const title = typeof body.title === 'string' ? body.title.trim() : '';

        if (!title || title.length < 1) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('conversations')
            .update({ title: title.slice(0, 120) })
            .eq('id', id);

        if (error) {
            console.error('Error renaming conversation:', error);
            return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 });
        }

        return NextResponse.json({ success: true, title: title.slice(0, 120) });
    } catch (err) {
        console.error('Rename conversation error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// ─── DELETE — Delete a conversation ──────────────────────────
export async function DELETE(
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

        const { error } = await supabase
            .from('conversations')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting conversation:', error);
            return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('Delete conversation error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
