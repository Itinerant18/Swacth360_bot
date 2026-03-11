import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET — List all users from the active_users view (for admin)
export async function GET() {
    const supabase = getSupabase();

    try {
        const { data: activeUsers, error } = await supabase
            .from('active_users')
            .select('*')
            .order('last_chat', { ascending: false, nullsFirst: false });

        if (error) throw error;

        // Map it to fit the interface expected by the Admin dashboard
        const enrichedUsers = (activeUsers || []).map((u: { id: string; email: string; total_chats: number; created_at?: string; last_sign_in_at?: string; last_chat?: string }) => ({
            id: u.id,
            name: u.email.split('@')[0],
            email: u.email,
            phone: 'N/A', // Deprecated in favor of email
            queryCount: u.total_chats || 0,
            created_at: u.created_at || u.last_sign_in_at,
            lastActive: u.last_chat || u.last_sign_in_at,
        }));

        return NextResponse.json({ users: enrichedUsers });
    } catch (err: unknown) {
        console.error('❌ Users list error:', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}

