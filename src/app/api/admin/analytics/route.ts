import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET - Return analytics data
export async function GET() {
    const supabase = getSupabase();
    console.info('[admin.analytics] request');

    try {
        // Fetch from both legacy (chat_sessions) and new (conversations + messages) tables
        const [
            // Legacy table counts
            legacyTotalRes,
            legacyRagRes,
            legacyDiagramRes,
            legacyFallbackRes,
            legacyRecentRes,
            // New conversation system counts
            convTotalRes,
            messageTotalRes,
            // Shared data
            totalUnknownRes,
            pendingUnknownRes,
            reviewedUnknownRes,
            topUnknownRes,
            kbCompositionRes,
            // New: feedback & token stats
            feedbackStatsRes,
            tokenStatsRes,
        ] = await Promise.all([
            // Legacy
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'rag'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'diagram'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).in('answer_mode', ['general', 'partial', 'live']),
            supabase
                .from('chat_sessions')
                .select('user_question, answer_mode, top_similarity, created_at')
                .order('created_at', { ascending: false })
                .limit(10),
            // New conversation system
            supabase.from('conversations').select('*', { count: 'exact', head: true }),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'user'),
            // Shared
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
            // Feedback summary
            supabase.from('feedback_scores').select('score, positive_count, negative_count'),
            // Token usage summary
            supabase.from('token_usage').select('tokens_used, request_count').gte(
                'period_start',
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            ),
        ]);

        // Log non-critical errors but don't fail
        const criticalErrors = [
            totalUnknownRes.error,
            kbCompositionRes.error,
        ].filter(Boolean);

        if (criticalErrors.length > 0) {
            throw new Error(criticalErrors.map((error) => error?.message).join('; '));
        }

        // KB composition
        const sourceMap: Record<string, { count: number; name: string }> = {};
        kbCompositionRes.data?.forEach((row: { source: string; source_name: string }) => {
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

        // Use new conversation system if legacy is empty
        const legacyTotal = legacyTotalRes.count ?? 0;
        const convTotal = convTotalRes.count ?? 0;
        const messageTotal = messageTotalRes.count ?? 0;

        const useLegacy = legacyTotal > 0;
        const total = useLegacy ? legacyTotal : messageTotal;
        const rag = useLegacy ? (legacyRagRes.count ?? 0) : 0;
        const diagram = useLegacy ? (legacyDiagramRes.count ?? 0) : 0;
        const general = useLegacy ? (legacyFallbackRes.count ?? 0) : 0;

        // Recent sessions — prefer new messages if legacy is empty
        let recentSessions = legacyRecentRes.data || [];
        if (recentSessions.length === 0 && !useLegacy) {
            // Fetch recent messages from the new system
            const { data: recentMessages } = await supabase
                .from('messages')
                .select('content, role, created_at, conversation_id')
                .eq('role', 'user')
                .order('created_at', { ascending: false })
                .limit(10);

            recentSessions = (recentMessages || []).map((m: {
                content: string;
                role: string;
                created_at: string;
                conversation_id: string;
            }) => ({
                user_question: m.content,
                answer_mode: 'conversation',
                top_similarity: null,
                created_at: m.created_at,
            }));
        }

        // Feedback stats
        const feedbackData = feedbackStatsRes.data || [];
        const totalFeedback = feedbackData.length;
        const positiveFeedback = feedbackData.filter((f: { score: number }) => f.score > 0).length;
        const negativeFeedback = feedbackData.filter((f: { score: number }) => f.score < 0).length;

        // Token usage stats
        const tokenData = tokenStatsRes.data || [];
        const totalTokens = tokenData.reduce((sum: number, t: { tokens_used: number }) => sum + t.tokens_used, 0);
        const totalRequests = tokenData.reduce((sum: number, t: { request_count: number }) => sum + t.request_count, 0);

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
            topUnknown: topUnknownRes.data || [],
            knowledgeBase: sourceMap,
            recentSessions,
            // New conversation system stats
            conversations: {
                total: convTotal,
                totalMessages: messageTotal,
                isNewSystem: !useLegacy,
            },
            // Feedback stats
            feedback: {
                total: totalFeedback,
                positive: positiveFeedback,
                negative: negativeFeedback,
            },
            // Token usage stats (last 30 days)
            tokenUsage: {
                totalTokens,
                totalRequests,
            },
        });
    } catch (err: unknown) {
        console.error('[admin.analytics] error', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
