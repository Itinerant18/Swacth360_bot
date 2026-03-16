import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET - List all users from the active_users view (for admin)
export async function GET() {
    const supabase = getSupabase();
    console.info('[admin.users] request');

    try {
        const { data: activeUsers, error } = await supabase
            .from('active_users')
            .select('*');

        if (error) throw error;

        const enrichedUsers = (activeUsers || []).map((u: {
            id: string;
            email: string;
            full_name?: string;
            phone?: string;
            total_chats?: number;
            total_conversations?: number;
            created_at?: string;
            last_sign_in_at?: string;
            last_chat?: string;
            last_message?: string;
        }) => ({
            id: u.id,
            name: u.full_name?.trim() || (u.email || '').split('@')[0],
            email: u.email,
            phone: u.phone?.trim() || 'N/A',
            queryCount: u.total_conversations || u.total_chats || 0,
            created_at: u.created_at || u.last_sign_in_at,
            lastActive: u.last_message || u.last_chat || u.last_sign_in_at,
        }))
            .sort((a, b) => {
                const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
                const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
                return bTime - aTime;
            });

        console.info('[admin.users] success', { count: enrichedUsers.length });
        return NextResponse.json({ users: enrichedUsers });
    } catch (err: unknown) {
        console.error('[admin.users] error', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
