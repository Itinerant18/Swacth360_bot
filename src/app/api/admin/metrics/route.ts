/**
 * Admin Pipeline Metrics API
 *
 * GET /api/admin/metrics — Returns aggregated pipeline performance data
 *    ?window=1h|24h|7d   — Time window (default: 24h)
 *    ?realtime=true      — Use in-memory buffer (faster, last 100 requests)
 */

import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { getRecentMetrics, computeAggregates } from '@/lib/pipelineMetrics';
import { requireAdmin } from '@/lib/admin-auth';

const WINDOWS: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
};

export async function GET(req: Request) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    try {
        const url = new URL(req.url);
        const window = url.searchParams.get('window') || '24h';
        const realtime = url.searchParams.get('realtime') === 'true';

        // Fast path: in-memory buffer for real-time dashboards
        if (realtime) {
            const recent = getRecentMetrics();
            const aggregates = computeAggregates(recent);
            return NextResponse.json({
                source: 'memory',
                window: `last ${recent.length} requests`,
                ...aggregates,
            });
        }

        // DB path: historical metrics
        const windowMs = WINDOWS[window] ?? WINDOWS['24h'];
        const since = new Date(Date.now() - windowMs).toISOString();

        const supabase = getSupabase();
        const { data: rows, error } = await supabase
            .from('pipeline_metrics')
            .select('*')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1000);

        if (error) {
            console.warn('[admin.metrics] DB query failed, falling back to memory buffer:', error.message);
            const recent = getRecentMetrics();
            const aggregates = computeAggregates(recent);
            return NextResponse.json({
                source: 'memory',
                window: `last ${recent.length} requests (DB unavailable)`,
                ...aggregates,
            });
        }

        const metrics = (rows || []).map((row: Record<string, unknown>) => ({
            requestId: row.request_id as string,
            totalLatencyMs: Number(row.total_latency_ms),
            stages: {
                auth: Number(row.stage_auth_ms ?? 0),
                translation: Number(row.stage_translation_ms ?? 0),
                cacheCheck: Number(row.stage_cache_ms ?? 0),
                embedding: Number(row.stage_embedding_ms ?? 0),
                retrieval: Number(row.stage_retrieval_ms ?? 0),
                reranking: Number(row.stage_reranking_ms ?? 0),
                llmGeneration: Number(row.stage_llm_ms ?? 0),
            },
            cacheHit: row.cache_hit as boolean,
            cacheTier: row.cache_tier as 1 | 2 | null,
            answerMode: row.answer_mode as string,
            confidence: Number(row.confidence ?? 0),
            matchCount: Number(row.match_count ?? 0),
            hydeUsed: row.hyde_used as boolean,
            queryExpansionUsed: row.query_expansion_used as boolean,
            error: row.error as string | null,
            createdAt: row.created_at as string,
        }));

        const aggregates = computeAggregates(metrics);

        // Compute cost savings estimate
        const totalRequests = metrics.length;
        const hydeSkipped = metrics.filter((m) => !m.hydeUsed).length;
        const cacheHits = metrics.filter((m) => m.cacheHit).length;
        const avgHydeCostUsd = 0.002; // ~2000 tokens @ $1/1M tokens
        const avgLlmCostUsd = 0.003; // ~3000 tokens per full pipeline
        const estimatedSavings = {
            hydeSkipSavings: (hydeSkipped * avgHydeCostUsd).toFixed(4),
            cacheHitSavings: (cacheHits * avgLlmCostUsd).toFixed(4),
            totalEstimatedSavingsUsd: ((hydeSkipped * avgHydeCostUsd) + (cacheHits * avgLlmCostUsd)).toFixed(4),
        };

        // Top 5 slowest requests
        const slowest = [...metrics]
            .sort((a, b) => b.totalLatencyMs - a.totalLatencyMs)
            .slice(0, 5)
            .map((m) => ({
                requestId: m.requestId,
                latencyMs: Math.round(m.totalLatencyMs),
                answerMode: m.answerMode,
                stages: m.stages,
                createdAt: m.createdAt,
            }));

        return NextResponse.json({
            source: 'database',
            window,
            totalRequests,
            ...aggregates,
            costSavings: estimatedSavings,
            slowestRequests: slowest,
        });
    } catch (err: unknown) {
        console.error('[admin.metrics] error', err);
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 }
        );
    }
}
