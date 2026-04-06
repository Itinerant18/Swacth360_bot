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
import type { RankedMatch } from './rag-engine';

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

interface HybridSearchRPCResult {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory: string;
    content: string;
    source: string;
    source_name: string;
    chunk_type: string;
    entities: string[] | null;
    similarity?: number;
    hybrid_score?: number;
}

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
        console.warn('âš ï¸  Hybrid search RPC failed, using fallback');
        return fallbackHybridSearch(query, queryVector, opts as Required<HybridSearchOptions>);
    }

    if (!vectorResults || (vectorResults as HybridSearchRPCResult[]).length === 0) {
        return [];
    }

    // 2. Calculate BM25 scores for each result
    const resultsWithBM25: HybridSearchResult[] = (vectorResults as HybridSearchRPCResult[]).map((row) => ({
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultsWithScores = (vectorResults as any[]).map((row) => {
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
        (r) => r.vectorScore >= opts.minSimilarity
    );

    // Sort and return
    return filtered
        .sort((a, b) => b.hybridScore - a.hybridScore)
        .slice(0, opts.topK)
        .map((row) => ({
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

interface KeywordSearchRow {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory?: string;
    content: string;
    source: string;
    source_name: string;
    chunk_type?: string;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractTerms(query: string): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'for', 'with', 'that', 'this', 'what', 'why',
        'how', 'when', 'where', 'which', 'who', 'from', 'into', 'about', 'please',
    ]);

    return [...new Set(
        normalize(query)
            .split(' ')
            .filter((term) => term.length > 2 && !stopWords.has(term))
    )].slice(0, 5);
}

function escapeLike(term: string): string {
    return term.replace(/[%_]/g, '').trim();
}

function buildKeywordMatch(query: string, row: KeywordSearchRow): RankedMatch {
    const bm25Score = calculateBM25Score(query, `${row.question} ${row.answer} ${row.content}`);

    return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        category: row.category,
        subcategory: row.subcategory || '',
        content: row.content,
        source: row.source,
        source_name: row.source_name,
        chunkType: row.chunk_type,
        vectorSimilarity: 0,
        crossScore: 0,
        bm25Score,
        finalScore: Math.min(1, bm25Score),
        retrievalVector: 'expanded',
    };
}

export async function searchKeywordMatches(params: {
    query: string;
    topK?: number;
    minimumScore?: number;
}): Promise<RankedMatch[]> {
    const { query, topK = 8, minimumScore = 0.08 } = params;
    const terms = extractTerms(query).slice(0, 3);

    if (terms.length === 0) {
        return [];
    }

    const filters = terms.flatMap((term) => {
        const escaped = escapeLike(term);
        return [
            `question.ilike.%${escaped}%`,
            `answer.ilike.%${escaped}%`,
            `content.ilike.%${escaped}%`,
        ];
    });

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('hms_knowledge')
            .select('id, question, answer, category, subcategory, content, source, source_name, chunk_type')
            .eq('is_archived', false)
            .or(filters.join(','))
            .limit(Math.max(topK * 3, 12));

        if (error || !data) {
            return [];
        }

        return (data as KeywordSearchRow[])
            .map((row) => buildKeywordMatch(query, row))
            .filter((match) => match.bm25Score >= minimumScore)
            .sort((left, right) => right.bm25Score - left.bm25Score)
            .slice(0, topK);
    } catch (err) {
        console.warn('[hybridSearch] keyword search failed:', (err as Error).message);
        return [];
    }
}

export function mergeHybridMatches(params: {
    query: string;
    vectorMatches: RankedMatch[];
    keywordMatches: RankedMatch[];
    topK?: number;
}): RankedMatch[] {
    const { query, vectorMatches, keywordMatches, topK = 10 } = params;
    const merged = new Map<string, RankedMatch>();

    for (const match of vectorMatches) {
        merged.set(match.id, { ...match });
    }

    for (const keywordMatch of keywordMatches) {
        const existing = merged.get(keywordMatch.id);

        if (!existing) {
            merged.set(keywordMatch.id, {
                ...keywordMatch,
                finalScore: Math.min(1, keywordMatch.bm25Score * 0.6 + 0.2),
            });
            continue;
        }

        const lexicalBoost = calculateBM25Score(query, `${existing.question} ${existing.answer}`);
        merged.set(keywordMatch.id, {
            ...existing,
            bm25Score: Math.max(existing.bm25Score, keywordMatch.bm25Score, lexicalBoost),
            finalScore: Math.min(
                1,
                existing.finalScore * 0.72
                + Math.max(existing.bm25Score, keywordMatch.bm25Score, lexicalBoost) * 0.28
            ),
        });
    }

    return [...merged.values()]
        .sort((left, right) => right.finalScore - left.finalScore)
        .slice(0, topK);
}
