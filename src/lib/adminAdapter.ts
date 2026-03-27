type JsonRecord = Record<string, unknown>;

export interface NormalizedQueryCount {
    query: string;
    count: number;
}

export interface NormalizedLowConfidenceQuery {
    query: string;
    confidence: number;
    createdAt: string;
}

export interface NormalizedSlowRequest {
    query: string;
    responseTimeMs: number;
    createdAt: string;
}

export interface NormalizedFailureReason {
    reason: string;
    count: number;
}

export interface NormalizedFailureEntry {
    requestId: string;
    query: string;
    reason: string;
    confidence: number | null;
    createdAt: string;
}

export interface NormalizedKnowledgeBaseEntry {
    source: string;
    name: string;
    count: number;
}

export interface NormalizedRecentSession {
    userQuestion: string;
    answerMode: string;
    topSimilarity: number;
    createdAt: string;
}

export interface NormalizedTopUnknown {
    englishText: string;
    userQuestion: string;
    frequency: number;
    topSimilarity: number;
}

export interface NormalizedStageMetric {
    key: string;
    label: string;
    value: number;
}

export interface NormalizedDistributionMetric {
    key: string;
    label: string;
    value: number;
}

export interface NormalizedMonitoring {
    count: number;
    avgLatency: number;
    failureRate: number;
    cacheHitRate: number;
    semanticCacheHitRate: number;
    hydeUsageRate: number;
    llmCalls: number;
    topQueries: NormalizedQueryCount[];
    lowConfidence: NormalizedLowConfidenceQuery[];
}

export interface NormalizedAnalytics {
    totalChats: number;
    ragCount: number;
    generalCount: number;
    diagramCount: number;
    ragPercent: number;
    diagramPercent: number;
    unknownQuestions: { total: number; pending: number; reviewed: number };
    topUnknown: NormalizedTopUnknown[];
    knowledgeBase: NormalizedKnowledgeBaseEntry[];
    recentSessions: NormalizedRecentSession[];
    conversations: { total: number; totalMessages: number; isNewSystem: boolean };
    feedback: { total: number; positive: number; negative: number };
    tokenUsage: { totalTokens: number; totalRequests: number };
    monitoring: NormalizedMonitoring;
}

export interface NormalizedCostSavings {
    hydeSkipSavings: string;
    cacheHitSavings: string;
    totalEstimatedSavingsUsd: string;
}

export interface NormalizedMetrics {
    source: string;
    window: string;
    count: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    cacheHitRate: number;
    cacheTier1Rate: number;
    cacheTier2Rate: number;
    hydeUsageRate: number;
    queryExpansionRate: number;
    errorRate: number;
    avgConfidence: number;
    stages: NormalizedStageMetric[];
    answerModes: NormalizedDistributionMetric[];
    costSavings: NormalizedCostSavings | null;
}

export interface NormalizedPerformance extends NormalizedMonitoring {
    slowestRequests: NormalizedSlowRequest[];
}

export interface NormalizedFailures {
    count: number;
    reasons: NormalizedFailureReason[];
    recent: NormalizedFailureEntry[];
}

function asRecord(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asBoolean(value: unknown): boolean {
    return value === true;
}

function asNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
}

function normalizeMonitoring(value: unknown): NormalizedMonitoring {
    const data = asRecord(value);

    return {
        count: asNumber(data.count),
        avgLatency: asNumber(data.avgLatency ?? data.avgLatencyMs),
        failureRate: asNumber(data.failureRate),
        cacheHitRate: asNumber(data.cacheHitRate ?? data.cacheRate),
        semanticCacheHitRate: asNumber(data.semanticCacheHitRate),
        hydeUsageRate: asNumber(data.hydeUsageRate ?? data.hydeRate),
        llmCalls: asNumber(data.avgLlmCalls ?? data.llmCalls),
        topQueries: asArray(data.topQueries).map((entry) => {
            const item = asRecord(entry);
            return {
                query: asString(item.query),
                count: asNumber(item.count),
            };
        }),
        lowConfidence: asArray(data.lowConfidenceQueries ?? data.lowConfidence).map((entry) => {
            const item = asRecord(entry);
            return {
                query: asString(item.query),
                confidence: asNumber(item.confidence),
                createdAt: asString(item.createdAt),
            };
        }),
    };
}

