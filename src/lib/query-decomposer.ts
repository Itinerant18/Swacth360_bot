/**
 * src/lib/query-decomposer.ts
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  QUERY DECOMPOSITION — Architecture Node: "RAG Types →      ║
 * ║  Decomposition"                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * What this does:
 *   Detects multi-part questions and splits them into independent
 *   sub-queries. Each sub-query is retrieved separately, then
 *   answers are merged back into a unified response.
 *
 * Examples:
 *
 *   Input:  "How do I wire the RS-485 terminals and what errors
 *            might I see if it's connected wrong?"
 *   Output: [
 *     "How do I wire RS-485 terminals?",
 *     "What errors occur from incorrect RS-485 wiring?"
 *   ]
 *
 *   Input:  "What is the supply voltage for HMS panel and how
 *            does it compare to the backup power input?"
 *   Output: [
 *     "What is the supply voltage for HMS panel?",
 *     "What is the backup power input voltage for HMS panel?"
 *   ]
 *
 * Why this matters:
 *   A single vector embedding for a 2-part question is a COMPROMISE
 *   between both topics — it may retrieve well for neither.
 *   Two separate retrievals, one per sub-question, give precise
 *   context for both parts of the answer.
 *
 *   Used by: LangChain MultiQueryRetriever, LlamaIndex SubQuestion
 *   Query Engine, and internally by GPT-4's tool use pipeline.
 */

import { ChatOpenAI } from '@langchain/openai';
import type { QueryAnalysis } from './rag-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DecomposedQuery {
  isDecomposed: boolean;        // true if splitting occurred
  originalQuery: string;
  subQueries: SubQuery[];
  decompositionReason?: string; // why it was split
}

export interface SubQuery {
  query: string;
  focus: string;                // what aspect this sub-query covers
  queryType: string;            // 'diagnostic' | 'procedural' | etc
  priority: number;             // 1 = most important
}

export interface MergedRAGResult {
  contextString: string;        // merged context for LLM prompt
  subResults: {
    subQuery: SubQuery;
    matches: any[];
    answerMode: string;
    confidence: number;
  }[];
  overallConfidence: number;
  answerMode: 'rag_high' | 'rag_medium' | 'rag_partial' | 'general';
}

// ─── Fast Decomposition Heuristics (no LLM needed) ───────────────────────────

/**
 * Detects if a query has multiple distinct questions using fast regex.
 * Avoids LLM call for the majority of single-topic queries.
 */
function detectsMultipleParts(query: string): boolean {
  const lower = query.toLowerCase();

  // Explicit connectors suggesting multiple questions
  const multiPartPatterns = [
    /\band\s+(also|additionally|furthermore|moreover)\b/i,
    /\balso\s+(how|what|why|when|where|which)\b/i,
    /\b(how|what|why)\b.{10,}\b(and|also)\b.{5,}\b(how|what|why|when)\b/i,
    /[?]\s+.{5,}[?]/,                                    // two question marks
    /\b(additionally|furthermore|moreover|besides)\b/i,
    /\bpart\s+\d\b/i,                                    // "part 1", "part 2"
    /\b(\d+)\.\s+.{10,}\b(\d+)\.\s+/,                   // "1. ... 2. ..."
    /\bfirst.{5,}\bsecond\b/i,
    /\bwhat.{5,50}\band\s+why\b/i,
    /\bhow.{5,50}\band\s+what\b/i,
  ];

  const matches = multiPartPatterns.filter(p => p.test(lower));
  return matches.length >= 1 && query.length > 40;
}

/**
 * Fast rule-based split for common patterns (no LLM).
 * Handles the most common multi-question forms.
 */
