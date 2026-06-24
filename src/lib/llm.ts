/**
 * src/lib/llm.ts
 *
 * Central LLM configuration and utility for the app.
 * Replaces Sarvam AI with OpenAI GPT-4o.
 */

import { ChatOpenAI } from '@langchain/openai';

/**
 * Get an LLM instance based on query complexity.
 * Uses gpt-4o for complex tasks and gpt-4o-mini for simple/cost-effective routing.
 */
export function getLLM(type: 'complex' | 'simple' = 'complex', options: {
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
} = {}): ChatOpenAI {
    const modelName = type === 'complex' ? 'gpt-4o' : 'gpt-4o-mini';
    
    return new ChatOpenAI({
        modelName,
        apiKey: process.env.OPENAI_API_KEY,
        temperature: options.temperature ?? 0.3,
        maxTokens: options.maxTokens ?? 1024,
        streaming: options.streaming ?? false,
    });
}

/**
 * Safely extracts and parses JSON from an LLM response.
 * Handles markdown code fences and whitespace.
 */
export function extractJson<T = unknown>(raw: string): T | null {
    try {
        // Step 1: Unwrap markdown code fences
        let content = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Step 2: Try to find JSON block if still failing
        if (!content.startsWith('{') && !content.startsWith('[')) {
            const start = Math.min(
                content.indexOf('{') === -1 ? Infinity : content.indexOf('{'),
                content.indexOf('[') === -1 ? Infinity : content.indexOf('[')
            );
            const end = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'));
            if (start !== Infinity && end !== -1 && end > start) {
                content = content.slice(start, end + 1);
            }
        }
        
        return JSON.parse(content) as T;
    } catch {
        return null;
    }
}

/**
 * Standard system prompt for the SAI HMS assistant.
 */
export const SYSTEM_PROMPT = `
You are a multilingual AI assistant for industrial HMS (Health Monitoring System) support.

CRITICAL LANGUAGE RULE:
- You must respond ENTIRELY in the same language as the user's query.
- If the user asks in Hindi, answer in Hindi.
- If the user asks in Bengali, answer in Bengali.
- If the user asks in English, answer in English.
- Even though your internal processing and context are in English, the FINAL output to the user must be in their language.

Core Instructions:
- Answer using the provided knowledge base context. Synthesize relevant information even if it only partially covers the question.
- Use clear, natural, human-like responses.
- Keep answers professional and action-oriented.
`;

/**
 * Reasoning (<think>) instruction. Injected ONLY for complex/domain queries via
 * shouldReason() in router.ts — kept separate so simple lookups skip the reasoning
 * latency and token cost. See _orchestrator/plan.md.
 */
export const REASONING_INSTRUCTION = `REASONING PROCESS:
- Before the final answer, think inside <think>...</think> XML tags. Reason ONLY from the provided knowledge base context — treat it as the single source of truth.
- For each claim you plan to make, name the specific chunk or fact in the context that supports it. If a step has no support in the context, do not make that claim.
- Flag any contradictions between chunks and state how you resolve them (prefer the more specific or more recent source).
- End the reasoning with a one-line confidence read: high / medium / low, based on how directly the context answers the question.
- Never invent values, error codes, terminals, or steps that are not in the context. If the context does not contain the answer, say so explicitly instead of guessing.
- Write the thinking in English (internal monologue). Close </think>, then write the final answer in the output language, using only facts that appeared in your reasoning.`;
