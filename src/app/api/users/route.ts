import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// POST — Create or find existing user (upsert by email)
export async function POST(req: Request) {
    const supabase = getSupabase();

    try {
        const { name, phone, email } = await req.json();

        if (!name?.trim() || !phone?.trim() || !email?.trim()) {
            return NextResponse.json(
                { error: 'Name, phone, and email are required.' },
                { status: 400 }
            );
        }

        // Check if user already exists by email
        const { data: existing } = await supabase
            .from('users')
            .select('id, name, phone, email')
            .eq('email', email.trim().toLowerCase())
            .single();

        if (existing) {
            // Update name and phone if changed
            if (existing.name !== name.trim() || existing.phone !== phone.trim()) {
                await supabase
                    .from('users')
                    .update({ name: name.trim(), phone: phone.trim() })
                    .eq('id', existing.id);
            }
            return NextResponse.json({ user: { ...existing, name: name.trim(), phone: phone.trim() } });
        }

        // Create new user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim().toLowerCase(),
            })
            .select('id, name, phone, email')
            .single();

        if (error) {
            console.error('❌ User creation error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ user: newUser });
    } catch (err: any) {
        console.error('❌ Users API error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// GET — List all users with query counts (for admin)
export async function GET() {
    const supabase = getSupabase();

    try {
        // Get all users
        const { data: users, error } = await supabase
            .from('users')
            .select('id, name, phone, email, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Get query counts per user
        const { data: sessions } = await supabase
            .from('chat_sessions')
            .select('user_id, created_at');

        // Aggregate query counts and last active
        const userStats: Record<string, { queryCount: number; lastActive: string | null }> = {};
        sessions?.forEach((s: any) => {
            if (!s.user_id) return;
            if (!userStats[s.user_id]) {
                userStats[s.user_id] = { queryCount: 0, lastActive: null };
            }
            userStats[s.user_id].queryCount++;
            if (!userStats[s.user_id].lastActive || s.created_at > userStats[s.user_id].lastActive!) {
                userStats[s.user_id].lastActive = s.created_at;
            }
        });

        const enrichedUsers = (users || []).map((u: any) => ({
            ...u,
            queryCount: userStats[u.id]?.queryCount || 0,
            lastActive: userStats[u.id]?.lastActive || u.created_at,
        }));

        return NextResponse.json({ users: enrichedUsers });
    } catch (err: any) {
        console.error('❌ Users list error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
