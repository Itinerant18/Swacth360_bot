/**
 * src/lib/query-expansion.ts
 * 
 * Query Expansion Module for Enhanced RAG
 * 
 * Generates alternative phrasings and synonyms to improve recall
 */

import { ChatOpenAI } from '@langchain/openai';
import { stripThinkTags, extractJsonFromSarvam } from './sarvam';

// HMS/Dexter domain-specific expansions
const DOMAIN_EXPANSIONS: Record<string, string[]> = {
    error: ['fault', 'alarm', 'issue', 'problem', 'failure', 'malfunction'],
    voltage: ['V', 'power', 'supply', 'DC', 'AC', '24V', '12V'],
    terminal: ['TB', 'pin', 'connector', 'port', 'contact'],
    network: ['ethernet', 'LAN', 'wifi', 'wireless', 'connection'],
    battery: ['backup', 'power supply', 'UPS', 'charge'],
    panel: ['device', 'unit', 'module', 'controller', 'HMS'],
    rs485: ['serial', 'Modbus RTU', 'RS422', 'serial communication'],
    led: ['indicator', 'light', 'status LED', 'signal'],
    configure: ['setup', 'set up', 'program', 'settings', 'adjust'],
    troubleshoot: ['diagnose', 'fix', 'resolve', 'debug', 'repair'],
};

/**
 * Generate expanded queries using LLM
 */
export async function expandQueryWithLLM(
    query: string,
    llm?: ChatOpenAI
): Promise<string[]> {
    const expansions: string[] = [query];

    if (!llm) {
        // Fall back to simple expansion
        return [...expansions, ...expandQuerySimple(query)];
    }

    try {
        const prompt = `Given this technical support query, generate 3 alternative phrasings that might appear in user questions. Include synonyms, abbreviations, common typos, and different ways users might ask the same thing.

Original: ${query}

Return as a JSON array of strings, for example:
["alternative 1", "alternative 2", "alternative 3"]

Only return the JSON array, nothing else.`;

        const result = await llm.invoke(prompt);
        const content = stripThinkTags(result.content as string);

        const parsed = extractJsonFromSarvam<string[]>(content);
        if (Array.isArray(parsed)) {
            expansions.push(...parsed.filter((p) => typeof p === 'string'));
        } else {
            // Fallback: extract quoted strings from text
            const matches = content.match(/"([^"]+)"/g);
            if (matches) {
                expansions.push(
                    ...matches.map((m) => m.replace(/"/g, ''))
                );
            }
        }
    } catch (error) {
        console.warn('⚠️  LLM query expansion failed:', error);
    }

    return [...new Set(expansions)]; // Remove duplicates
}

/**
 * Simple rule-based query expansion (fallback)
 */
export function expandQuerySimple(query: string): string[] {
    const expansions: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Add domain-specific expansions
    Object.entries(DOMAIN_EXPANSIONS).forEach(([key, synonyms]) => {
        if (lowerQuery.includes(key)) {
            synonyms.forEach((synonym) => {
                const expanded = lowerQuery.replace(new RegExp(key, 'gi'), synonym);
                if (expanded !== lowerQuery) {
                    expansions.push(expanded);
                }
            });
        }
    });

    // Add common variations
    // "how to X" -> "X procedure", "X steps", "X guide"
    const howToMatch = query.match(/how\s+to\s+(.+)/i);
    if (howToMatch) {
        const action = howToMatch[1];
        expansions.push(`${action} procedure`);
        expansions.push(`${action} steps`);
        expansions.push(`guide for ${action}`);
    }

    // "what is X" -> "X definition", "explain X"
    const whatIsMatch = query.match(/what\s+is\s+(.+)/i);
    if (whatIsMatch) {
        const subject = whatIsMatch[1];
        expansions.push(`${subject} definition`);
        expansions.push(`explain ${subject}`);
    }

    // Add error code variations
    const errorMatch = query.match(/[Ee]\d{3,4}/);
    if (errorMatch) {
        const code = errorMatch[0].toUpperCase();
        expansions.push(code.replace('E', 'Error '));
        expansions.push(code.replace('E', 'E-')); // E001 -> E-001
    }

    return expansions;
}

/**
 * Generate hypothetical answer (HYDE) for the query
 */
export async function generateHYDE(
    query: string,
    queryType: string,
    llm: ChatOpenAI,
    timeoutMs: number = 3000
): Promise<string | null> {
    const typeInstructions = {
        diagnostic: 'Focus on common causes and troubleshooting steps.',
        procedural: 'Describe the step-by-step procedure.',
        factual: 'Provide direct factual information.',
        visual: 'Describe relevant diagrams and connections.',
        comparative: 'Compare the options mentioned.',
    };

    const instruction = typeInstructions[queryType as keyof typeof typeInstructions]
        || 'Provide helpful technical information.';

    const prompt = `You are generating a hypothetical answer to help retrieve relevant documents. 
Write a realistic, helpful answer to this technical support question.
${instruction}

Question: ${query}

Hypothetical Answer (1-2 sentences):`;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        const result = await llm.invoke(prompt, {
            signal: controller.signal,
        });

        clearTimeout(timeout);

        return result.content as string;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('⚠️  HYDE generation timed out');
        } else {
            console.warn('⚠️  HYDE generation failed:', error);
        }
        return null;
    }
}

/**
 * Extract keywords for expansion
 */
export function extractKeywords(query: string): string[] {
    const keywords: string[] = [];
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'could', 'should', 'may', 'might', 'must', 'shall',
        'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
        'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
        'through', 'during', 'before', 'after', 'above', 'below',
        'between', 'under', 'again', 'further', 'then', 'once',
        'here', 'there', 'when', 'where', 'why', 'how', 'all',
        'each', 'few', 'more', 'most', 'other', 'some', 'such',
        'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
        'too', 'very', 'just', 'also', 'now', 'what', 'which',
        'who', 'whom', 'this', 'that', 'these', 'those', 'am',
    ]);

    const words = query.toLowerCase().split(/\W+/);
    words.forEach((word) => {
        if (word.length > 2 && !stopWords.has(word)) {
            keywords.push(word);
        }
    });

    return keywords;
}

/**
 * Create expanded query with multiple variations
 */
export async function createExpandedQuery(
    query: string,
    queryType: string,
    llm?: ChatOpenAI
): Promise<{
    original: string;
    expansions: string[];
    hyde?: string;
}> {
    const expansions = await expandQueryWithLLM(query, llm);
    const hyde = llm ? await generateHYDE(query, queryType, llm) : undefined;

    return {
        original: query,
        expansions: [...new Set(expansions)], // Deduplicate
        hyde: hyde || undefined,
    };
}
