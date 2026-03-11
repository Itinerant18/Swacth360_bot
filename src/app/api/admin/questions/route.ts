import dns from 'node:dns';
import { getSupabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

dns.setDefaultResultOrder('ipv4first');

const TIMEOUT_MS = 5000;

// GET — List unknown questions
export async function GET(req: NextRequest) {
    try {
        const status = req.nextUrl.searchParams.get('status') || 'pending';
        console.log(`📋 Admin: Fetching ${status} questions...`);

        const supabase = getSupabase();

        const queryPromise = supabase
            .from('unknown_questions')
            .select('*')
            .eq('status', status)
            .order('frequency', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(50);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase timed out')), TIMEOUT_MS)
        );

        const { data, error } = await Promise.race([
            queryPromise,
            timeoutPromise,
        ]) as { data: unknown[] | null; error: Error | null };

        if (error) {
            console.warn('⚠️  Admin questions error:', error.message);
            return NextResponse.json({ questions: [], offline: true });
        }

        console.log(`✅ Found ${data?.length || 0} ${status} questions`);
        return NextResponse.json({ questions: data || [] });
    } catch (err: unknown) {
        console.warn('⚠️  Admin questions timeout:', (err as Error).message);
        return NextResponse.json({ questions: [], offline: true });
    }
}

// PATCH — Update question status (reviewed/dismissed)
export async function PATCH(req: NextRequest) {
    try {
        const supabase = getSupabase();
        const { id, status } = await req.json();

        if (!id || !status) {
            return NextResponse.json({ error: 'id and status required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('unknown_questions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
