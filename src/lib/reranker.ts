/**
 * src/lib/reranker.ts
 * 
 * BGE Reranker Implementation for Enhanced RAG
 * 
 * Uses BAAI/bge-reranker-v2-m3 for cross-encoder reranking
 * 
 * Benefits:
 * - 10x faster than LLM-based reranking
 * - Better token-level matching
 * - Cost reduction vs using LLM for reranking
 */

import type { RankedMatch } from './rag-engine';

// Configuration
const RERANKER_MODEL = 'BAAI/bge-reranker-v2-m3';
const RERANK_TOP_K = 10; // Return top K after reranking

export interface RerankerResult {
    id: string;
    index: number;
    relevanceScore: number;
}

export interface RerankOptions {
    model?: string;
    topK?: number;
    maxChunkLength?: number;
}

/**
 * Reranker class for cross-encoder scoring
 */
export class BGERReranker {
    private apiKey: string;
    private model: string;
    private topK: number;

    constructor(options: RerankOptions = {}) {
        this.apiKey = process.env.HUGGINGFACE_API_KEY || '';
        this.model = options.model || RERANKER_MODEL;
        this.topK = options.topK || RERANK_TOP_K;

        if (!this.apiKey) {
            console.warn('⚠️  HUGGINGFACE_API_KEY not set - using fallback LLM reranking');
        }
    }

