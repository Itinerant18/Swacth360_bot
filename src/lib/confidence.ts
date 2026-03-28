import type { RankedMatch } from './rag-engine';

export interface ConfidenceResult {
    score: number;
    level: 'high' | 'medium' | 'low';
    shouldFallback: boolean;
    fallbackMessage?: string;
    cacheEligible: boolean;
    consistency: number;
}

export interface RetrievalDecisionParams {
    complexity: 'simple' | 'medium' | 'complex';
    confidence?: number;
    entityCount?: number;
}

export function answerModeFromConfidence(score: number): 'rag_high' | 'rag_medium' | 'rag_partial' | 'general' {
    if (score >= 0.65) {
        return 'rag_high';
    }

    if (score >= 0.48) {
        return 'rag_medium';
    }

    if (score >= 0.35) {
        return 'rag_partial';
    }

    return 'general';
}

export function isFastPathCandidate(params: {
    query: string;
    complexity: 'simple' | 'medium' | 'complex';
}): boolean {
    const wordCount = params.query.trim().split(/\s+/).filter(Boolean).length;
    return params.complexity === 'simple' && wordCount <= 8;
}

export function deriveAdaptiveTopK(params: RetrievalDecisionParams): number {
    const { complexity, confidence = 0, entityCount = 0 } = params;

    if (confidence >= 0.72 || complexity === 'simple' || entityCount > 0) {
        return 3;
    }

    return complexity === 'complex' ? 5 : 4;
}

export function shouldUseVerificationPass(params: {
    complexity: 'simple' | 'medium' | 'complex';
    confidence: number;
    matchCount: number;
}): boolean {
    return params.complexity === 'complex'
        && params.confidence < 0.62
        && params.matchCount >= 3;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function lexicalCoverage(query: string, match: RankedMatch): number {
    const queryTerms = normalize(query).split(' ').filter((token) => token.length > 2);
    if (queryTerms.length === 0) {
        return 0;
    }

    const candidateText = normalize(`${match.question} ${match.answer}`);
    const overlap = queryTerms.filter((term) => candidateText.includes(term)).length;
    return overlap / queryTerms.length;
}

function extractNumericFacts(text: string): Set<string> {
    const matches = text.match(/\b\d+(?:\.\d+)?\s*(?:v|a|ma|hz|bps|kbps|mbps|ohm|%|ms|sec|s|dc|ac)?\b/gi) || [];
    return new Set(matches.map((match) => normalize(match)));
}

function consistencyScore(matches: RankedMatch[]): number {
    if (matches.length <= 1) {
        return 1;
    }

    let score = 1;
    const topMatches = matches.slice(0, 3);

    for (let index = 0; index < topMatches.length - 1; index++) {
        const current = topMatches[index];
        const next = topMatches[index + 1];
        const currentFacts = extractNumericFacts(current.answer);
        const nextFacts = extractNumericFacts(next.answer);
        const sameTopic = normalize(current.question).slice(0, 60) === normalize(next.question).slice(0, 60);

        if (sameTopic && currentFacts.size > 0 && nextFacts.size > 0) {
            const sharedFacts = [...currentFacts].filter((fact) => nextFacts.has(fact));
            if (sharedFacts.length === 0) {
                score -= 0.25;
            }
        }
    }

    return clamp(score, 0, 1);
}

export function scoreConfidence(params: {
    query: string;
    matches: RankedMatch[];
    baseConfidence?: number;
}): ConfidenceResult {
    const { query, matches, baseConfidence = 0 } = params;
    const top = matches[0]?.finalScore ?? 0;
    const averageTop = matches.length > 0
        ? matches.slice(0, Math.min(3, matches.length)).reduce((sum, match) => sum + match.finalScore, 0) / Math.min(3, matches.length)
        : 0;
    const coverage = matches.length > 0
        ? matches.slice(0, Math.min(3, matches.length)).reduce((sum, match) => sum + lexicalCoverage(query, match), 0) / Math.min(3, matches.length)
        : 0;
    const consistency = consistencyScore(matches);
    const supportBonus = Math.min(matches.length, 3) / 3;

    const score = clamp(
        baseConfidence * 0.25
        + top * 0.30
        + averageTop * 0.15
        + coverage * 0.12
        + consistency * 0.10
        + supportBonus * 0.08,
        0,
        1,
    );

    const level = score >= 0.65 ? 'high' : score >= 0.40 ? 'medium' : 'low';
    const shouldFallback = score < 0.30 || matches.length === 0;

    return {
        score,
        level,
        shouldFallback,
        fallbackMessage: shouldFallback
            ? 'Coverage is limited — synthesize the best answer from available context.'
            : undefined,
        cacheEligible: score >= 0.65,
        consistency,
    };
}
