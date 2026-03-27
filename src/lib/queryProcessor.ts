import { ChatOpenAI } from '@langchain/openai';
import { rewriteWithContext, type ConversationMessage } from './conversation-retrieval';
import { buildConversationMemory, type ConversationMemory } from './memory';

export interface ProcessedQuery {
    original: string;
    normalizedOriginal: string;
    retrievalQuery: string;
    cacheQuery: string;
    memory: ConversationMemory;
    keywords: string[];
    entities: string[];
    wasContextRewritten: boolean;
    appliedTransforms: string[];
}

const QUESTION_START = /^(how|what|why|when|where|which|who|can|could|should|is|are|do|does|did|will)\b/i;
const ACTION_START = /^(install|configure|setup|set up|connect|wire|reset|restart|enable|disable|update|change|clear|measure|check|verify|open|select)\b/i;
const TROUBLESHOOTING_HINT = /\b(not working|issue|problem|error|fault|failed|unable|cannot|can't|offline|down|slow)\b/i;

export { buildConversationMemory } from './memory';

function sentenceCase(input: string): string {
    if (!input) {
        return input;
    }

    return input.charAt(0).toUpperCase() + input.slice(1);
}

function trimPoliteFillers(input: string): string {
    return input
        .replace(/^\s*(please\s+)?(can you|could you|would you)\s+/i, '')
        .replace(/^\s*please\s+/i, '')
        .trim();
}

export function normalizeUserQuery(input: string): string {
    const normalized = trimPoliteFillers(input)
        .replace(/\s+/g, ' ')
        .replace(/[?!.]{2,}/g, '?')
        .replace(/\s+([?!.:,])/g, '$1')
        .replace(/\bwi[\s-]?fi\b/gi, 'WiFi')
        .replace(/\brs[\s-]?485\b/gi, 'RS-485')
        .replace(/\bmodbus\s*rtu\b/gi, 'Modbus RTU')
        .replace(/\bprofibus\s*dp\b/gi, 'PROFIBUS DP')
        .replace(/\bethernet\s*ip\b/gi, 'EtherNet/IP')
        .replace(/\banybus\b/gi, 'Anybus')
        .trim();

    return normalized;
}

function extractEntities(query: string): string[] {
    const matches = [
        ...query.matchAll(/\b[Ee]\d{3,4}\b/g),
        ...query.matchAll(/\b(?:RS-?485|Modbus(?:\s+RTU)?|PROFIBUS(?:\s+DP)?|EtherNet\/IP|Anybus|WiFi)\b/gi),
        ...query.matchAll(/\b(?:TB\d+[+-]?|pin\s*\d+|A\+|A-|B\+|B-)\b/gi),
        ...query.matchAll(/\b(?:HMS-\d+|ABC-\d+|X-gateway)\b/gi),
    ];

    return [...new Set(matches.map((match) => match[0]))];
}

export function extractKeywords(query: string): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'for', 'with', 'that', 'this', 'what', 'why', 'how',
        'when', 'where', 'which', 'who', 'from', 'into', 'about', 'please', 'help', 'issue',
    ]);

    return [...new Set(
        normalizeUserQuery(query)
            .toLowerCase()
            .split(/\W+/)
            .filter((word) => word.length > 2 && !stopWords.has(word))
    )];
}

export function extractKeywordsAndEntities(query: string): { keywords: string[]; entities: string[] } {
    return {
        keywords: extractKeywords(query),
        entities: extractEntities(query),
    };
}

function rewriteQueryForSearch(query: string): { rewritten: string; changed: boolean } {
    const base = normalizeUserQuery(query);
    const stripped = base.replace(/[?!.]+$/, '').trim();

    if (!stripped) {
        return { rewritten: base, changed: false };
    }

    if (QUESTION_START.test(stripped)) {
        return {
            rewritten: /[?]$/.test(base) ? base : `${stripped}?`,
            changed: !/[?]$/.test(base),
        };
    }

    if (/^how\s+to\b/i.test(stripped)) {
        const action = stripped.replace(/^how\s+to\s+/i, '').trim();
        return {
            rewritten: action ? `How do I ${action}?` : base,
            changed: Boolean(action),
        };
    }

    if (TROUBLESHOOTING_HINT.test(stripped)) {
        return {
            rewritten: `How do I fix ${sentenceCase(stripped)}?`,
            changed: true,
        };
    }

    if (ACTION_START.test(stripped)) {
        const action = stripped.toLowerCase();
        return {
            rewritten: `How do I ${action}?`,
            changed: true,
        };
    }

    if (stripped.split(/\s+/).length <= 5) {
        return {
            rewritten: `What is ${stripped}?`,
            changed: true,
        };
    }

    return {
        rewritten: /[?]$/.test(base) ? base : `${sentenceCase(stripped)}?`,
        changed: !/[?]$/.test(base),
    };
}

export async function processQuery(params: {
    originalQuery: string;
    history: ConversationMessage[];
    llm?: ChatOpenAI;
}): Promise<ProcessedQuery> {
    const { originalQuery, history, llm } = params;
    const normalizedOriginal = normalizeUserQuery(originalQuery);
    const memory = buildConversationMemory(history, normalizedOriginal);
    const appliedTransforms: string[] = [];

    let contextualQuery = normalizedOriginal;
    let wasContextRewritten = false;

    if (llm) {
        const contextResult = await rewriteWithContext(normalizedOriginal, history, llm);
        contextualQuery = normalizeUserQuery(contextResult.rewritten);
        wasContextRewritten = contextResult.wasRewritten && contextualQuery !== normalizedOriginal;

        if (wasContextRewritten) {
            appliedTransforms.push('conversation-context');
        }
    }

    const searchRewrite = rewriteQueryForSearch(contextualQuery);
    if (searchRewrite.changed && searchRewrite.rewritten !== contextualQuery) {
        appliedTransforms.push('search-rewrite');
    }

    const retrievalQuery = normalizeUserQuery(searchRewrite.rewritten);
    const { keywords, entities } = extractKeywordsAndEntities(retrievalQuery);

    return {
        original: originalQuery,
        normalizedOriginal,
        retrievalQuery,
        cacheQuery: retrievalQuery,
        memory,
        keywords,
        entities,
        wasContextRewritten,
        appliedTransforms,
    };
}
