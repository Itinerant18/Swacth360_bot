/**
 * src/lib/feedback-reranker.ts
 *
 * Feedback-Driven Reranking Boost
 *
 * Uses stored user feedback (thumbs up/down) to adjust retrieval scores.
 * KB entries that have historically received positive feedback for similar
 * queries get a score boost; negatively-rated entries get penalized.
 *
 * The feedback signal is stored per knowledge-base entry and decays over
 * time so recent feedback matters more than old feedback.
 */

import { getSupabase } from './supabase';

export interface FeedbackSignal {
    knowledgeId: string;
    boost: number; // positive = good, negative = bad
}

// In-memory cache of feedback scores (refreshed periodically)
let feedbackCache: Map<string, number> | null = null;
let feedbackCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads aggregated feedback scores from the database.
 * Caches in memory for 5 minutes to avoid repeated DB calls.
 */
async function loadFeedbackScores(): Promise<Map<string, number>> {
    const now = Date.now();

    if (feedbackCache && (now - feedbackCacheTimestamp) < CACHE_TTL_MS) {
        return feedbackCache;
    }

    const supabase = getSupabase();

    try {
        const { data, error } = await supabase
            .from('feedback_scores')
            .select('knowledge_id, score');

        if (error || !data) {
            console.warn('[feedback-reranker] Failed to load scores:', error?.message);
            return feedbackCache ?? new Map();
        }

        const scores = new Map<string, number>();
        for (const row of data) {
            scores.set(row.knowledge_id, row.score);
        }

        feedbackCache = scores;
        feedbackCacheTimestamp = now;
        return scores;
    } catch (err) {
        console.warn('[feedback-reranker] Error:', (err as Error).message);
        return feedbackCache ?? new Map();
    }
}

/**
 * Applies feedback-based boost to a list of ranked matches.
 *
 * Positive feedback → up to +0.08 boost
 * Negative feedback → up to -0.06 penalty
 * Neutral/no feedback → no change
 *
 * Returns the same array with `finalScore` adjusted.
 */
export async function applyFeedbackBoost<T extends { id: string; finalScore: number }>(
    matches: T[],
): Promise<T[]> {
    const scores = await loadFeedbackScores();

    if (scores.size === 0) return matches;

    for (const match of matches) {
        const feedbackScore = scores.get(match.id);
        if (feedbackScore === undefined) continue;

        // Clamp boost: positive feedback gives up to +0.08, negative up to -0.06
        const boost = Math.max(-0.06, Math.min(0.08, feedbackScore * 0.02));
        match.finalScore += boost;
    }

    // Re-sort after boost
    matches.sort((a, b) => b.finalScore - a.finalScore);
    return matches;
}

/**
 * Records a feedback signal for a specific query-answer pair.
 * Called when user clicks thumbs up/down.
 *
 * @param knowledgeId - The KB entry ID that was used in the answer
 * @param isPositive - true for thumbs up, false for thumbs down
 * @param queryText - The original query (for analytics)
 */
export async function recordFeedback(
    knowledgeId: string,
    isPositive: boolean,
    queryText?: string,
): Promise<void> {
    const supabase = getSupabase();
    const delta = isPositive ? 1 : -1;

    try {
        // Upsert into feedback_scores: increment/decrement the running score
        const { error } = await supabase.rpc('upsert_feedback_score', {
            p_knowledge_id: knowledgeId,
            p_delta: delta,
            p_query_text: queryText ?? null,
        });

        if (error) {
            console.warn('[feedback-reranker] Record failed:', error.message);
        }

        // Invalidate cache so next request picks up the change
        feedbackCache = null;
    } catch (err) {
        console.warn('[feedback-reranker] Error:', (err as Error).message);
    }
}

/**
 * Resets the feedback cache (useful after admin KB changes).
 */
export function resetFeedbackCache(): void {
    feedbackCache = null;
    feedbackCacheTimestamp = 0;
}
