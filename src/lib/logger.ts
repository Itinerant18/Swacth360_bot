import { getSupabase } from './supabase';

export type CacheSource = 'none' | 'exact' | 'semantic_local' | 'semantic_db';

export interface ChatLogEntry {
    requestId: string;
    query: string;
    rewrittenQuery: string;
    intent: string;
    retrievedChunks: string[];
    finalChunks: string[];
    confidence: number;
    responseTimeMs: number;
    success: boolean;
    fallbackTriggered: boolean;
    cacheSource: CacheSource;
    hydeUsed: boolean;
    queryExpansionUsed: boolean;
    llmCalls: number;
    error: string | null;
    createdAt: string;
}

export interface FailureEntry {
    requestId: string;
    query: string;
    reason: string;
    confidence: number | null;
    createdAt: string;
}

interface AnalyticsSummary {
    count: number;
    avgLatencyMs: number;
    failureRate: number;
    cacheHitRate: number;
    semanticCacheHitRate: number;
    hydeUsageRate: number;
    avgLlmCalls: number;
    topQueries: Array<{ query: string; count: number }>;
    lowConfidenceQueries: Array<{ query: string; confidence: number; createdAt: string }>;
}

const LOG_BUFFER_LIMIT = 300;
const FAILURE_BUFFER_LIMIT = 150;
const FLUSH_INTERVAL_MS = 10_000;
const BATCH_SIZE = 20;

const logBuffer: ChatLogEntry[] = [];
const failureBuffer: FailureEntry[] = [];
const pendingLogs: ChatLogEntry[] = [];
const pendingFailures: FailureEntry[] = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
let failureFlushTimer: ReturnType<typeof setTimeout> | null = null;

function pushBounded<T>(buffer: T[], item: T, limit: number): void {
    buffer.push(item);
    if (buffer.length > limit) {
        buffer.shift();
    }
}

function scheduleLogFlush(): void {
    if (logFlushTimer) {
        return;
    }

    logFlushTimer = setTimeout(() => {
        logFlushTimer = null;
        void flushLogs();
    }, FLUSH_INTERVAL_MS);
}

function scheduleFailureFlush(): void {
    if (failureFlushTimer) {
        return;
    }

    failureFlushTimer = setTimeout(() => {
        failureFlushTimer = null;
        void flushFailures();
    }, FLUSH_INTERVAL_MS);
}

async function flushLogs(): Promise<void> {
    if (pendingLogs.length === 0) {
        return;
    }

    const batch = pendingLogs.splice(0, pendingLogs.length);
    try {
        const supabase = getSupabase();
        const rows = batch.map((entry) => ({
            request_id: entry.requestId,
            query: entry.query,
            rewritten_query: entry.rewrittenQuery,
            intent: entry.intent,
            retrieved_chunks: entry.retrievedChunks,
            final_chunks: entry.finalChunks,
            confidence: entry.confidence,
            response_time_ms: entry.responseTimeMs,
            success: entry.success,
            fallback_triggered: entry.fallbackTriggered,
            cache_source: entry.cacheSource,
            hyde_used: entry.hydeUsed,
            query_expansion_used: entry.queryExpansionUsed,
            llm_calls: entry.llmCalls,
            error: entry.error,
            created_at: entry.createdAt,
        }));

        const { error } = await supabase.from('chat_logs').insert(rows);
        if (error) {
            console.warn('[logger] chat_logs flush failed:', error.message);
        }
    } catch (err) {
        console.warn('[logger] chat_logs flush skipped:', (err as Error).message);
    }
}

async function flushFailures(): Promise<void> {
    if (pendingFailures.length === 0) {
        return;
    }

    const batch = pendingFailures.splice(0, pendingFailures.length);
    try {
        const supabase = getSupabase();
        const rows = batch.map((entry) => ({
            request_id: entry.requestId,
            query: entry.query,
            reason: entry.reason,
            confidence: entry.confidence,
            created_at: entry.createdAt,
        }));

        const { error } = await supabase.from('failures').insert(rows);
        if (error) {
            console.warn('[logger] failures flush failed:', error.message);
        }
    } catch (err) {
        console.warn('[logger] failures flush skipped:', (err as Error).message);
    }
}

function toChatLogEntry(entry: Omit<ChatLogEntry, 'createdAt'> & { createdAt?: string }): ChatLogEntry {
    return {
        ...entry,
        createdAt: entry.createdAt ?? new Date().toISOString(),
    };
}

function toFailureEntry(entry: Omit<FailureEntry, 'createdAt'> & { createdAt?: string }): FailureEntry {
    return {
        ...entry,
        createdAt: entry.createdAt ?? new Date().toISOString(),
    };
}

export function recordChatLog(entry: Omit<ChatLogEntry, 'createdAt'> & { createdAt?: string }): void {
    const item = toChatLogEntry(entry);
    pushBounded(logBuffer, item, LOG_BUFFER_LIMIT);
    pendingLogs.push(item);

    if (pendingLogs.length >= BATCH_SIZE) {
        void flushLogs();
    } else {
        scheduleLogFlush();
    }
}

export function recordFailure(entry: Omit<FailureEntry, 'createdAt'> & { createdAt?: string }): void {
    const item = toFailureEntry(entry);
    pushBounded(failureBuffer, item, FAILURE_BUFFER_LIMIT);
    pendingFailures.push(item);

    if (pendingFailures.length >= BATCH_SIZE) {
        void flushFailures();
    } else {
        scheduleFailureFlush();
    }
}

