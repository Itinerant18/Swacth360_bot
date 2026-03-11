/**
 * DELETE /api/conversations/[id]
 *
 * Delete a conversation. Messages cascade-delete via FK.
 * Uses RLS — only the conversation owner can delete.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/auth-server';

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
