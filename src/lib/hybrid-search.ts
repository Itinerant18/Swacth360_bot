/**
 * src/lib/hybrid-search.ts
 * 
 * Hybrid Search Implementation for Enhanced RAG
 * 
 * Combines:
 * - Dense (vector) search for semantic matching
 * - Sparse (BM25) search for keyword matching
 * - Knowledge graph boosting for related entities
 */

import { embedText } from './embeddings';
import { getSupabase } from './supabase';
import { calculateBM25Score, getReranker } from './reranker';

export interface HybridSearchOptions {
    alpha?: number; // Weight for vector vs BM25 (0.5 = equal)
    topK?: number;
    minSimilarity?: number;
    useReranker?: boolean;
    useGraphBoost?: boolean;
    queryEntities?: string[];
}

export interface HybridSearchResult {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory: string;
    content: string;
    source: string;
    source_name: string;
    chunk_type: string;
    entities: string[];
    vectorScore: number;
    bm25Score: number;
    graphBoost: number;
    hybridScore: number;
}

const DEFAULT_OPTIONS: Required<HybridSearchOptions> = {
    alpha: 0.5,
    topK: 10,
    minSimilarity: 0.15,
    useReranker: true,
    useGraphBoost: true,
    queryEntities: [],
};

/**
 * Perform hybrid search combining vector and BM25
 */
export async function hybridSearch(
    query: string,
    options: HybridSearchOptions = {}
): Promise<HybridSearchResult[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const supabase = getSupabase();

    // Embed the query
    const queryVector = await embedText(query);

    // 1. Vector search
    const { data: vectorResults, error: vectorError } = await supabase.rpc(
        'hybrid_search_hms',
        {
            query_text: query,
            query_vector: queryVector,
            alpha: opts.alpha,
            top_k: opts.topK * 2, // Get more for reranking
            similarity_threshold: opts.minSimilarity,
        }
    );

    if (vectorError) {
        console.warn('⚠️  Hybrid search RPC failed, using fallback');
        return fallbackHybridSearch(query, queryVector, opts);
    }

    if (!vectorResults || vectorResults.length === 0) {
        return [];
    }

    // 2. Calculate BM25 scores for each result
    const resultsWithBM25: HybridSearchResult[] = vectorResults.map((row: any) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        category: row.category,
        subcategory: row.subcategory,
        content: row.content,
        source: row.source,
        source_name: row.source_name,
        chunk_type: row.chunk_type,
        entities: row.entities || [],
        vectorScore: row.similarity || row.hybrid_score || 0,
        bm25Score: calculateBM25Score(query, row.content),
        graphBoost: 0,
        hybridScore: row.hybrid_score || 0,
    }));

    // 3. Apply knowledge graph boost if enabled
    if (opts.useGraphBoost && opts.queryEntities.length > 0) {
        await applyGraphBoost(resultsWithBM25, opts.queryEntities);
    }

    // 4. Apply reranking if enabled
    if (opts.useReranker) {
        const reranked = await rerankResults(query, resultsWithBM25, opts.topK);
        return reranked;
    }

    // 5. Normalize scores and return
    return normalizeAndSort(resultsWithBM25, opts.alpha, opts.topK);
}

/**
 * Fallback when Supabase RPC is unavailable
 */
async function fallbackHybridSearch(
    query: string,
    queryVector: number[],
    opts: Required<HybridSearchOptions>
): Promise<HybridSearchResult[]> {
    const supabase = getSupabase();

    // Vector search
    const { data: vectorResults } = await supabase
        .from('hms_knowledge')
        .select('*')
        .not('embedding', 'is', null)
        .eq('is_archived', false)
        .limit(opts.topK * 3);

    if (!vectorResults) return [];

    // Calculate vector similarities
    const resultsWithScores = vectorResults.map((row: any) => {
        const vectorScore = row.embedding
            ? cosineSimilarity(queryVector, row.embedding)
            : 0;
        const bm25Score = calculateBM25Score(query, row.content || row.question);

        return {
            ...row,
            vectorScore,
            bm25Score,
            graphBoost: 0,
            hybridScore: vectorScore * opts.alpha + bm25Score * (1 - opts.alpha),
        };
    });

    // Filter by threshold
    const filtered = resultsWithScores.filter(
        (r: any) => r.vectorScore >= opts.minSimilarity
    );

    // Sort and return
    return filtered
        .sort((a: any, b: any) => b.hybridScore - a.hybridScore)
        .slice(0, opts.topK)
        .map((row: any) => ({
            id: row.id,
            question: row.question,
            answer: row.answer,
            category: row.category,
            subcategory: row.subcategory,
            content: row.content,
            source: row.source,
            source_name: row.source_name,
            chunk_type: row.chunk_type,
            entities: row.entities || [],
            vectorScore: row.vectorScore,
            bm25Score: row.bm25Score,
            graphBoost: 0,
            hybridScore: row.hybridScore,
        }));
}

