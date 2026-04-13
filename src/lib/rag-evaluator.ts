/**
 * src/lib/rag-evaluator.ts
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  EVALS — Architecture Node: "Evals ↔ Answer"               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Implements ragas-inspired evaluation metrics, running async
 * after every RAG response (non-blocking — never slows the user).
 *
 * Metrics:
 *
 * 1. FAITHFULNESS (0-1)
 *    Does the answer contain ONLY claims supported by the KB sources?
 *    High faithfulness = no hallucination.
 *    Method: extract claims from answer, check each against context.
 *    ragas equivalent: faithfulness score
 *
 * 2. ANSWER RELEVANCY (0-1)
 *    Does the answer actually address what was asked?
 *    High relevancy = on-topic, direct response.
 *    Method: embed question + embed answer → cosine similarity.
 *    ragas equivalent: answer_relevancy
 *
 * 3. CONTEXT RECALL (0-1)
 *    Did the retrieved chunks contain the information needed to answer?
 *    High recall = retrieval found the right documents.
 *    Method: check if key answer terms appear in retrieved context.
 *    ragas equivalent: context_recall
 *
 * 4. CONTEXT PRECISION (0-1)
 *    Were the retrieved chunks actually relevant? (no noise)
 *    High precision = no irrelevant chunks retrieved.
 *    Method: finalScore distribution of retrieved matches.
 *
 * All scores are stored in `rag_evals` table for the admin dashboard.
 * The evaluator runs AFTER the response streams — zero latency impact.
 */

import { ChatOpenAI } from '@langchain/openai';
import { extractJson } from './llm';
import { embedText } from './embeddings';
import { getSupabase } from './supabase';
import type { RankedMatch, RAGResult } from './rag-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EvalScores {
    faithfulness: number;   // 0-1: is the answer grounded in sources?
    answerRelevancy: number;   // 0-1: does the answer address the question?
    contextRecall: number;   // 0-1: did retrieved chunks have the answer?
    contextPrecision: number;   // 0-1: were retrieved chunks relevant?
    overallScore: number;   // weighted average
}

export interface EvalResult {
    scores: EvalScores;
    queryText: string;
    answerText: string;
    answerMode: string;
    matchCount: number;
    latencyMs: number;
    flags: EvalFlag[];    // issues detected
}

export interface EvalFlag {
    metric: string;
    severity: 'warning' | 'critical';
    message: string;
}

// ─── Score Weights ────────────────────────────────────────────────────────────

const WEIGHTS = {
    faithfulness: 0.35,   // most important — no hallucination
    answerRelevancy: 0.30,   // did we answer the question?
    contextRecall: 0.20,   // did retrieval find the right docs?
    contextPrecision: 0.15,   // were retrieved docs relevant?
};

const THRESHOLDS = {
    faithfulness: 0.70,   // below this → hallucination warning
    answerRelevancy: 0.60,   // below this → off-topic answer warning
    contextRecall: 0.50,   // below this → retrieval gap
    contextPrecision: 0.40,   // below this → noisy retrieval
};

// ─── Metric 1: Faithfulness ───────────────────────────────────────────────────

/**
 * Checks if the answer is grounded in the KB context.
 *
 * Strategy (fast, no extra LLM call for simple cases):
 * 1. Extract key factual claims from the answer (noun phrases + numbers)
 * 2. For each claim, check if it appears (verbatim or semantically) in context
 * 3. Score = supported_claims / total_claims
 *
 * For complex answers, uses LLM to extract and verify claims.
 */
async function scoreFaithfulness(
    answer: string,
    context: string,
    llm: ChatOpenAI,
    answerMode: string,
): Promise<number> {
    // General mode has no KB context — faithfulness is N/A (return neutral)
    if (answerMode === 'general' || !context.trim()) return 0.5;

    // Fast path: short answers — check term overlap
    if (answer.length < 200) {
        return fastFaithfulnessCheck(answer, context);
    }

    // LLM path: extract claims and verify each
    try {
        const prompt = `You are evaluating if an AI answer is faithful to its source documents.

SOURCE DOCUMENTS:
${context.slice(0, 2000)}

AI ANSWER:
${answer.slice(0, 500)}

Task: List the specific factual claims made in the answer (numbers, codes, procedures, specifications).
For each claim, determine if it is SUPPORTED or UNSUPPORTED by the source documents.

Respond ONLY with JSON:
{"claims": [{"claim": "...", "supported": true/false}]}

If no verifiable claims, respond: {"claims": []}`;

        const result = await llm.invoke(prompt);
        const parsed = extractJson<{ claims?: { claim: string; supported: boolean }[] }>(result.content as string);
        const claims = parsed?.claims ?? [];

        if (claims.length === 0) return 0.75; // no verifiable claims = neutral

        const supported = claims.filter(c => c.supported).length;
        return supported / claims.length;
    } catch {
        return fastFaithfulnessCheck(answer, context);
    }
}

