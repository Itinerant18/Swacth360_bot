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
const RAPTOR_STALLED_BUILD_MS = 30 * 60 * 1000;

type WaitUntilRequest = NextRequest & {
    waitUntil?: (promise: Promise<unknown>) => void;
};

function isStalledBuild(startedAt: string | null | undefined): boolean {
    if (!startedAt) {
        return false;
    }

    const startedAtMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) {
        return false;
    }

    return (Date.now() - startedAtMs) > RAPTOR_STALLED_BUILD_MS;
}

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

        let stalledBuildReset = false;
        if (runningBuild && !isStalledBuild(runningBuild.started_at)) {
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

        if (runningBuild && isStalledBuild(runningBuild.started_at)) {
            console.warn('[admin.raptor.post] resetting_stalled_build', runningBuild);
            const { error: resetError } = await supabase
                .from('raptor_build_log')
                .update({
                    status: 'failed',
                    error_msg: 'Marked stalled after exceeding 30 minutes.',
                    completed_at: new Date().toISOString(),
                })
                .eq('id', runningBuild.id)
                .eq('status', 'running');

            if (resetError) {
                throw new Error(`Failed to reset stalled RAPTOR build: ${resetError.message}`);
            }

            stalledBuildReset = true;
        }

        const { data: reservedBuild, error: reserveError } = await supabase
            .from('raptor_build_log')
            .insert({ triggered_by: 'manual', status: 'running' })
            .select('id, started_at')
            .single();

        if (reserveError) {
            if (reserveError.code === '23505') {
                const { data: activeBuild } = await supabase
                    .from('raptor_build_log')
                    .select('id, started_at')
                    .eq('status', 'running')
                    .order('started_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                return NextResponse.json(
                    {
                        success: false,
                        error: 'RAPTOR build already in progress',
                        runningBuild: activeBuild ?? null,
                    },
                    { status: 409 },
                );
            }

            throw new Error(`Failed to reserve RAPTOR build slot: ${reserveError.message}`);
        }

        if (!reservedBuild?.id) {
            throw new Error('Failed to reserve RAPTOR build slot');
        }

        const llm = getLLM('complex', { temperature: 0.1, maxTokens: RAPTOR_CONFIG_TOKENS });

        // Run build in background to prevent 504 timeouts
        const buildPromise = (async () => {
            try {
                const stats = await buildRaptorTree(llm, {
                    buildLogId: reservedBuild.id,
                    triggeredBy: 'manual',
                });
                console.info('[admin.raptor.post] background_success', stats);
            } catch (err) {
                console.error('[admin.raptor.post] background_error', err);
            }
        })();

        // Vercel / Next.js waitUntil support
        const requestWithWaitUntil = req as WaitUntilRequest;
        if (typeof requestWithWaitUntil.waitUntil === 'function') {
            requestWithWaitUntil.waitUntil(buildPromise);
        }

        return NextResponse.json({
            success: true,
            message: stalledBuildReset
                ? 'RAPTOR build started after resetting a stalled build'
                : 'RAPTOR build started in background',
            status: 'running',
            buildId: reservedBuild.id,
            stalledBuildReset,
        }, { status: 202 });
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