function fastSplit(query: string): SubQuery[] | null {
  // Pattern: "How do X and what is Y?"
  const andWhatMatch = query.match(
    /^(.*?)\s+and\s+((?:also\s+)?(?:how|what|why|when|where|which)\s+.+)$/i
  );
  if (andWhatMatch && andWhatMatch[1].length > 15 && andWhatMatch[2].length > 15) {
    return [
      { query: andWhatMatch[1].trim(), focus: 'part 1', queryType: 'unknown', priority: 1 },
      { query: andWhatMatch[2].trim(), focus: 'part 2', queryType: 'unknown', priority: 2 },
    ];
  }

  // Pattern: Two sentences (". How..." or "? What...")
  const twoSentences = query.match(/^(.{20,}[.?])\s+((?:How|What|Why|When|Where|Which)\s+.{15,})$/);
  if (twoSentences) {
    return [
      { query: twoSentences[1].replace(/[?.]$/, '').trim(), focus: 'question 1', queryType: 'unknown', priority: 1 },
      { query: twoSentences[2].trim(), focus: 'question 2', queryType: 'unknown', priority: 2 },
    ];
  }

  return null;
}

// ─── LLM-Based Decomposition ──────────────────────────────────────────────────

const DECOMPOSE_PROMPT = `You are analyzing a question for an HMS industrial panel support bot.

Determine if this question contains MULTIPLE distinct sub-questions that need separate knowledge base lookups.

Rules for splitting:
1. Split ONLY if the question has 2+ genuinely independent sub-questions
2. Each sub-question must be self-contained and searchable independently  
3. Do NOT split if it's one question with context or clarification
4. Do NOT split simple compound questions like "what is X and Y" (same topic)
5. Maximum 3 sub-questions

Question: "{query}"

If this is a SINGLE question, respond:
{"decompose": false}

If this has MULTIPLE independent sub-questions, respond:
{"decompose": true, "reason": "brief reason", "subQueries": [
  {"query": "first standalone question?", "focus": "what aspect", "queryType": "diagnostic|procedural|factual|visual|comparative", "priority": 1},
  {"query": "second standalone question?", "focus": "what aspect", "queryType": "...", "priority": 2}
]}

Respond ONLY with valid JSON, no markdown.`;

async function llmDecompose(
  query: string,
  llm: ChatOpenAI,
): Promise<DecomposedQuery> {
  try {
    const prompt = DECOMPOSE_PROMPT.replace('{query}', query.slice(0, 300));
    const result = await llm.invoke(prompt);
    const raw = (result.content as string).trim()
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(raw);

    if (!parsed.decompose || !Array.isArray(parsed.subQueries)) {
      return { isDecomposed: false, originalQuery: query, subQueries: [{ query, focus: 'full question', queryType: 'unknown', priority: 1 }] };
    }

    const subQueries: SubQuery[] = parsed.subQueries
      .filter((sq: any) => sq.query?.length > 10)
      .slice(0, 3)
      .map((sq: any, i: number) => ({
        query: sq.query.trim(),
        focus: sq.focus || `part ${i + 1}`,
        queryType: sq.queryType || 'unknown',
        priority: sq.priority || i + 1,
      }));

    if (subQueries.length < 2) {
      return { isDecomposed: false, originalQuery: query, subQueries: [{ query, focus: 'full question', queryType: 'unknown', priority: 1 }] };
    }

    return {
      isDecomposed: true,
      originalQuery: query,
      subQueries,
      decompositionReason: parsed.reason,
    };
  } catch {
    // Fallback: treat as single query
    return { isDecomposed: false, originalQuery: query, subQueries: [{ query, focus: 'full question', queryType: 'unknown', priority: 1 }] };
  }
}

// ─── Main Decomposer ──────────────────────────────────────────────────────────

/**
 * decomposeQuery()
 *
 * Entry point. Strategy:
 *   1. Fast heuristic check — if query looks simple, skip LLM entirely
 *   2. Fast regex split — handles most common multi-part forms without LLM
 *   3. LLM decompose — only for complex/ambiguous cases
 *
 * Time budget: < 50ms for simple queries, ~500ms for LLM decomposition
 */