export function getRecentChatLogs(limit = 100): ChatLogEntry[] {
    return logBuffer.slice(-limit).reverse();
}

export function getRecentFailures(limit = 100): FailureEntry[] {
    return failureBuffer.slice(-limit).reverse();
}

function buildAnalytics(logs: ChatLogEntry[]): AnalyticsSummary {
    if (logs.length === 0) {
        return {
            count: 0,
            avgLatencyMs: 0,
            failureRate: 0,
            cacheHitRate: 0,
            semanticCacheHitRate: 0,
            hydeUsageRate: 0,
            avgLlmCalls: 0,
            topQueries: [],
            lowConfidenceQueries: [],
        };
    }

    const queryCounts = new Map<string, number>();
    for (const log of logs) {
        queryCounts.set(log.query, (queryCounts.get(log.query) || 0) + 1);
    }

    const lowConfidenceQueries = logs
        .filter((log) => log.confidence < 0.55)
        .sort((left, right) => left.confidence - right.confidence)
        .slice(0, 10)
        .map((log) => ({
            query: log.query,
            confidence: log.confidence,
            createdAt: log.createdAt,
        }));

    return {
        count: logs.length,
        avgLatencyMs: Math.round(logs.reduce((sum, log) => sum + log.responseTimeMs, 0) / logs.length),
        failureRate: logs.filter((log) => !log.success || log.error).length / logs.length,
        cacheHitRate: logs.filter((log) => log.cacheSource !== 'none').length / logs.length,
        semanticCacheHitRate: logs.filter((log) => log.cacheSource === 'semantic_local' || log.cacheSource === 'semantic_db').length / logs.length,
        hydeUsageRate: logs.filter((log) => log.hydeUsed).length / logs.length,
        avgLlmCalls: Number((logs.reduce((sum, log) => sum + log.llmCalls, 0) / logs.length).toFixed(2)),
        topQueries: [...queryCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10)
            .map(([query, count]) => ({ query, count })),
        lowConfidenceQueries,
    };
}

async function loadChatLogs(windowHours = 24): Promise<ChatLogEntry[]> {
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('chat_logs')
            .select('*')
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(1000);

        if (error) {
            throw new Error(error.message);
        }

        return (data || []).map((row: Record<string, unknown>) => ({
            requestId: String(row.request_id || ''),
            query: String(row.query || ''),
            rewrittenQuery: String(row.rewritten_query || row.query || ''),
            intent: String(row.intent || 'unknown'),
            retrievedChunks: Array.isArray(row.retrieved_chunks) ? row.retrieved_chunks.map(String) : [],
            finalChunks: Array.isArray(row.final_chunks) ? row.final_chunks.map(String) : [],
            confidence: Number(row.confidence || 0),
            responseTimeMs: Number(row.response_time_ms || 0),
            success: Boolean(row.success),
            fallbackTriggered: Boolean(row.fallback_triggered),
            cacheSource: (row.cache_source as CacheSource) || 'none',
            hydeUsed: Boolean(row.hyde_used),
            queryExpansionUsed: Boolean(row.query_expansion_used),
            llmCalls: Number(row.llm_calls || 0),
            error: row.error ? String(row.error) : null,
            createdAt: String(row.created_at || ''),
        }));
    } catch (err) {
        console.warn('[logger] chat_logs load failed, using memory buffer:', (err as Error).message);
        return getRecentChatLogs(200).filter((log) => Date.parse(log.createdAt) >= Date.parse(since));
    }
}

async function loadFailures(limit = 100): Promise<FailureEntry[]> {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('failures')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            throw new Error(error.message);
        }

        return (data || []).map((row: Record<string, unknown>) => ({
            requestId: String(row.request_id || ''),
            query: String(row.query || ''),
            reason: String(row.reason || ''),
            confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
            createdAt: String(row.created_at || ''),
        }));
    } catch (err) {
        console.warn('[logger] failures load failed, using memory buffer:', (err as Error).message);
        return getRecentFailures(limit);
    }
}

export async function getAnalyticsSummary(windowHours = 24): Promise<AnalyticsSummary> {
    const logs = await loadChatLogs(windowHours);
    return buildAnalytics(logs);
}

export async function getFailureSummary(limit = 100): Promise<{
    count: number;
    reasons: Array<{ reason: string; count: number }>;
    recent: FailureEntry[];
}> {
    const failures = await loadFailures(limit);
    const counts = new Map<string, number>();

    for (const failure of failures) {
        counts.set(failure.reason, (counts.get(failure.reason) || 0) + 1);
    }

    return {
        count: failures.length,
        reasons: [...counts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10)
            .map(([reason, count]) => ({ reason, count })),
        recent: failures,
    };
}

export async function getPerformanceSummary(windowHours = 24): Promise<AnalyticsSummary & {
    slowestRequests: Array<{ query: string; responseTimeMs: number; createdAt: string }>;
}> {
    const logs = await loadChatLogs(windowHours);
    const analytics = buildAnalytics(logs);
    const slowestRequests = [...logs]
        .sort((left, right) => right.responseTimeMs - left.responseTimeMs)
        .slice(0, 10)
        .map((log) => ({
            query: log.query,
            responseTimeMs: log.responseTimeMs,
            createdAt: log.createdAt,
        }));

    return {
        ...analytics,
        slowestRequests,
    };
}
