import { embedText, embedTexts } from './embeddings';
import type { RankedMatch } from './rag-engine';
import { getSupabase } from './supabase';

export type PreferredChunkType = 'proposition' | 'chunk' | 'any';

export interface VectorSearchResult {
    queryEmbedding: number[];
    matches: RankedMatch[];
    stats: {
        queryVectorHits: number;
        hydeVectorHits: number;
        expandedVectorHits: number;
        totalCandidates: number;
    };
}

const MATCHES_PER_VECTOR = 6;
const embeddingCache = new Map<string, number[]>();
export type EmbeddingStore = Map<string, number[]>;

export function createEmbeddingStore(): EmbeddingStore {
    return new Map<string, number[]>();
}

function normalizeEmbeddingKey(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function getEmbeddings(texts: string[], requestCache?: EmbeddingStore): Promise<number[][]> {
    const normalized = texts.map((text) => normalizeEmbeddingKey(text));
    const originalByKey = new Map<string, string>();

    normalized.forEach((key, index) => {
        if (!originalByKey.has(key)) {
            originalByKey.set(key, texts[index]);
        }
    });

    const uniqueMissing = [...new Set(normalized.filter((key) => {
        return !(requestCache?.has(key) || embeddingCache.has(key));
    }))];

    if (uniqueMissing.length === 1) {
        const source = originalByKey.get(uniqueMissing[0]) || uniqueMissing[0];
        const vector = await embedText(source);
        embeddingCache.set(uniqueMissing[0], vector);
        requestCache?.set(uniqueMissing[0], vector);
    } else if (uniqueMissing.length > 1) {
        const sources = uniqueMissing.map((key) => originalByKey.get(key) || key);
        const vectors = await embedTexts(sources);
        uniqueMissing.forEach((key, index) => {
            embeddingCache.set(key, vectors[index]);
            requestCache?.set(key, vectors[index]);
        });
    }

    return normalized.map((key) => {
        const vector = requestCache?.get(key) || embeddingCache.get(key);
        if (!vector) {
            throw new Error(`Missing embedding for key: ${key}`);
        }
        return vector;
    });
}

function preferredChunkWeights(preferredChunkType: PreferredChunkType): Record<string, number> {
    if (preferredChunkType === 'proposition') {
        return { proposition: 1.18, chunk: 1.0, image: 0.94, qa: 0.98 };
    }

    if (preferredChunkType === 'chunk') {
        return { proposition: 0.98, chunk: 1.12, image: 0.94, qa: 1.0 };
    }

    return { proposition: 1.05, chunk: 1.0, image: 0.97, qa: 1.0 };
}

async function searchSingleVector(params: {
    vector: number[];
    label: 'query' | 'expanded' | 'hyde';
    similarityThreshold: number;
    useMMR?: boolean;
    useWeighted?: boolean;
    mmrLambda?: number;
    recencyBoost?: number;
    preferredChunkType?: PreferredChunkType;
}): Promise<RankedMatch[]> {
    const {
        vector,
        label,
        similarityThreshold,
        useMMR = false,
        useWeighted = false,
        mmrLambda = 0.5,
        recencyBoost = 0.1,
        preferredChunkType = 'any',
    } = params;

    const supabase = getSupabase();

    if (useMMR) {
        const { data, error } = await supabase.rpc('search_hms_knowledge_mmr', {
            query_embedding: vector,
            similarity_threshold: similarityThreshold,
            match_count: MATCHES_PER_VECTOR,
            mmr_lambda: mmrLambda,
            recency_boost: recencyBoost,
        });

        if (error || !data) {
            return [];
        }

        type SupabaseRow = {
            id: string;
            question: string;
            answer: string;
            category: string;
            subcategory?: string;
            content: string;
            source: string;
            source_name: string;
            chunk_type?: string;
            similarity: number;
            final_score?: number;
        };

        return (data as SupabaseRow[]).map((row) => ({
            id: row.id,
            question: row.question,
            answer: row.answer,
            category: row.category,
            subcategory: row.subcategory || '',
            content: row.content,
            source: row.source,
            source_name: row.source_name,
            chunkType: row.chunk_type,
            vectorSimilarity: row.similarity,
            crossScore: 0,
            bm25Score: 0,
            finalScore: row.final_score ?? row.similarity,
            retrievalVector: label,
        }));
    }

    if (useWeighted) {
        const { data, error } = await supabase.rpc('search_hms_knowledge_weighted', {
            query_embedding: vector,
            similarity_threshold: similarityThreshold,
            match_count: MATCHES_PER_VECTOR,
            chunk_weights: preferredChunkWeights(preferredChunkType),
        });

        if (!error && data) {
            type SupabaseRow = {
                id: string;
                question: string;
                answer: string;
                category: string;
                subcategory?: string;
                content: string;
                source: string;
                source_name: string;
                chunk_type?: string;
                similarity: number;
                weighted_score?: number;
            };

            return (data as SupabaseRow[]).map((row) => ({
                id: row.id,
                question: row.question,
                answer: row.answer,
                category: row.category,
                subcategory: row.subcategory || '',
                content: row.content,
                source: row.source,
                source_name: row.source_name,
                chunkType: row.chunk_type,
                vectorSimilarity: row.similarity,
                crossScore: 0,
                bm25Score: 0,
                finalScore: row.weighted_score ?? row.similarity,
                retrievalVector: label,
            }));
        }
    }

    const { data, error } = await supabase.rpc('search_hms_knowledge', {
        query_embedding: vector,
        similarity_threshold: similarityThreshold,
        match_count: MATCHES_PER_VECTOR,
    });

    if (error || !data) {
        return [];
    }

    type SupabaseRow = {
        id: string;
        question: string;
        answer: string;
        category: string;
        subcategory?: string;
        content: string;
        source: string;
        source_name: string;
        chunk_type?: string;
        similarity: number;
    };

    return (data as SupabaseRow[]).map((row) => ({
        id: row.id,
        question: row.question,
        answer: row.answer,
        category: row.category,
        subcategory: row.subcategory || '',
        content: row.content,
        source: row.source,
        source_name: row.source_name,
        chunkType: row.chunk_type,
        vectorSimilarity: row.similarity,
        crossScore: 0,
        bm25Score: 0,
        finalScore: row.similarity,
        retrievalVector: label,
    }));
}

export async function runMultiVectorSearch(params: {
    query: string;
    queryEmbedding?: number[];
    expandedQueries: string[];
    hydeEmbedding: number[] | null;
    similarityThreshold: number;
    useMMR?: boolean;
    useWeighted?: boolean;
    mmrLambda?: number;
    recencyBoost?: number;
    preferredChunkType?: PreferredChunkType;
    includeQueryVector?: boolean;
    requestCache?: EmbeddingStore;
    maxExpandedQueries?: number;
}): Promise<VectorSearchResult> {
    const {
        query,
        queryEmbedding: providedQueryEmbedding,
        expandedQueries,
        hydeEmbedding,
        similarityThreshold,
        useMMR,
        useWeighted,
        mmrLambda,
        recencyBoost,
        preferredChunkType,
        includeQueryVector = true,
        requestCache,
        maxExpandedQueries = 4,
    } = params;

    const limitedExpansions = expandedQueries.slice(0, maxExpandedQueries);
    const expandedEmbeddings = limitedExpansions.length > 0 ? await getEmbeddings(limitedExpansions, requestCache) : [];
    const queryEmbedding = providedQueryEmbedding ?? (await getEmbeddings([query], requestCache))[0];
    const searchJobs: Array<Promise<RankedMatch[]>> = [
        ...(includeQueryVector
            ? [searchSingleVector({
                vector: queryEmbedding,
                label: 'query',
                similarityThreshold,
                useMMR,
                useWeighted,
                mmrLambda,
                recencyBoost,
                preferredChunkType,
            })]
            : []),
        ...expandedEmbeddings.map((embedding) => searchSingleVector({
            vector: embedding,
            label: 'expanded',
            similarityThreshold,
            useMMR,
            useWeighted,
            mmrLambda,
            recencyBoost,
            preferredChunkType,
        })),
    ];

    if (hydeEmbedding) {
        searchJobs.push(searchSingleVector({
            vector: hydeEmbedding,
            label: 'hyde',
            similarityThreshold,
            useMMR,
            useWeighted,
            mmrLambda,
            recencyBoost,
            preferredChunkType,
        }));
    }

    const groups = await Promise.all(searchJobs);
    const queryHits = includeQueryVector ? (groups[0] || []) : [];
    const expandedStartIndex = includeQueryVector ? 1 : 0;
    const expandedHits = groups.slice(expandedStartIndex, expandedStartIndex + expandedEmbeddings.length).flat();
    const hydeHits = hydeEmbedding ? (groups[groups.length - 1] || []) : [];
    const matches = [...queryHits, ...expandedHits, ...hydeHits];

    return {
        queryEmbedding,
        matches,
        stats: {
            queryVectorHits: queryHits.length,
            hydeVectorHits: hydeHits.length,
            expandedVectorHits: expandedHits.length,
            totalCandidates: matches.length,
        },
    };
}
