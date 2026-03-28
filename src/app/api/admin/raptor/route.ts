/**
 * src/app/api/admin/raptor/route.ts
 *
 * Admin API for RAPTOR tree management.
 *
 * POST /api/admin/raptor -> trigger a full tree rebuild
 * GET  /api/admin/raptor -> get build status + health stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildRaptorTree, RaptorBuildInProgressError } from '@/lib/raptor-builder';
import { getSupabase } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';
import { getLLM } from '@/lib/llm';

const RAPTOR_CONFIG_TOKENS = 300;

export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    void req;
    try {
        console.info('[admin.raptor.post] request');
        const supabase = getSupabase();
        const { data: runningBuild } = await supabase
            .from('raptor_build_log')
            .select('id, started_at')
            .eq('status', 'running')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (runningBuild) {
            console.warn('[admin.raptor.post] running_build', runningBuild);
            return NextResponse.json(
                {
                    success: false,
                    error: 'RAPTOR build already in progress',
                    runningBuild,
                },
                { status: 409 }
            );
        }

        const llm = getLLM('complex', { temperature: 0.1, maxTokens: 1024 });


        // This route remains synchronous so callers get final build stats.
        const start = Date.now();
        const stats = await buildRaptorTree(llm);
        const latencyMs = Date.now() - start;

        console.info('[admin.raptor.post] success', {
            latencyMs,
            ...stats,
        });

        return NextResponse.json({
            success: true,
            message: 'RAPTOR tree built successfully',
            stats,
            latencyMs,
        });
    } catch (err: unknown) {
        if (err instanceof RaptorBuildInProgressError) {
            console.warn('[admin.raptor.post] build_in_progress', { message: err.message });
            return NextResponse.json(
                { success: false, error: err.message },
                { status: 409 }
            );
        }
        console.error('[admin.raptor.post] error', err);
        return NextResponse.json(
            { success: false, error: (err as Error).message },
            { status: 500 }
        );
    }
}

export async function GET() {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    try {
        console.info('[admin.raptor.get] request');
        const supabase = getSupabase();

        const [healthRes, gapsRes, logRes] = await Promise.all([
            supabase.from('raptor_health').select('*'),
            supabase.from('raptor_coverage_gaps').select('*').limit(10),
            supabase.from('raptor_build_log').select('*').order('started_at', { ascending: false }).limit(5),
        ]);

        console.info('[admin.raptor.get] success', {
            healthCount: healthRes.data?.length ?? 0,
            gapCount: gapsRes.data?.length ?? 0,
            buildLogCount: logRes.data?.length ?? 0,
        });

        return NextResponse.json({
            health: healthRes.data ?? [],
            gaps: gapsRes.data ?? [],
            buildLog: logRes.data ?? [],
        });
    } catch (err: unknown) {
        console.error('[admin.raptor.get] error', err);
        return NextResponse.json(
            { success: false, error: (err as Error).message },
            { status: 500 }
        );
    }
}
