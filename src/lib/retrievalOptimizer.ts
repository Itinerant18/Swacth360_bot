import type { IntentClassification } from './intentClassifier';
import type { QueryAnalysis, RAGResult, RankedMatch } from './rag-engine';
import type { RAGSettings } from './rag-settings';
import type { RouteConfig } from './router';
import { answerModeFromConfidence } from './confidence';

type PreferredChunkType = NonNullable<RouteConfig['retrieval']['preferChunkType']>;

interface RetrievePlanParams {
    analysis: QueryAnalysis;
    intent: IntentClassification;
    routeRetrieval: RouteConfig['retrieval'];
    ragSettings: RAGSettings | null;
    searchMode: string;
    logicalRouteType: 'vector' | 'relational' | 'hybrid';
    requestedHybridSearch: boolean;
}

export interface RetrievalPlan {
    useHYDE: boolean;
    topK: number;
    useMMR: boolean;
    useWeighted: boolean;
    mmrLambda?: number;
    recencyBoost?: number;
    useGraphBoost: boolean;
    useHybridSearch: boolean;
    useQueryExpansion: boolean;
    useReranker?: boolean;
    alpha?: number;
    similarityThreshold: number;
    preferredChunkType: PreferredChunkType;
}

export interface RetrievalOptimizationResult {
    ragResult: RAGResult;
    shouldUseFallback: boolean;
    fallbackMessage?: string;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function normalizeText(input: string): string {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function lexicalCoverage(query: string, candidate: RankedMatch): number {
    const queryTerms = normalizeText(query)
        .split(' ')
        .filter((term) => term.length > 2);

    if (queryTerms.length === 0) {
        return 0;
    }

    const candidateText = normalizeText(`${candidate.question} ${candidate.answer}`);
    const hits = queryTerms.filter((term) => candidateText.includes(term)).length;
    return hits / queryTerms.length;
}

function buildMatchKey(match: RankedMatch): string {
    const question = normalizeText(match.question).slice(0, 120);
    const answer = normalizeText(match.answer).slice(0, 200);
    return `${question}|${answer}|${match.source_name || match.source}`;
}

function isGenericLowValueAnswer(match: RankedMatch): boolean {
    const answer = match.answer.toLowerCase();
    return (
        answer.length < 60
        && (
            answer.includes('contact technical support')
            || answer.includes("don't have specific information")
            || answer.includes('please consult')
        )
    );
}

function deriveTopK(intent: IntentClassification, analysis: QueryAnalysis, configuredTopK: number): number {
    const intentCap = intent.intent === 'informational'
        ? 3
        : analysis.type === 'comparative'
            ? 5
            : analysis.complexity === 'complex'
                ? 5
                : 4;

    return clamp(configuredTopK, 1, intentCap);
}

export function buildRetrievalPlan(params: RetrievePlanParams): RetrievalPlan {
    const {
        analysis,
        intent,
        routeRetrieval,
        ragSettings,
        searchMode,
        logicalRouteType,
        requestedHybridSearch,
    } = params;

    const configuredTopK = ragSettings?.topK ?? routeRetrieval.topK;
    const topK = deriveTopK(intent, analysis, configuredTopK);
    const simpleQuery = analysis.complexity === 'simple';
    const hasEntities = analysis.entities.length > 0;
    const useHybridSearch = requestedHybridSearch
        && logicalRouteType !== 'relational'
        && (analysis.complexity !== 'simple' || hasEntities || intent.intent === 'troubleshooting');

    return {
        useHYDE: routeRetrieval.useHYDE && !simpleQuery && intent.intent !== 'informational',
        topK,
        useMMR: searchMode === 'mmr',
        useWeighted: searchMode === 'weighted',
        mmrLambda: searchMode === 'mmr' ? (ragSettings?.mmrLambda ?? 0.5) : undefined,
        recencyBoost: searchMode === 'mmr' ? 0.1 : undefined,
        useGraphBoost: ragSettings?.useGraphBoost ?? routeRetrieval.boostEntities,
        useHybridSearch,
        useQueryExpansion: (ragSettings?.useQueryExpansion ?? useHybridSearch) && !simpleQuery,
        useReranker: ragSettings?.useReranker,
        alpha: ragSettings?.alpha,
        similarityThreshold: clamp(
            routeRetrieval.threshold + (intent.intent === 'informational' ? 0.03 : 0),
            0.15,
            0.45,
        ),
        preferredChunkType: routeRetrieval.preferChunkType ?? 'any',
    };
}

function rebuildContextString(query: string, matches: RankedMatch[]): string {
    return matches.map((match, index) => {
        const snippet = (match.relevantPassage || match.answer)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 600);

        return `[${index + 1}] Q: ${match.question}\n    A: ${snippet}`;
    }).join('\n\n');
}

function deriveConfidence(query: string, ragResult: RAGResult, matches: RankedMatch[]): number {
    const top = matches[0]?.finalScore ?? 0;
    const second = matches[1]?.finalScore ?? 0;
    const averageTop = matches.length > 0
        ? matches.slice(0, Math.min(3, matches.length)).reduce((sum, match) => sum + match.finalScore, 0) / Math.min(3, matches.length)
        : 0;
    const averageCoverage = matches.length > 0
        ? matches.slice(0, Math.min(3, matches.length)).reduce((sum, match) => sum + lexicalCoverage(query, match), 0) / Math.min(3, matches.length)
        : 0;
    const supportBonus = Math.min(matches.length, 3) / 3 * 0.05;
    const ambiguityPenalty = matches.length > 1 ? Math.max(0, 0.12 - (top - second)) : 0;

    return clamp(
        ragResult.confidence * 0.30
        + top * 0.35
        + averageTop * 0.15
        + averageCoverage * 0.15
        + supportBonus
        - ambiguityPenalty,
        0,
        1,
    );
}

export function optimizeRetrievalResult(params: {
    query: string;
    ragResult: RAGResult;
    intent: IntentClassification;
    language?: string;
}): RetrievalOptimizationResult {
    const { query, ragResult, intent } = params;
    const sortedMatches = [...ragResult.matches].sort((a, b) => b.finalScore - a.finalScore);
    const desiredTopK = deriveTopK(intent, ragResult.queryAnalysis, sortedMatches.length || 1);
    const topScore = sortedMatches[0]?.finalScore ?? 0;
    const minimumScore = intent.intent === 'informational' ? 0.24 : 0.2;

    const filtered: RankedMatch[] = [];
    const seenKeys = new Set<string>();
    let duplicateCount = 0;
    let noisyCount = 0;

    for (const match of sortedMatches) {
        const key = buildMatchKey(match);
        const coverage = lexicalCoverage(query, match);
        const tooWeak = match.finalScore < minimumScore && match.finalScore < topScore - 0.08;
        const tooNoisy = coverage < 0.18 && match.finalScore < topScore - 0.06;

        if (seenKeys.has(key)) {
            duplicateCount++;
            continue;
        }

        if (isGenericLowValueAnswer(match) && match.finalScore < topScore - 0.04) {
            noisyCount++;
            continue;
        }

        if (tooWeak || tooNoisy) {
            noisyCount++;
            continue;
        }

        seenKeys.add(key);
        filtered.push(match);

        if (filtered.length >= desiredTopK) {
            break;
        }
    }

    const optimizedMatches = filtered;
    const confidence = deriveConfidence(query, ragResult, optimizedMatches);
    const answerMode = answerModeFromConfidence(confidence);
    const shouldUseFallback = optimizedMatches.length === 0 || confidence < 0.30;
    const fallbackMessage = shouldUseFallback
        ? 'Coverage is limited — synthesize the best answer from available context.'
        : undefined;

    const retrievalMetadata = {
        sourcesUsed: [...new Set(optimizedMatches.map((match) => match.source_name || match.source))],
        totalMatches: optimizedMatches.length,
        vectorSources: ragResult.retrievalMetadata?.vectorSources ?? {
            query: ragResult.retrievalStats.queryVectorHits,
            hyde: ragResult.retrievalStats.hydeVectorHits,
            expanded: ragResult.retrievalStats.expandedVectorHits,
        },
        topConfidence: confidence,
        retrievalMethod: `${ragResult.retrievalMetadata?.retrievalMethod || 'rag'}+optimized`,
    };

    return {
        ragResult: {
            ...ragResult,
            matches: optimizedMatches,
            confidence,
            answerMode,
            contextString: rebuildContextString(query, optimizedMatches),
            retrievalStats: {
                ...ragResult.retrievalStats,
                afterRerank: optimizedMatches.length,
            },
            retrievalMetadata: {
                ...retrievalMetadata,
                retrievalMethod: `${retrievalMetadata.retrievalMethod}:deduped=${duplicateCount}:filtered=${noisyCount}`,
            },
        },
        shouldUseFallback,
        fallbackMessage,
    };
}
