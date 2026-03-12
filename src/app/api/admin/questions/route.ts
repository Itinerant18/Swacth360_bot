import dns from 'node:dns';
import { getSupabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

dns.setDefaultResultOrder('ipv4first');

const TIMEOUT_MS = 5000;
const VALID_STATUSES = new Set(['pending', 'reviewed', 'dismissed']);

// GET - List unknown questions
export async function GET(req: NextRequest) {
    try {
        const status = req.nextUrl.searchParams.get('status') || 'pending';
        console.info('[admin.questions] request', { status });

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
            console.warn('[admin.questions] query_error', { status, message: error.message });
            return NextResponse.json({ questions: [], offline: true });
        }

        console.info('[admin.questions] success', { status, count: data?.length || 0 });
        return NextResponse.json({ questions: data || [] });
    } catch (err: unknown) {
        console.warn('[admin.questions] timeout', { message: (err as Error).message });
        return NextResponse.json({ questions: [], offline: true });
    }
}

// PATCH - Update question status (reviewed/dismissed)
export async function PATCH(req: NextRequest) {
    try {
        const { id, status } = await req.json();
        console.info('[admin.questions.patch] request', { id, status });

        if (!id || !status) {
            return NextResponse.json({ error: 'id and status required' }, { status: 400 });
        }
        if (!VALID_STATUSES.has(status)) {
            return NextResponse.json({ error: 'invalid status' }, { status: 400 });
        }

        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('unknown_questions')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) {
            return NextResponse.json({ error: 'question not found' }, { status: 404 });
        }

        console.info('[admin.questions.patch] success', { id, status });
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        console.error('[admin.questions.patch] error', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
