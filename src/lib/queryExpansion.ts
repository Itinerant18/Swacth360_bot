import { ChatOpenAI } from '@langchain/openai';
import { expandQuerySimple, expandQueryWithLLM } from './query-expansion';

export interface QueryExpansionResult {
    variations: string[];
    discarded: string[];
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function lexicalSimilarity(a: string, b: string): number {
    const left = new Set(normalize(a).split(' ').filter((token) => token.length > 2));
    const right = new Set(normalize(b).split(' ').filter((token) => token.length > 2));

    if (left.size === 0 || right.size === 0) {
        return 0;
    }

    let overlap = 0;
    for (const token of left) {
        if (right.has(token)) {
            overlap++;
        }
    }

    return overlap / Math.max(left.size, right.size);
}

function hasEntityAnchor(candidate: string, entities: string[], keywords: string[]): boolean {
    const normalizedCandidate = normalize(candidate);
    return entities.some((entity) => normalizedCandidate.includes(normalize(entity)))
        || keywords.some((keyword) => normalizedCandidate.includes(normalize(keyword)));
}

function buildRuleVariations(query: string, keywords: string[]): string[] {
    if (keywords.length === 0) {
        return [];
    }

    const primary = keywords.slice(0, 3).join(' ');
    return [
        `${query} troubleshooting`,
        `${primary} support`,
        `how to fix ${primary}`,
        `${primary} configuration guide`,
    ];
}

export async function generateQueryExpansions(params: {
    query: string;
    keywords?: string[];
    entities?: string[];
    llm?: ChatOpenAI;
    maxVariations?: number;
}): Promise<QueryExpansionResult> {
    const {
        query,
        keywords = [],
        entities = [],
        llm,
        maxVariations = 5,
    } = params;

    const llmVariations = llm ? await expandQueryWithLLM(query, llm) : [query, ...expandQuerySimple(query)];
    const ruleVariations = buildRuleVariations(query, keywords);
    const candidates = [...new Set([...llmVariations, ...ruleVariations])]
        .filter((candidate) => normalize(candidate) !== normalize(query));

    const variations: string[] = [];
    const discarded: string[] = [];

    for (const candidate of candidates) {
        const similarity = lexicalSimilarity(query, candidate);
        const anchored = hasEntityAnchor(candidate, entities, keywords);

        if ((similarity >= 0.18 || anchored) && variations.length < maxVariations) {
            variations.push(candidate.trim());
        } else {
            discarded.push(candidate.trim());
        }
    }

    return {
        variations: [...new Set(variations)].slice(0, maxVariations),
        discarded,
    };
}