export function normalizeAnalytics(data: unknown): NormalizedAnalytics {
    const root = asRecord(data);
    const unknownQuestions = asRecord(root.unknownQuestions);
    const conversations = asRecord(root.conversations);
    const feedback = asRecord(root.feedback);
    const tokenUsage = asRecord(root.tokenUsage);
    const knowledgeBase = asRecord(root.knowledgeBase);

    return {
        totalChats: asNumber(root.totalChats),
        ragCount: asNumber(root.ragCount),
        generalCount: asNumber(root.generalCount),
        diagramCount: asNumber(root.diagramCount),
        ragPercent: asNumber(root.ragPercent),
        diagramPercent: asNumber(root.diagramPercent),
        unknownQuestions: {
            total: asNumber(unknownQuestions.total),
            pending: asNumber(unknownQuestions.pending),
            reviewed: asNumber(unknownQuestions.reviewed),
        },
        topUnknown: asArray(root.topUnknown).map((entry) => {
            const item = asRecord(entry);
            return {
                englishText: asString(item.english_text),
                userQuestion: asString(item.user_question),
                frequency: asNumber(item.frequency),
                topSimilarity: asNumber(item.top_similarity),
            };
        }),
        knowledgeBase: Object.entries(knowledgeBase).map(([source, entry]) => {
            const item = asRecord(entry);
            return {
                source,
                name: asString(item.name) || source,
                count: asNumber(item.count),
            };
        }),
        recentSessions: asArray(root.recentSessions).map((entry) => {
            const item = asRecord(entry);
            return {
                userQuestion: asString(item.user_question),
                answerMode: asString(item.answer_mode),
                topSimilarity: asNumber(item.top_similarity),
                createdAt: asString(item.created_at),
            };
        }),
        conversations: {
            total: asNumber(conversations.total),
            totalMessages: asNumber(conversations.totalMessages),
            isNewSystem: asBoolean(conversations.isNewSystem),
        },
        feedback: {
            total: asNumber(feedback.total),
            positive: asNumber(feedback.positive),
            negative: asNumber(feedback.negative),
        },
        tokenUsage: {
            totalTokens: asNumber(tokenUsage.totalTokens),
            totalRequests: asNumber(tokenUsage.totalRequests),
        },
        monitoring: normalizeMonitoring(root.assistantMonitoring),
    };
}

function normalizeCostSavings(value: unknown): NormalizedCostSavings | null {
    if (!value || typeof value !== 'object') return null;
    const data = asRecord(value);
    return {
        hydeSkipSavings: asString(data.hydeSkipSavings) || '0.0000',
        cacheHitSavings: asString(data.cacheHitSavings) || '0.0000',
        totalEstimatedSavingsUsd: asString(data.totalEstimatedSavingsUsd) || '0.0000',
    };
}

export function normalizeMetrics(data: unknown): NormalizedMetrics {
    const root = asRecord(data);
    const rawStages = asRecord(root.avgStageTimings);
    const rawModes = asRecord(root.answerModeDistribution);

    const stageLabels: Record<string, string> = {
        auth: 'Auth',
        translation: 'Translation',
        cacheCheck: 'Cache',
        embedding: 'Embedding',
        retrieval: 'Retrieval',
        reranking: 'Reranking',
        llmGeneration: 'LLM',
    };

    return {
        source: asString(root.source),
        window: asString(root.window),
        count: asNumber(root.count),
        avgLatency: asNumber(root.avgLatency ?? root.avgLatencyMs),
        p50Latency: asNumber(root.p50Latency ?? root.p50LatencyMs),
        p95Latency: asNumber(root.p95Latency ?? root.p95LatencyMs),
        p99Latency: asNumber(root.p99Latency ?? root.p99LatencyMs),
        cacheHitRate: asNumber(root.cacheHitRate ?? root.cacheRate),
        cacheTier1Rate: asNumber(root.cacheTier1Rate),
        cacheTier2Rate: asNumber(root.cacheTier2Rate),
        hydeUsageRate: asNumber(root.hydeUsageRate ?? root.hydeRate),
        queryExpansionRate: asNumber(root.queryExpansionRate),
        errorRate: asNumber(root.errorRate),
        avgConfidence: asNumber(root.avgConfidence),
        stages: Object.entries(rawStages)
            .map(([key, value]) => ({
                key,
                label: stageLabels[key] || key,
                value: asNumber(value),
            }))
            .sort((left, right) => right.value - left.value),
        answerModes: Object.entries(rawModes)
            .map(([key, value]) => ({
                key,
                label: key.toUpperCase(),
                value: asNumber(value),
            }))
            .sort((left, right) => right.value - left.value),
        costSavings: normalizeCostSavings(root.costSavings),
    };
}

export function normalizePerformance(data: unknown): NormalizedPerformance {
    const root = asRecord(data);
    const monitoring = normalizeMonitoring(root);

    return {
        ...monitoring,
        slowestRequests: asArray(root.slowestRequests).map((entry) => {
            const item = asRecord(entry);
            return {
                query: asString(item.query),
                responseTimeMs: asNumber(item.responseTimeMs ?? item.latencyMs),
                createdAt: asString(item.createdAt),
            };
        }),
    };
}

export function normalizeFailures(data: unknown): NormalizedFailures {
    const root = asRecord(data);

    return {
        count: asNumber(root.count),
        reasons: asArray(root.reasons).map((entry) => {
            const item = asRecord(entry);
            return {
                reason: asString(item.reason),
                count: asNumber(item.count),
            };
        }),
        recent: asArray(root.recent).map((entry) => {
            const item = asRecord(entry);
            const confidence = item.confidence === null || item.confidence === undefined
                ? null
                : asNumber(item.confidence);

            return {
                requestId: asString(item.requestId),
                query: asString(item.query),
                reason: asString(item.reason),
                confidence,
                createdAt: asString(item.createdAt),
            };
        }),
    };
}
