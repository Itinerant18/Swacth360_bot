import { requireAdmin } from '@/lib/admin-auth';
import { getAnalyticsSummary } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

type QueryResult<T = unknown> = {
    data?: T[] | null;
    count?: number | null;
    error?: { message?: string | null } | null;
};

type RecentSessionRow = {
    user_question: string;
    answer_mode: string | null;
    top_similarity: number | null;
    created_at: string;
};

type KnowledgeRow = {
    source: string;
    source_name: string;
};

type RecentMessageRow = {
    content: string;
    role: string;
    created_at: string;
    conversation_id: string;
    answer_mode: string | null;
    top_similarity: number | null;
};

type FeedbackRow = {
    rating: number;
    is_relevant: boolean;
};

type TokenRow = {
    tokens_used: number;
    request_count: number;
};

function emptyQueryResult<T>(): QueryResult<T> {
    return {
        data: [],
        count: 0,
        error: null,
    };
}

const EMPTY_ANALYTICS_SUMMARY = {
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

function unwrap<T>(label: string, result: PromiseSettledResult<unknown>, fallback: T): T {
    if (result.status === 'fulfilled') {
        return result.value as T;
    }

    console.error(`[admin.analytics] ${label} rejected`, result.reason);
    return fallback;
}

function logQueryError(label: string, result: QueryResult): void {
    const message = result?.error?.message;
    if (message) {
        console.error(`[admin.analytics] ${label} query error`, message);
    }
}

// GET - Return analytics data
export async function GET() {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    const supabase = getSupabase();
    console.info('[admin.analytics] request');

    try {
        const [
            legacyTotalSettled,
            legacyRagSettled,
            legacyDiagramSettled,
            legacyFallbackSettled,
            legacyRecentSettled,
            convTotalSettled,
            messageTotalSettled,
            msgRagSettled,
            msgFallbackSettled,
            msgDiagramSettled,
            totalUnknownSettled,
            pendingUnknownSettled,
            reviewedUnknownSettled,
            topUnknownSettled,
            kbCompositionSettled,
            feedbackStatsSettled,
            tokenStatsSettled,
            assistantMonitoringSettled,
        ] = await Promise.allSettled([
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'rag'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'diagram'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).in('answer_mode', ['general', 'partial', 'live']),
            supabase
                .from('chat_sessions')
                .select('user_question, answer_mode, top_similarity, created_at')
                .order('created_at', { ascending: false })
                .limit(10),
            supabase.from('conversations').select('*', { count: 'exact', head: true }),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'user'),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').eq('answer_mode', 'rag'),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').in('answer_mode', ['general', 'partial', 'live']),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').in('answer_mode', ['diagram', 'diagram_stored']),
            supabase.from('unknown_questions').select('*', { count: 'exact', head: true }),
            supabase.from('unknown_questions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('unknown_questions').select('*', { count: 'exact', head: true }).eq('status', 'reviewed'),
            supabase
                .from('unknown_questions')
                .select('english_text, user_question, frequency, top_similarity')
                .eq('status', 'pending')
                .order('frequency', { ascending: false })
                .limit(10),
            supabase.from('hms_knowledge').select('source, source_name'),
            supabase.from('retrieval_feedback').select('id, rating, is_relevant'),
            supabase.from('token_usage').select('tokens_used, request_count').gte(
                'period_start',
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            ),
            getAnalyticsSummary(24),
        ]);

        const legacyTotalRes = unwrap<QueryResult>('legacyTotalRes', legacyTotalSettled, emptyQueryResult());
        const legacyRagRes = unwrap<QueryResult>('legacyRagRes', legacyRagSettled, emptyQueryResult());
        const legacyDiagramRes = unwrap<QueryResult>('legacyDiagramRes', legacyDiagramSettled, emptyQueryResult());
        const legacyFallbackRes = unwrap<QueryResult>('legacyFallbackRes', legacyFallbackSettled, emptyQueryResult());
        const legacyRecentRes = unwrap<QueryResult<RecentSessionRow>>('legacyRecentRes', legacyRecentSettled, emptyQueryResult<RecentSessionRow>());
        const convTotalRes = unwrap<QueryResult>('convTotalRes', convTotalSettled, emptyQueryResult());
        const messageTotalRes = unwrap<QueryResult>('messageTotalRes', messageTotalSettled, emptyQueryResult());
        const msgRagRes = unwrap<QueryResult>('msgRagRes', msgRagSettled, emptyQueryResult());
        const msgFallbackRes = unwrap<QueryResult>('msgFallbackRes', msgFallbackSettled, emptyQueryResult());
        const msgDiagramRes = unwrap<QueryResult>('msgDiagramRes', msgDiagramSettled, emptyQueryResult());
        const totalUnknownRes = unwrap<QueryResult>('totalUnknownRes', totalUnknownSettled, emptyQueryResult());
        const pendingUnknownRes = unwrap<QueryResult>('pendingUnknownRes', pendingUnknownSettled, emptyQueryResult());
        const reviewedUnknownRes = unwrap<QueryResult>('reviewedUnknownRes', reviewedUnknownSettled, emptyQueryResult());
        const topUnknownRes = unwrap<QueryResult>('topUnknownRes', topUnknownSettled, emptyQueryResult());
        const kbCompositionRes = unwrap<QueryResult<KnowledgeRow>>('kbCompositionRes', kbCompositionSettled, emptyQueryResult<KnowledgeRow>());
        const feedbackStatsRes = unwrap<QueryResult<FeedbackRow>>('feedbackStatsRes', feedbackStatsSettled, emptyQueryResult<FeedbackRow>());
        const tokenStatsRes = unwrap<QueryResult<TokenRow>>('tokenStatsRes', tokenStatsSettled, emptyQueryResult<TokenRow>());
        const assistantMonitoring = unwrap('assistantMonitoring', assistantMonitoringSettled, EMPTY_ANALYTICS_SUMMARY);

        const queryResults: Array<[string, QueryResult]> = [
            ['legacyTotalRes', legacyTotalRes],
            ['legacyRagRes', legacyRagRes],
            ['legacyDiagramRes', legacyDiagramRes],
            ['legacyFallbackRes', legacyFallbackRes],
            ['legacyRecentRes', legacyRecentRes],
            ['convTotalRes', convTotalRes],
            ['messageTotalRes', messageTotalRes],
            ['msgRagRes', msgRagRes],
            ['msgFallbackRes', msgFallbackRes],
            ['msgDiagramRes', msgDiagramRes],
            ['totalUnknownRes', totalUnknownRes],
            ['pendingUnknownRes', pendingUnknownRes],
            ['reviewedUnknownRes', reviewedUnknownRes],
            ['topUnknownRes', topUnknownRes],
            ['kbCompositionRes', kbCompositionRes],
            ['feedbackStatsRes', feedbackStatsRes],
            ['tokenStatsRes', tokenStatsRes],
        ];
        queryResults.forEach(([label, result]) => logQueryError(label, result));

        const sourceMap: Record<string, { count: number; name: string }> = {};
        kbCompositionRes.data?.forEach((row) => {
            const key = row.source || 'json';
            if (!sourceMap[key]) {
                sourceMap[key] = {
                    count: 0,
                    name:
                        key === 'pdf' ? 'PDF Uploads'
                            : key === 'pdf_image' ? 'PDF Images'
                                : key === 'admin' ? 'Admin Added'
                                    : key === 'json' ? 'Seed Data'
                                        : row.source_name || key,
                };
            }
            sourceMap[key].count++;
        });

        const legacyTotal = legacyTotalRes.count ?? 0;
        const convTotal = convTotalRes.count ?? 0;
        const messageTotal = messageTotalRes.count ?? 0;

        const useLegacy = legacyTotal > 0;
        const total = useLegacy ? legacyTotal : messageTotal;
        const rag = useLegacy ? (legacyRagRes.count ?? 0) : (msgRagRes.count ?? 0);
        const diagram = useLegacy ? (legacyDiagramRes.count ?? 0) : (msgDiagramRes.count ?? 0);
        const general = useLegacy ? (legacyFallbackRes.count ?? 0) : (msgFallbackRes.count ?? 0);

        let recentSessions = legacyRecentRes.data ?? [];
        if (recentSessions.length === 0 && !useLegacy) {
            const { data: recentMessages, error: recentMessagesError } = await supabase
                .from('messages')
                .select('content, role, created_at, conversation_id, answer_mode, top_similarity')
                .eq('role', 'user')
                .order('created_at', { ascending: false })
                .limit(10);

            if (recentMessagesError) {
                console.error('[admin.analytics] recentMessages query error', recentMessagesError.message);
            }

            recentSessions = (recentMessages ?? []).map((message: RecentMessageRow) => ({
                user_question: message.content,
                answer_mode: message.answer_mode || 'conversation',
                top_similarity: message.top_similarity,
                created_at: message.created_at,
            }));
        }

        const feedbackData = feedbackStatsRes.data ?? [];
        const totalFeedback = feedbackData.length;
        const positiveFeedback = feedbackData.filter(
            (feedback) => feedback.is_relevant === true || (feedback.rating ?? 0) >= 4,
        ).length;
        const negativeFeedback = feedbackData.filter(
            (feedback) => feedback.is_relevant === false || ((feedback.rating ?? 0) > 0 && (feedback.rating ?? 0) <= 2),
        ).length;

        const tokenData = tokenStatsRes.data ?? [];
        const totalTokens = tokenData.reduce((sum, token) => sum + token.tokens_used, 0);
        const totalRequests = tokenData.reduce((sum, token) => sum + token.request_count, 0);

        return NextResponse.json({
            totalChats: total,
            ragCount: rag,
            generalCount: general,
            diagramCount: diagram,
            ragPercent: total > 0 ? Math.round((rag / total) * 100) : 0,
            diagramPercent: total > 0 ? Math.round((diagram / total) * 100) : 0,
            unknownQuestions: {
                total: totalUnknownRes.count ?? 0,
                pending: pendingUnknownRes.count ?? 0,
                reviewed: reviewedUnknownRes.count ?? 0,
            },
            topUnknown: topUnknownRes.data ?? [],
            knowledgeBase: sourceMap,
            recentSessions,
            conversations: {
                total: convTotal,
                totalMessages: messageTotal,
                isNewSystem: !useLegacy,
            },
            feedback: {
                total: totalFeedback,
                positive: positiveFeedback,
                negative: negativeFeedback,
            },
            tokenUsage: {
                totalTokens,
                totalRequests,
            },
            assistantMonitoring,
        });
    } catch (err: unknown) {
        console.error('[admin.analytics] error', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
