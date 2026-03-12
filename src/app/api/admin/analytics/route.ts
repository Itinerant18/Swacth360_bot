import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET - Return analytics data
export async function GET() {
    const supabase = getSupabase();
    console.info('[admin.analytics] request');

    try {
        const [
            totalChatsRes,
            ragCountRes,
            diagramCountRes,
            fallbackCountRes,
            totalUnknownRes,
            pendingUnknownRes,
            reviewedUnknownRes,
            topUnknownRes,
            kbCompositionRes,
            recentSessionsRes,
        ] = await Promise.all([
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'rag'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'diagram'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).in('answer_mode', ['general', 'partial', 'live']),
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
            supabase
                .from('chat_sessions')
                .select('user_question, answer_mode, top_similarity, created_at')
                .order('created_at', { ascending: false })
                .limit(10),
        ]);

        const errors = [
            totalChatsRes.error,
            ragCountRes.error,
            diagramCountRes.error,
            fallbackCountRes.error,
            totalUnknownRes.error,
            pendingUnknownRes.error,
            reviewedUnknownRes.error,
            topUnknownRes.error,
            kbCompositionRes.error,
            recentSessionsRes.error,
        ].filter(Boolean);

        if (errors.length > 0) {
            throw new Error(errors.map((error) => error?.message).join('; '));
        }

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

        return NextResponse.json({
            totalChats: totalChatsRes.count || 0,
            ragCount: ragCountRes.count || 0,
            generalCount: fallbackCountRes.count || 0,
            diagramCount: diagramCountRes.count || 0,
            ragPercent: totalChatsRes.count ? Math.round(((ragCountRes.count || 0) / totalChatsRes.count) * 100) : 0,
            diagramPercent: totalChatsRes.count ? Math.round(((diagramCountRes.count || 0) / totalChatsRes.count) * 100) : 0,
            unknownQuestions: {
                total: totalUnknownRes.count || 0,
                pending: pendingUnknownRes.count || 0,
                reviewed: reviewedUnknownRes.count || 0,
            },
            topUnknown: topUnknownRes.data || [],
            knowledgeBase: sourceMap,
            recentSessions: recentSessionsRes.data || [],
        });
    } catch (err: unknown) {
        console.error('[admin.analytics] error', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
