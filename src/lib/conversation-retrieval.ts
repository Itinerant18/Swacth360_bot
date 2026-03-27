/**
 * src/lib/conversation-retrieval.ts
 *
 * Conversation-Aware Retrieval
 *
 * Rewrites follow-up queries using conversation history so that
 * pronouns and implicit references resolve correctly before
 * hitting the RAG pipeline.
 *
 * Example:
 *   User: "What is TB1 on the HMS panel?"
 *   Bot:  "TB1 is the 24V DC power terminal..."
 *   User: "What about the wiring for that?"
 *   → Rewritten: "What is the wiring for TB1 24V DC power terminal on the HMS panel?"
 */

import { ChatOpenAI } from '@langchain/openai';
import { stripThinkTags } from './sarvam';
import { sanitizeInput } from './sanitize';

const MAX_HISTORY_MESSAGES = 6;

const FOLLOW_UP_INDICATORS = [
    /\b(it|that|this|those|these|the same|above|previous)\b/i,
    /\b(what about|how about|and|also|more|another|other)\b/i,
    /^(why|how|when|where|can|does|is|are|do)\b/i,
];
const TOPIC_SHIFT_THRESHOLD = 0.2;

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}

function normalizeForSimilarity(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function computeSimilarity(left: string, right: string): number {
    const leftTokens = new Set(normalizeForSimilarity(left).split(' ').filter((token) => token.length > 2));
    const rightTokens = new Set(normalizeForSimilarity(right).split(' ').filter((token) => token.length > 2));

    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const token of leftTokens) {
        if (rightTokens.has(token)) {
            overlap++;
        }
    }

    return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function isTopicShift(current: string, previous: string): boolean {
    return computeSimilarity(current, previous) < TOPIC_SHIFT_THRESHOLD;
}

/**
 * Detects whether a query is likely a follow-up that needs context.
 * Uses heuristics first to avoid unnecessary LLM calls.
 */
export function isLikelyFollowUp(query: string): boolean {
    const trimmed = query.trim();

    // Very short queries are usually follow-ups
    if (trimmed.split(/\s+/).length <= 4) return true;

    // Check for pronoun/reference indicators
    return FOLLOW_UP_INDICATORS.some(pattern => pattern.test(trimmed));
}

/**
 * Rewrites a follow-up query using conversation history.
 * Returns the original query if no rewrite is needed.
 */
export async function rewriteWithContext(
    query: string,
    history: ConversationMessage[],
    llm: ChatOpenAI,
): Promise<{ rewritten: string; wasRewritten: boolean }> {
    // No history → no rewrite
    if (!history || history.length === 0) {
        return { rewritten: query, wasRewritten: false };
    }

    // Not a follow-up → no rewrite
    if (!isLikelyFollowUp(query)) {
        return { rewritten: query, wasRewritten: false };
    }

    // Take recent history only
    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
    const previousUserMessage = [...recentHistory].reverse().find((message) => message.role === 'user')?.content;
    if (previousUserMessage && isTopicShift(query, previousUserMessage)) {
        return { rewritten: query, wasRewritten: false };
    }

    const historyText = recentHistory
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${sanitizeInput(m.content).slice(0, 200)}`)
        .join('\n');

    const prompt = `You are a query rewriter for a technical support chatbot about HMS industrial panels.

CONVERSATION HISTORY:
${historyText}

LATEST USER QUERY: ${query}

Task: If the latest query references previous conversation (using pronouns like "it", "that", "this", or is a follow-up question), rewrite it as a standalone question that includes the necessary context.

Rules:
- If the query is already self-contained, return it as-is
- Include specific technical terms (terminal names, error codes, protocols) from history
- Keep the rewritten query concise (under 30 words)
- Output ONLY the rewritten query, nothing else

    Rewritten query:`;

    try {
        const result = await Promise.race([
            llm.invoke(prompt),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Rewrite timeout')), 3000)
            ),
        ]);
        const rewritten = stripThinkTags(String(result.content)).trim();

        // Sanity check — don't use rewrites that are too long or empty
        if (!rewritten || rewritten.length > 200 || rewritten.length < 3) {
            return { rewritten: query, wasRewritten: false };
        }

        return { rewritten, wasRewritten: true };
    } catch (err) {
        console.error('[conversation rewrite error]', err);
        return { rewritten: query, wasRewritten: false };
    }
}