export async function decomposeQuery(
  query: string,
  analysis: QueryAnalysis,
  llm: ChatOpenAI,
): Promise<DecomposedQuery> {
  // ── Fast path: clearly a single question ───────────────────────────────
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount < 10 || analysis.complexity === 'simple') {
    console.log(`\n✂️  No decomposition needed`);
    return {
      isDecomposed: false,
      originalQuery: query,
      subQueries: [{ query, focus: 'full question', queryType: analysis.type, priority: 1 }],
    };
  }

  // ── Fast path: no multi-part signals → skip LLM ────────────────────────
  if (!detectsMultipleParts(query)) {
    console.log(`\n✂️  No decomposition needed`);
    return {
      isDecomposed: false,
      originalQuery: query,
      subQueries: [{ query, focus: 'full question', queryType: analysis.type, priority: 1 }],
    };
  }

  // ── Medium path: fast regex split ──────────────────────────────────────
  const fastResult = fastSplit(query);
  if (fastResult && fastResult.length >= 2) {
    console.log(`\n✂️  DECOMPOSED (fast): "${query.slice(0, 60)}..." → ${fastResult.length} sub-queries`);
    return {
      isDecomposed: true,
      originalQuery: query,
      subQueries: fastResult.map(sq => ({ ...sq, queryType: analysis.type })),
      decompositionReason: 'Multi-part question detected via pattern matching',
    };
  }

  // ── Slow path: LLM decomposition (only for complex/ambiguous cases) ─────
  console.log(`\n✂️  DECOMPOSING (LLM): "${query.slice(0, 60)}..."`);
  const result = await llmDecompose(query, llm);

  if (result.isDecomposed) {
    console.log(`   → ${result.subQueries.length} sub-queries: ${result.subQueries.map(sq => `"${sq.query.slice(0, 40)}"`).join(' | ')}`);
  } else {
    console.log(`   → Single query (no split needed)`);
  }

  return result;
}

// ─── Result Merger ────────────────────────────────────────────────────────────

/**
 * mergeSubQueryResults()
 *
 * After retrieving for each sub-query independently, merges the results
 * into a single coherent context string for the LLM prompt.
 *
 * Deduplicates: if the same KB entry appears in multiple sub-queries,
 * it's included only once (in the section where it's most relevant).
 */
export function mergeSubQueryResults(
  subResults: MergedRAGResult['subResults'],
  originalQuery: string,
): MergedRAGResult {
  const seenIds = new Set<string>();
  let mergedContext = '';
  let maxConfidence = 0;
  let dominantMode: MergedRAGResult['answerMode'] = 'general';

  const modePriority = { rag_high: 4, rag_medium: 3, rag_partial: 2, general: 1 };

  for (const subResult of subResults.sort((a, b) => a.subQuery.priority - b.subQuery.priority)) {
    const newMatches = subResult.matches.filter(m => !seenIds.has(m.id));
    newMatches.forEach(m => seenIds.add(m.id));

    if (newMatches.length > 0) {
      mergedContext += `\n\n── Context for: "${subResult.subQuery.query}" ──\n`;
      mergedContext += newMatches
        .slice(0, 3)
        .map((m, i) => `[Source ${i + 1} — ${(m.finalScore * 100).toFixed(0)}% match]\nQ: ${m.question}\nA: ${m.answer}`)
        .join('\n\n---\n\n');
    }

    if (subResult.confidence > maxConfidence) maxConfidence = subResult.confidence;

    const modePrio = modePriority[subResult.answerMode as keyof typeof modePriority] ?? 1;
    const domPrio = modePriority[dominantMode] ?? 1;
    if (modePrio > domPrio) dominantMode = subResult.answerMode as MergedRAGResult['answerMode'];
  }

  return {
    contextString: mergedContext.trim(),
    subResults,
    overallConfidence: maxConfidence,
    answerMode: dominantMode,
  };
}

/**
 * buildDecomposedPromptPrefix()
 *
 * Adds a note to the system prompt when a decomposed query is being answered,
 * so the LLM knows to address all parts.
 */
export function buildDecomposedPromptPrefix(decomposed: DecomposedQuery): string {
  if (!decomposed.isDecomposed) return '';

  const parts = decomposed.subQueries
    .sort((a, b) => a.priority - b.priority)
    .map((sq, i) => `  ${i + 1}. ${sq.query}`)
    .join('\n');

  return `\n⚠️ MULTI-PART QUESTION — address ALL parts in your answer:\n${parts}\n`;
}
