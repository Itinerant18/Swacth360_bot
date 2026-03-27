/**
 * Pipeline Metrics Collector
 *
 * Lightweight, non-blocking metrics system that tracks per-request
 * pipeline performance. Uses fire-and-forget DB writes and an
 * in-memory ring buffer for real-time dashboards.
 */

import { getSupabase } from './supabase';

/* ── Types ─────────────────────────────────────────────────── */

export interface StageTimings {
    auth: number;
    translation: number;
    cacheCheck: number;
    embedding: number;
    retrieval: number;
    reranking: number;
    llmGeneration: number;
}

export interface PipelineMetric {
    requestId: string;
    totalLatencyMs: number;
    stages: StageTimings;
    cacheHit: boolean;
    cacheTier: 1 | 2 | null;
    answerMode: string;
    confidence: number;
    matchCount: number;
    hydeUsed: boolean;
    queryExpansionUsed: boolean;
    error: string | null;
    createdAt: string;
}

/* ── In-Memory Ring Buffer (real-time reads) ───────────────── */

const BUFFER_SIZE = 100;
const metricsBuffer: PipelineMetric[] = [];

function pushToBuffer(metric: PipelineMetric): void {
    metricsBuffer.push(metric);
    if (metricsBuffer.length > BUFFER_SIZE) {
        metricsBuffer.shift();
    }
}

/* ── Batched DB Writer ─────────────────────────────────────── */

const BATCH_SIZE = 10;
const FLUSH_INTERVAL_MS = 15_000; // flush every 15s even if batch not full
let pendingBatch: PipelineMetric[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushBatch();
    }, FLUSH_INTERVAL_MS);
}

async function flushBatch(): Promise<void> {
    if (pendingBatch.length === 0) return;

    const batch = pendingBatch.splice(0, pendingBatch.length);
    const supabase = getSupabase();

    const rows = batch.map((m) => ({
        request_id: m.requestId,
        total_latency_ms: m.totalLatencyMs,
        stage_auth_ms: m.stages.auth || null,
        stage_translation_ms: m.stages.translation || null,
        stage_cache_ms: m.stages.cacheCheck || null,
        stage_embedding_ms: m.stages.embedding || null,
        stage_retrieval_ms: m.stages.retrieval || null,
        stage_reranking_ms: m.stages.reranking || null,
        stage_llm_ms: m.stages.llmGeneration || null,
        cache_hit: m.cacheHit,
        cache_tier: m.cacheTier,
        answer_mode: m.answerMode,
        confidence: m.confidence,
        match_count: m.matchCount,
        hyde_used: m.hydeUsed,
        query_expansion_used: m.queryExpansionUsed,
        error: m.error,
    }));

    const { error } = await supabase.from('pipeline_metrics').insert(rows);
    if (error) {
        console.warn('[metrics] DB flush failed:', error.message);
        // Put failed batch back (max once)
        if (pendingBatch.length < BATCH_SIZE * 3) {
            pendingBatch.unshift(...batch);
        }
    }
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Record a pipeline metric. Non-blocking — never slows the response.
 */
export function recordMetric(metric: PipelineMetric): void {
    pushToBuffer(metric);

    pendingBatch.push(metric);
    if (pendingBatch.length >= BATCH_SIZE) {
        void flushBatch();
    } else {
        scheduleFlush();
    }
}

/**
 * Create a timing helper for tracking stage durations.
 */
export function createStageTimer(): {
    mark: (stage: keyof StageTimings) => void;
    end: (stage: keyof StageTimings) => void;
    getTimings: () => StageTimings;
} {
    const starts: Partial<Record<keyof StageTimings, number>> = {};
    const timings: StageTimings = {
        auth: 0,
        translation: 0,
        cacheCheck: 0,
        embedding: 0,
        retrieval: 0,
        reranking: 0,
        llmGeneration: 0,
    };

    return {
        mark(stage: keyof StageTimings) {
            starts[stage] = performance.now();
        },
        end(stage: keyof StageTimings) {
            const start = starts[stage];
            if (start !== undefined) {
                timings[stage] = Math.round((performance.now() - start) * 100) / 100;
            }
        },
        getTimings() {
            return { ...timings };
        },
    };
}

/**
 * Get recent metrics from the in-memory buffer.
 * Used by the admin metrics endpoint for real-time dashboards.
 */
export function getRecentMetrics(limit = 100): PipelineMetric[] {
    return metricsBuffer.slice(-limit);
}

/**
 * Compute aggregate stats from a set of metrics.
 */
export function computeAggregates(metrics: PipelineMetric[]): {
    count: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    avgLatencyMs: number;
    cacheHitRate: number;
    cacheTier1Rate: number;
    cacheTier2Rate: number;
    hydeUsageRate: number;
    queryExpansionRate: number;
    errorRate: number;
    avgConfidence: number;
    answerModeDistribution: Record<string, number>;
    avgStageTimings: StageTimings;
} {
    if (metrics.length === 0) {
        return {
            count: 0,
            p50LatencyMs: 0,
            p95LatencyMs: 0,
            p99LatencyMs: 0,
            avgLatencyMs: 0,
            cacheHitRate: 0,
            cacheTier1Rate: 0,
            cacheTier2Rate: 0,
            hydeUsageRate: 0,
            queryExpansionRate: 0,
            errorRate: 0,
            avgConfidence: 0,
            answerModeDistribution: {},
            avgStageTimings: { auth: 0, translation: 0, cacheCheck: 0, embedding: 0, retrieval: 0, reranking: 0, llmGeneration: 0 },
        };
    }

    const sorted = [...metrics].sort((a, b) => a.totalLatencyMs - b.totalLatencyMs);
    const n = sorted.length;

    const percentile = (p: number): number => {
        const idx = Math.ceil((p / 100) * n) - 1;
        return sorted[Math.max(0, idx)].totalLatencyMs;
    };

    const cacheHits = metrics.filter((m) => m.cacheHit);
    const modeMap: Record<string, number> = {};
    metrics.forEach((m) => {
        modeMap[m.answerMode] = (modeMap[m.answerMode] || 0) + 1;
    });

    const stageKeys: (keyof StageTimings)[] = ['auth', 'translation', 'cacheCheck', 'embedding', 'retrieval', 'reranking', 'llmGeneration'];
    const avgStages = {} as StageTimings;
    for (const key of stageKeys) {
        const values = metrics.map((m) => m.stages[key]).filter((v) => v > 0);
        avgStages[key] = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    }

    return {
        count: n,
        p50LatencyMs: Math.round(percentile(50)),
        p95LatencyMs: Math.round(percentile(95)),
        p99LatencyMs: Math.round(percentile(99)),
        avgLatencyMs: Math.round(metrics.reduce((s, m) => s + m.totalLatencyMs, 0) / n),
        cacheHitRate: cacheHits.length / n,
        cacheTier1Rate: cacheHits.filter((m) => m.cacheTier === 1).length / n,
        cacheTier2Rate: cacheHits.filter((m) => m.cacheTier === 2).length / n,
        hydeUsageRate: metrics.filter((m) => m.hydeUsed).length / n,
        queryExpansionRate: metrics.filter((m) => m.queryExpansionUsed).length / n,
        errorRate: metrics.filter((m) => m.error !== null).length / n,
        avgConfidence: metrics.reduce((s, m) => s + m.confidence, 0) / n,
        answerModeDistribution: modeMap,
        avgStageTimings: avgStages,
    };
}
