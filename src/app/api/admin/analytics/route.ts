import { getSupabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET — Return analytics data
export async function GET() {
    const supabase = getSupabase();
    try {
        // Total chats
        const { count: totalChats } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true });

        // RAG answers count
        const { count: ragCount } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('answer_mode', 'rag');

        // Diagram answers count
        const { count: diagramCount } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('answer_mode', 'diagram');

        // General LLM answers count
        const { count: generalCount } = await supabase
            .from('chat_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('answer_mode', 'general');

        // Unknown questions stats
        const { count: totalUnknown } = await supabase
            .from('unknown_questions')
            .select('*', { count: 'exact', head: true });

        const { count: pendingUnknown } = await supabase
            .from('unknown_questions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const { count: reviewedUnknown } = await supabase
            .from('unknown_questions')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'reviewed');

        // Top unknown questions (most asked)
        const { data: topUnknown } = await supabase
            .from('unknown_questions')
            .select('english_text, user_question, frequency, top_similarity')
            .eq('status', 'pending')
            .order('frequency', { ascending: false })
            .limit(10);

        // Knowledge base composition
        const { data: kbComposition } = await supabase
            .from('hms_knowledge')
            .select('source, source_name');

        // Group by source
        const sourceMap: Record<string, { count: number; name: string }> = {};
        kbComposition?.forEach((row: any) => {
            const key = row.source || 'json';
            if (!sourceMap[key]) {
                sourceMap[key] = { count: 0, name: row.source_name || 'Unknown' };
            }
            sourceMap[key].count++;
        });

        // Recent sessions
        const { data: recentSessions } = await supabase
            .from('chat_sessions')
            .select('user_question, answer_mode, top_similarity, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        return NextResponse.json({
            totalChats: totalChats || 0,
            ragCount: ragCount || 0,
            generalCount: generalCount || 0,
            diagramCount: diagramCount || 0,
            ragPercent: totalChats ? Math.round(((ragCount || 0) / totalChats) * 100) : 0,
            diagramPercent: totalChats ? Math.round(((diagramCount || 0) / totalChats) * 100) : 0,
            unknownQuestions: {
                total: totalUnknown || 0,
                pending: pendingUnknown || 0,
                reviewed: reviewedUnknown || 0,
            },
            topUnknown: topUnknown || [],
            knowledgeBase: sourceMap,
            recentSessions: recentSessions || [],
        });
    } catch (err: any) {
        console.error('❌ Analytics error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