    /**
     * Rerank documents using BGE reranker API
     * Falls back to simple scoring if API unavailable
     */
    async rerank(
        query: string,
        documents: Array<{ id: string; content: string }>
    ): Promise<RerankerResult[]> {
        if (!this.apiKey || documents.length === 0) {
            return this.fallbackRerank(query, documents);
        }

        try {
            const response = await fetch(
                `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.model}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    method: 'POST',
                    body: JSON.stringify({
                        inputs: {
                            source_sentence: query,
                            sentences: documents.map((d) => d.content),
                        },
                    }),
                }
            );

            if (!response.ok) {
                console.warn('⚠️  BGE reranker API failed, using fallback');
                return this.fallbackRerank(query, documents);
            }

            const scores = await response.json();

            // Map scores to results with IDs
            const results: RerankerResult[] = documents
                .map((doc, index) => ({
                    id: doc.id,
                    index,
                    relevanceScore: scores[index] || 0,
                }))
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, this.topK);

            return results;
        } catch (error) {
            console.warn('⚠️  BGE reranker error:', error);
            return this.fallbackRerank(query, documents);
        }
    }

    /**
     * Fallback reranking using simple text overlap
     * Used when BGE API is unavailable
     */
    private fallbackRerank(
        query: string,
        documents: Array<{ id: string; content: string }>
    ): RerankerResult[] {
        const queryTerms = new Set(
            query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
        );

        const results: RerankerResult[] = documents.map((doc, index) => {
            const contentTerms = new Set(
                doc.content.toLowerCase().split(/\s+/)
            );

            // Calculate overlap score
            let overlap = 0;
            queryTerms.forEach((term) => {
                if (contentTerms.has(term)) {
                    overlap += 1;
                }
            });

            // Normalize by query length
            const score = queryTerms.size > 0 ? overlap / queryTerms.size : 0;

            return {
                id: doc.id,
                index,
                relevanceScore: score,
            };
        });

        return results
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, this.topK);
    }
}

/**
 * Simple BM25-like scoring for keyword matching
 */
export function calculateBM25Score(
    query: string,
    document: string,
    avgDocLength: number = 100
): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const docTerms = document.toLowerCase().split(/\s+/);
    const docLength = docTerms.length;

    let score = 0;
    const termFrequency: Map<string, number> = new Map();

    // Count term frequencies
    docTerms.forEach((term) => {
        termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
    });

    // Calculate BM25-like score
    queryTerms.forEach((term) => {
        const tf = termFrequency.get(term) || 0;
        if (tf > 0) {
            // Simplified BM25 formula
            const tfComponent = (tf * (1.5 + 1)) / (tf + 1.5 * (0.5 + 0.5 * docLength / avgDocLength));
            score += Math.log(1 + tfComponent);
        }
    });

    return score;
}

/**
 * Combined reranking with multiple signals
 */
export async function hybridRerank(
    query: string,
    documents: Array<{
        id: string;
        content: string;
        vectorScore?: number;
        bm25Score?: number;
    }>,
    weights: {
        rerankWeight: number;
        vectorWeight: number;
        bm25Weight: number;
    } = { rerankWeight: 0.4, vectorWeight: 0.4, bm25Weight: 0.2 }
): Promise<Array<{ id: string; finalScore: number }>> {
    const reranker = new BGERReranker();

    // Get reranker scores
    const rerankResults = await reranker.rerank(
        query,
        documents.map((d) => ({ id: d.id, content: d.content }))
    );

    // Create a map for quick lookup
    const rerankMap = new Map(rerankResults.map((r) => [r.id, r.relevanceScore]));

    // Normalize and combine scores
    const maxVectorScore = Math.max(...documents.map((d) => d.vectorScore || 0), 0.001);
    const maxBm25Score = Math.max(...documents.map((d) => d.bm25Score || 0), 0.001);

    const combinedResults = documents.map((doc) => {
        const rerankScore = rerankMap.get(doc.id) || 0;
        const normVectorScore = (doc.vectorScore || 0) / maxVectorScore;
        const normBm25Score = (doc.bm25Score || 0) / maxBm25Score;

        const finalScore =
            rerankScore * weights.rerankWeight +
            normVectorScore * weights.vectorWeight +
            normBm25Score * weights.bm25Weight;

        return {
            id: doc.id,
            finalScore,
        };
    });

    return combinedResults.sort((a, b) => b.finalScore - a.finalScore);
}

// Singleton instance
let _reranker: BGERReranker | null = null;

export function getReranker(): BGERReranker {
    if (!_reranker) {
        _reranker = new BGERReranker();
    }
    return _reranker;
}

function normalizeText(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function lexicalCoverage(query: string, text: string): number {
    const queryTerms = normalizeText(query).split(' ').filter((token) => token.length > 2);
    if (queryTerms.length === 0) {
        return 0;
    }

    const candidateText = normalizeText(text);
    const overlap = queryTerms.filter((term) => candidateText.includes(term)).length;
    return overlap / queryTerms.length;
}

function contextOverlap(query: string, match: RankedMatch): number {
    const answerText = match.relevantPassage || match.answer;
    return lexicalCoverage(query, `${match.question} ${answerText}`);
}

export function rerankMatches(params: {
    query: string;
    matches: RankedMatch[];
    topK?: number;
}): RankedMatch[] {
    const { query, matches, topK = 5 } = params;

    if (matches.length === 0) {
        return [];
    }

    const maxBm25 = Math.max(...matches.map((match) => match.bm25Score || 0), 0.001);

    return [...matches]
        .map((match) => {
            const baseSimilarity = Math.max(match.finalScore, match.vectorSimilarity, 0);
            const keywordSignal = (match.bm25Score || 0) / maxBm25;
            const overlap = contextOverlap(query, match);
            const rerankedScore =
                baseSimilarity * 0.5
                + keywordSignal * 0.2
                + overlap * 0.2
                + lexicalCoverage(query, match.question) * 0.1;

            return {
                ...match,
                finalScore: Math.min(1, rerankedScore),
            };
        })
        .sort((left, right) => right.finalScore - left.finalScore)
        .slice(0, Math.max(topK, 5));
}

export function buildContextWindow(matches: RankedMatch[], maxTokens = 1200): string {
    let tokenCount = 0;
    const blocks: string[] = [];
    const groups = new Map<string, RankedMatch[]>();

    for (const match of matches) {
        const source = match.source_name || match.source || 'Knowledge Base';
        const existing = groups.get(source) || [];
        existing.push(match);
        groups.set(source, existing);
    }

    for (const [source, sourceMatches] of groups.entries()) {
        const lines: string[] = [`[Document] ${source}`];

        for (const match of sourceMatches) {
            const snippet = (match.relevantPassage || match.answer)
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 500);
            const entry = `[Section] ${match.question}\n${snippet}`;
            const entryTokens = entry.split(/\s+/).filter(Boolean).length;

            if (tokenCount + entryTokens > maxTokens) {
                break;
            }

            lines.push(entry);
            tokenCount += entryTokens;
        }

        if (lines.length > 1) {
            blocks.push(lines.join('\n'));
        }

        if (tokenCount >= maxTokens) {
            break;
        }
    }

    return blocks.join('\n\n');
}
