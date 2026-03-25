import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { invalidateAllCache } from '@/lib/cache';

export async function GET() {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase
            .from('rag_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) {
            console.error('[admin.rag-settings.get] error', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            useHybridSearch: data.use_hybrid_search,
            useReranker: data.use_reranker,
            useQueryExpansion: data.use_query_expansion,
            useGraphBoost: data.use_graph_boost,
            topK: data.top_k,
            alpha: data.alpha,
            mmrLambda: data.mmr_lambda,
            updatedAt: data.updated_at,
        });
    } catch (err) {
        console.error('[admin.rag-settings.get] error', err);
        return NextResponse.json({ error: 'Failed to fetch RAG settings' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const supabase = getSupabase();

    try {
        const body = await request.json();
        const {
            useHybridSearch,
            useReranker,
            useQueryExpansion,
            useGraphBoost,
            topK,
            alpha,
            mmrLambda,
        } = body;

        const { data, error } = await supabase
            .from('rag_settings')
            .update({
                use_hybrid_search: Boolean(useHybridSearch),
                use_reranker: useReranker !== false,
                use_query_expansion: Boolean(useQueryExpansion),
                use_graph_boost: Boolean(useGraphBoost),
                top_k: Math.min(50, Math.max(1, Number(topK) || 10)),
                alpha: Math.min(1, Math.max(0, Number(alpha) || 0.5)),
                mmr_lambda: Math.min(1, Math.max(0, Number(mmrLambda) || 0.5)),
                updated_at: new Date().toISOString(),
            })
            .eq('id', 1)
            .select()
            .single();

        if (error) {
            console.error('[admin.rag-settings.put] error', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Flush all cached answers so queries use the new pipeline settings
        try {
            const cacheResult = await invalidateAllCache();
            console.log(`[admin.rag-settings.put] Cache flushed — Tier1: ${cacheResult.tier1Cleared}, Tier2: ${cacheResult.tier2Cleared} rows`);
        } catch (cacheErr) {
            console.warn('[admin.rag-settings.put] Cache flush failed:', (cacheErr as Error).message);
        }

        return NextResponse.json({
            success: true,
            useHybridSearch: data.use_hybrid_search,
            useReranker: data.use_reranker,
            useQueryExpansion: data.use_query_expansion,
            useGraphBoost: data.use_graph_boost,
            topK: data.top_k,
            alpha: data.alpha,
            mmrLambda: data.mmr_lambda,
            updatedAt: data.updated_at,
        });
    } catch (err) {
        console.error('[admin.rag-settings.put] error', err);
        return NextResponse.json({ error: 'Failed to update RAG settings' }, { status: 500 });
    }
}
