import type { QueryAnalysis, RankedMatch } from './rag-engine';
import { raptorSearch } from './raptor-retrieval';

export async function retrieveRaptorContexts(params: {
    queryEmbedding: number[];
    analysis: QueryAnalysis;
    topK?: number;
    threshold?: number;
}): Promise<RankedMatch[]> {
    const { queryEmbedding, analysis, topK, threshold } = params;
    return raptorSearch(queryEmbedding, analysis, {
        topK,
        threshold,
    });
}