/**
 * Apply knowledge graph boost to results
 */
async function applyGraphBoost(
    results: HybridSearchResult[],
    queryEntities: string[]
): Promise<void> {
    if (queryEntities.length === 0) return;

    const supabase = getSupabase();

    // Find entities related to query entities
    const { data: graphRelations } = await supabase
        .from('knowledge_graph')
        .select('entity_a, entity_b, confidence, relationship')
        .in('entity_a', queryEntities);

    if (!graphRelations) return;

    // Create a map of entity relationships
    const entityBoost = new Map<string, number>();
    graphRelations.forEach((rel) => {
        const currentBoost = entityBoost.get(rel.entity_b) || 0;
        entityBoost.set(
            rel.entity_b,
            currentBoost + rel.confidence * 0.1
        );
    });

    // Apply boost to matching entities
    results.forEach((result) => {
        const entityMatches = result.entities.filter((e) =>
            queryEntities.includes(e)
        );
        if (entityMatches.length > 0) {
            const boost = entityMatches.reduce(
                (sum, e) => sum + (entityBoost.get(e) || 0),
                0
            );
            result.graphBoost = Math.min(boost, 0.2); // Cap at 0.2
            result.hybridScore += result.graphBoost;
        }
    });
}

/**
 * Rerank results using BGE reranker
 */
async function rerankResults(
    query: string,
    results: HybridSearchResult[],
    topK: number
): Promise<HybridSearchResult[]> {
    const reranker = getReranker();

    const rerankInput = results.map((r) => ({
        id: r.id,
        content: r.content || r.question,
    }));

    const reranked = await reranker.rerank(query, rerankInput);

    // Map reranked scores back to results
    const scoreMap = new Map(reranked.map((r) => [r.id, r.relevanceScore]));

    results.forEach((r) => {
        const rerankScore = scoreMap.get(r.id) || 0;
        // Combine rerank score with hybrid score
        r.hybridScore = r.hybridScore * 0.5 + rerankScore * 0.5;
    });

    return results
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, topK);
}

/**
 * Normalize and sort results
 */
function normalizeAndSort(
    results: HybridSearchResult[],
    alpha: number,
    topK: number
): HybridSearchResult[] {
    const maxVector = Math.max(...results.map((r) => r.vectorScore), 0.001);
    const maxBm25 = Math.max(...results.map((r) => r.bm25Score), 0.001);

    return results
        .map((r) => {
            const normVector = r.vectorScore / maxVector;
            const normBm25 = r.bm25Score / maxBm25;
            return {
                ...r,
                hybridScore:
                    normVector * alpha +
                    normBm25 * (1 - alpha) +
                    r.graphBoost,
            };
        })
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, topK);
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Dynamic strategy selection based on query type
 */
export function selectSearchStrategy(queryType: string): HybridSearchOptions {
    switch (queryType) {
        case 'diagnostic':
            // Focus on BM25 for error codes
            return { alpha: 0.3, topK: 8, useReranker: true, useGraphBoost: true };

        case 'procedural':
            // Balanced with HYDE
            return { alpha: 0.5, topK: 10, useReranker: true, useGraphBoost: false };

        case 'factual':
            // High precision
            return { alpha: 0.7, topK: 5, useReranker: true, useGraphBoost: false };

        case 'visual':
            // More candidates for diagram generation
            return { alpha: 0.5, topK: 12, useReranker: false, useGraphBoost: true };

        case 'comparative':
            // Multiple perspectives
            return { alpha: 0.4, topK: 10, useReranker: true, useGraphBoost: true };

        default:
            // Default balanced
            return { alpha: 0.5, topK: 10, useReranker: true, useGraphBoost: false };
    }
}
