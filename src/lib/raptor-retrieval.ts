/**
 * src/lib/raptor-retrieval.ts
 *
 * RAPTOR retrieval layer — plugs into rag-engine.ts alongside existing
 * vector search. Called as a 4th parallel search alongside query/hyde/expanded
 * vectors, then merged into the same RankedMatch pool.
 *
 * Usage in rag-engine.ts (inside retrieve()):
 *
 *   import { raptorSearch } from './raptor-retrieval';
 *
 *   // Alongside existing 3 vector searches:
 *   const raptorHits = await raptorSearch(queryEmbedding, analysis);
 *
 *   // Then merge into candidateMap as normal — RAPTOR hits get a boost
 *   // for complex/comparative queries.
 */

import { getSupabase } from './supabase';
import type { RankedMatch, QueryAnalysis } from './rag-engine';

// ─── Config ───────────────────────────────────────────────────────────────────

const RAPTOR_CONFIG = {
    // Which query types benefit most from RAPTOR (cross-document synthesis)
    ENABLED_FOR_TYPES: new Set(['comparative', 'factual', 'unknown']),

    // Always enable for complex queries
    ALWAYS_ENABLE_FOR_COMPLEXITY: 'complex' as const,

    // Retrieval settings
    DEFAULT_THRESHOLD: 0.20,
    DEFAULT_TOP_K: 6,
    MAX_LEVEL: 2,    // search L0 + L1 + L2

    // Score bonus for cluster hits (they cover more ground)
    LEVEL1_BOOST: 0.05,
    LEVEL2_BOOST: 0.08,
};

// ─── RAPTOR Search ────────────────────────────────────────────────────────────

/**
 * raptorSearch()
 *
 * Searches the RAPTOR tree at all levels simultaneously.
 * Returns RankedMatch-compatible objects so they slot into the
 * existing merge/rerank pipeline with zero changes needed.
 *
 * Level-0 hits: same as regular vector hits (no boost)
 * Level-1 hits: +0.05 boost (topic-level summaries)
 * Level-2 hits: +0.08 boost (cross-topic synthesis)
 */
export async function raptorSearch(
    queryEmbedding: number[],
    analysis: QueryAnalysis,
    options?: {
        threshold?: number;
        topK?: number;
        maxLevel?: number;
    }
): Promise<RankedMatch[]> {
    // Decide if RAPTOR adds value for this query
    const shouldUse =
        RAPTOR_CONFIG.ENABLED_FOR_TYPES.has(analysis.type) ||
        analysis.complexity === RAPTOR_CONFIG.ALWAYS_ENABLE_FOR_COMPLEXITY ||
        analysis.entities.length >= 3; // many entities → likely cross-document

    if (!shouldUse) {
        return [];
    }

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc('search_raptor_multilevel', {
            query_embedding: queryEmbedding,
            similarity_threshold: options?.threshold ?? RAPTOR_CONFIG.DEFAULT_THRESHOLD,
            match_count: options?.topK ?? RAPTOR_CONFIG.DEFAULT_TOP_K,
            max_level: options?.maxLevel ?? RAPTOR_CONFIG.MAX_LEVEL,
        });

        if (error || !data?.length) {
            console.log(`  🌳 RAPTOR: 0 cluster hits`);
            return [];
        }

        console.log(`  🌳 RAPTOR: ${data.length} cluster hits`);

        // Map to RankedMatch format
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (data as any[]).map((row): RankedMatch => {
            const levelBoost =
                row.raptor_level === 2 ? RAPTOR_CONFIG.LEVEL2_BOOST :
                    row.raptor_level === 1 ? RAPTOR_CONFIG.LEVEL1_BOOST : 0;

            const vectorSimilarity = (row.similarity ?? 0) + levelBoost;

            return {
                id: row.id,
                question: buildSummaryQuestion(row),
                answer: row.content,
                category: row.category ?? 'General Knowledge',
                subcategory: `RAPTOR L${row.raptor_level}`,
                content: row.content,
                source: 'raptor_cluster',
                source_name: (row.source_names ?? []).join(', ') || 'HMS Knowledge Base',
                vectorSimilarity,
                crossScore: 0,  // filled by cross-encoder in rag-engine
                bm25Score: 0,  // filled by BM25 scorer in rag-engine
                finalScore: vectorSimilarity, // overwritten by reranker
                relevantPassage: row.content.slice(0, 300),
                retrievalVector: 'query' as const,
                raptorLevel: row.raptor_level,
                childCount: row.child_count ?? 1,
            };
        });

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`âš ï¸  RAPTOR search failed: ${message}`);
        return []; // graceful degradation â€” falls back to regular vector search
    }
}

/**
 * buildSummaryQuestion()
 *
 * RAPTOR clusters don't have a natural "question" field.
 * We synthesize one from the content and entities for BM25 scoring.
 */
function buildSummaryQuestion(row: {
    content: string;
    category: string;
    entities: string[];
    raptor_level: number;
}): string {
    const entityStr = (row.entities ?? []).slice(0, 3).join(', ');
    const prefix = row.raptor_level >= 2 ? 'Overview of' : 'About';
    return `${prefix} ${row.category}${entityStr ? `: ${entityStr}` : ''}`;
}

// ─── Patch for rag-engine.ts retrieve() ──────────────────────────────────────
//
// Add these lines inside the retrieve() function in rag-engine.ts,
// alongside the existing 3 parallel vector searches:
//
// EXISTING code (3 parallel searches):
//   const [queryHits, hydeHits, expandedHits] = await Promise.all([...]);
//
// PATCHED code (4 parallel searches, RAPTOR as 4th):
//   const [queryHits, hydeHits, expandedHits, raptorHits] = await Promise.all([
//     supabase.rpc('search_hms_knowledge', { ... }),     // existing
//     supabase.rpc('search_hms_knowledge', { ... }),     // existing (HYDE)
//     supabase.rpc('search_hms_knowledge', { ... }),     // existing (expanded)
//     raptorSearch(queryVector, queryAnalysis),           // NEW
//   ]);
//
// Then in the merge loop, include raptorHits alongside the others.
// RAPTOR hits have retrievalVector='query' so they get +0.05 multi-vector boost
// if the same id appears in another result set (unlikely but possible).
//
// ─── Full patch for the merge section of retrieve() ──────────────────────────

/**
 * mergeWithRaptorHits()
 *
 * Merges RAPTOR results into the existing candidate map.
 * Call this right after the existing 3-vector merge loop.
 *
 * @param candidateMap  The existing Map<id, RankedMatch> from rag-engine
 * @param raptorHits    Results from raptorSearch()
 */
export function mergeWithRaptorHits(
    candidateMap: Map<string, RankedMatch>,
    raptorHits: (RankedMatch & { raptorLevel?: number })[],
): void {
    for (const hit of raptorHits) {
        if (candidateMap.has(hit.id)) {
            // Boost existing entry if RAPTOR also found it
            const existing = candidateMap.get(hit.id)!;
            existing.vectorSimilarity = Math.min(
                existing.vectorSimilarity + 0.05,
                1.0
            );
        } else {
            // New entry from RAPTOR — add to candidate pool
            candidateMap.set(hit.id, hit);
        }
    }
}

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