function fastFaithfulnessCheck(answer: string, context: string): number {
    const contextLower = context.toLowerCase();

    // Extract technical terms from answer (numbers, codes, specific terms)
    const technicalTerms = [
        ...answer.matchAll(/\b([Ee]\d{3,4}|\d+V\s*DC|\d+\s*m[Aa]|\d+\s*bps|TB\d+[+-]?|[AB][+-])\b/g),
    ].map(m => m[1].toLowerCase());

    // Extract key nouns/phrases (4+ char words not in stopwords)
    const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'their', 'when', 'also', 'only', 'into', 'than', 'then', 'some', 'such', 'more']);
    const keyTerms = answer
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !stopWords.has(w))
        .slice(0, 15);

    const allTerms = [...new Set([...technicalTerms, ...keyTerms])];
    if (allTerms.length === 0) return 0.75;

    const found = allTerms.filter(term => contextLower.includes(term)).length;
    return Math.min(found / allTerms.length + 0.1, 1.0); // small baseline bonus
}

// ─── Metric 2: Answer Relevancy ───────────────────────────────────────────────

/**
 * Measures how well the answer addresses the question.
 * Uses embedding cosine similarity: embed(question) · embed(answer).
 * High similarity = answer is on-topic.
 */
async function scoreAnswerRelevancy(
    question: string,
    answer: string,
): Promise<number> {
    try {
        const [qVec, aVec] = await Promise.all([
            embedText(question),
            embedText(answer.slice(0, 500)), // cap to avoid token limit
        ]);

        // Cosine similarity
        const dot = qVec.reduce((s, v, i) => s + v * (aVec[i] ?? 0), 0);
        const magQ = Math.sqrt(qVec.reduce((s, v) => s + v * v, 0));
        const magA = Math.sqrt(aVec.reduce((s, v) => s + v * v, 0));

        const similarity = (magQ && magA) ? dot / (magQ * magA) : 0;

        // Calibrate: embeddings of question/answer rarely exceed 0.85 even when
        // highly relevant. Scale to 0-1 range.
        return Math.min(Math.max((similarity - 0.1) / 0.7, 0), 1.0);
    } catch {
        return 0.5; // neutral on failure
    }
}

// ─── Metric 3: Context Recall ─────────────────────────────────────────────────

/**
 * Measures whether the retrieved context contained the information
 * needed to answer the question.
 *
 * Proxy: check if key answer terms appear in the retrieved chunks.
 * If the answer draws from the context → high recall.
 * If the answer had to "guess" → low recall.
 */
function scoreContextRecall(
    answer: string,
    matches: RankedMatch[],
    answerMode: string,
): number {
    if (answerMode === 'general' || matches.length === 0) return 0.0;

    const contextAll = matches.map(m => `${m.question} ${m.answer} ${m.content}`).join(' ').toLowerCase();
    const answerLower = answer.toLowerCase();

    // Extract substantive terms from answer (4+ chars, not stopwords)
    const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'will', 'your', 'when', 'also', 'only', 'into', 'than', 'then', 'some', 'more', 'about', 'should', 'would', 'could', 'which']);
    const answerTerms = answerLower
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !stopWords.has(w));

    if (answerTerms.length === 0) return 0.5;

    // Sample up to 20 terms for efficiency
    const sample = answerTerms.slice(0, 20);
    const found = sample.filter(term => contextAll.includes(term)).length;

    return found / sample.length;
}

// ─── Metric 4: Context Precision ─────────────────────────────────────────────

/**
 * Measures whether retrieved chunks were actually relevant.
 * Uses the finalScore distribution from the reranker.
 * High avg finalScore = precise retrieval (right chunks found).
 * Low avg finalScore = noisy retrieval (irrelevant chunks included).
 */
function scoreContextPrecision(matches: RankedMatch[]): number {
    if (matches.length === 0) return 0.0;
    const avgScore = matches.reduce((s, m) => s + m.finalScore, 0) / matches.length;
    // finalScore is typically 0.2-0.9 for relevant results
    // Normalize to 0-1
    return Math.min(Math.max((avgScore - 0.15) / 0.6, 0), 1.0);
}

// ─── Flag Detection ───────────────────────────────────────────────────────────

function detectFlags(scores: EvalScores, answerMode: string): EvalFlag[] {
    const flags: EvalFlag[] = [];

    if (answerMode !== 'general' && scores.faithfulness < THRESHOLDS.faithfulness) {
        flags.push({
            metric: 'faithfulness',
            severity: scores.faithfulness < 0.4 ? 'critical' : 'warning',
            message: `Answer may contain unsupported claims (faithfulness: ${(scores.faithfulness * 100).toFixed(0)}%)`,
        });
    }

    if (scores.answerRelevancy < THRESHOLDS.answerRelevancy) {
        flags.push({
            metric: 'answerRelevancy',
            severity: 'warning',
            message: `Answer may be off-topic (relevancy: ${(scores.answerRelevancy * 100).toFixed(0)}%)`,
        });
    }

    if (answerMode !== 'general' && scores.contextRecall < THRESHOLDS.contextRecall) {
        flags.push({
            metric: 'contextRecall',
            severity: 'warning',
            message: `Retrieved context may have missed relevant information (recall: ${(scores.contextRecall * 100).toFixed(0)}%)`,
        });
    }

    if (scores.contextPrecision < THRESHOLDS.contextPrecision && answerMode !== 'general') {
        flags.push({
            metric: 'contextPrecision',
            severity: 'warning',
            message: `Retrieved chunks may be noisy/irrelevant (precision: ${(scores.contextPrecision * 100).toFixed(0)}%)`,
        });
    }

    return flags;
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

/**
 * evaluateRAGResponse()
 *
 * Computes all 4 metrics for a completed RAG response.
 * Designed to run async (non-blocking) after the response streams.
 *
 * Usage in chat/route.ts:
 *   // After stream completes (inside flush()):
 *   void evaluateAndStore({ question, answer, ragResult, llm, latencyMs });
 */
export async function evaluateRAGResponse(params: {
    question: string;
    answer: string;
    ragResult: RAGResult;
    llm: ChatOpenAI;
    latencyMs: number;
}): Promise<EvalResult> {
    const { question, answer, ragResult, llm, latencyMs } = params;
    const { matches, answerMode, contextString } = ragResult;

    const [faithfulness, answerRelevancy] = await Promise.all([
        scoreFaithfulness(answer, contextString, llm, answerMode),
        scoreAnswerRelevancy(question, answer),
    ]);

    const contextRecall = scoreContextRecall(answer, matches, answerMode);
    const contextPrecision = scoreContextPrecision(matches);

    const scores: EvalScores = {
        faithfulness,
        answerRelevancy,
        contextRecall,
        contextPrecision,
        overallScore:
            faithfulness * WEIGHTS.faithfulness +
            answerRelevancy * WEIGHTS.answerRelevancy +
            contextRecall * WEIGHTS.contextRecall +
            contextPrecision * WEIGHTS.contextPrecision,
    };

    const flags = detectFlags(scores, answerMode);

    return {
        scores,
        queryText: question,
        answerText: answer.slice(0, 500),
        answerMode,
        matchCount: matches.length,
        latencyMs,
        flags,
    };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * storeEvalResult()
 *
 * Saves eval scores to `rag_evals` table.
 * Called non-blocking — never awaited in the hot path.
 */
export async function storeEvalResult(
    evalResult: EvalResult,
    userId?: string,
): Promise<void> {
    try {
        const supabase = getSupabase();
        await supabase.from('rag_evals').insert({
            query_text: evalResult.queryText,
            answer_text: evalResult.answerText,
            answer_mode: evalResult.answerMode,
            match_count: evalResult.matchCount,
            latency_ms: evalResult.latencyMs,
            faithfulness: evalResult.scores.faithfulness,
            answer_relevancy: evalResult.scores.answerRelevancy,
            context_recall: evalResult.scores.contextRecall,
            context_precision: evalResult.scores.contextPrecision,
            overall_score: evalResult.scores.overallScore,
            has_flags: evalResult.flags.length > 0,
            flags: evalResult.flags,
            user_id: userId ?? null,
        });
    } catch (err) {
        // Silently fail - evals must never break the main flow
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: Eval storage failed: ${message}`);
    }
}

/**
 * evaluateAndStore()
 *
 * Convenience wrapper: evaluate + store in one call.
 * Use `void evaluateAndStore(...)` in chat route - non-blocking.
 */
export async function evaluateAndStore(params: {
    question: string;
    answer: string;
    ragResult: RAGResult;
    llm: ChatOpenAI;
    latencyMs: number;
    userId?: string;
}): Promise<void> {
    try {
        const result = await evaluateRAGResponse(params);

        // Log to console for dev visibility
        const s = result.scores;
        console.log(`\n📐 EVAL SCORES:`);
        console.log(`   Faithfulness:     ${(s.faithfulness * 100).toFixed(0)}%`);
        console.log(`   Answer Relevancy: ${(s.answerRelevancy * 100).toFixed(0)}%`);
        console.log(`   Context Recall:   ${(s.contextRecall * 100).toFixed(0)}%`);
        console.log(`   Context Precision:${(s.contextPrecision * 100).toFixed(0)}%`);
        console.log(`   Overall:          ${(s.overallScore * 100).toFixed(0)}%`);

        if (result.flags.length > 0) {
            console.warn(`   Warning: Flags: ${result.flags.map(f => f.message).join(' | ')}`);
        }

        await storeEvalResult(result, params.userId);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Warning: Eval pipeline failed: ${message}`);
    }
}
