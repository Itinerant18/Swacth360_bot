import { ChatOpenAI } from '@langchain/openai';
import { isDiagramRequest } from '@/app/api/diagram/route';
import { logicalRoute, formatRelationalAnswer } from './logical-router';
import { buildDecomposedPromptPrefix, decomposeQuery, mergeSubQueryResults, type SubQuery } from './query-decomposer';
import { logRoute, selectRoute } from './router';
import { classifyQuery, type RAGResult, type RankedMatch } from './rag-engine';
import type { RAGSettings } from './rag-settings';
import { checkCache } from './cache';
import { embedText } from './embeddings';
import { getLLM, SYSTEM_PROMPT } from './llm';
import { isLikelyFollowUp, type ConversationMessage } from './conversation-retrieval';
import { applyFeedbackBoost } from './feedback-reranker';
import { buildCasualResponse, buildIntentStylePrompt, classifyIntent } from './intentClassifier';
import { extractKeywordsAndEntities, processQuery } from './queryProcessor';
import { formatResponse } from './responseFormatter';
import { buildRetrievalPlan } from './retrievalOptimizer';
import { generateQueryExpansions } from './query-expansion';
import { generateHydeEmbedding, shouldGenerateHyde } from './hydeGenerator';
import { createEmbeddingStore, runMultiVectorSearch } from './vectorSearch';
import { retrieveRaptorContexts } from './raptor-retrieval';
import { rankAndDeduplicateContext } from './contextRanker';
import { answerModeFromConfidence, deriveAdaptiveTopK, isFastPathCandidate, scoreConfidence, shouldUseVerificationPass } from './confidence';
import { hasInjectionSignals, sanitizeInput } from './sanitize';
import { createStageTimer } from './pipelineMetrics';
import { checkSemanticCache } from './semanticCache';
import { mergeHybridMatches, searchKeywordMatches } from './hybrid-search';
import { buildContextWindow, rerankMatches } from './reranker';
import type { CacheSource } from './logger';

const UNKNOWN_THRESHOLD = 0.35;

const NOT_FOUND_MESSAGES: Record<string, string> = {
    en: "I don't have specific information about this in my knowledge base. Please consult the HMS panel manual or contact technical support.",
    bn: "à¦†à¦®à¦¾à¦° à¦•à¦¾à¦›à§‡ à¦à¦‡ à¦¬à¦¿à¦·à§Ÿà§‡ à¦¨à¦¿à¦°à§à¦¦à¦¿à¦·à§à¦Ÿ à¦¤à¦¥à§à¦¯ à¦¨à§‡à¦‡à¥¤ à¦…à¦¨à§à¦—à§à¦°à¦¹ à¦•à¦°à§‡ HMS à¦ªà§à¦¯à¦¾à¦¨à§‡à¦²à§‡à¦° à¦®à§à¦¯à¦¾à¦¨à§à§Ÿà¦¾à¦² à¦¦à§‡à¦–à§à¦¨ à¦¬à¦¾ à¦Ÿà§‡à¦•à¦¨à¦¿à¦•à§à¦¯à¦¾à¦² à¦¸à¦¾à¦ªà§‹à¦°à§à¦Ÿà§‡ à¦¯à§‹à¦—à¦¾à¦¯à§‹à¦— à¦•à¦°à§à¦¨à¥¤",
    hi: "à¤®à¥‡à¤°à¥‡ à¤ªà¤¾à¤¸ à¤‡à¤¸ à¤µà¤¿à¤·à¤¯ à¤®à¥‡à¤‚ à¤µà¤¿à¤¶à¤¿à¤·à¥à¤Ÿ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ HMS à¤ªà¥ˆà¤¨à¤² à¤®à¥ˆà¤¨à¥à¤…à¤² à¤¦à¥‡à¤–à¥‡à¤‚ à¤¯à¤¾ à¤¤à¤•à¤¨à¥€à¤•à¥€ à¤¸à¤¹à¤¾à¤¯à¤¤à¤¾ à¤¸à¥‡ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤°à¥‡à¤‚à¥¤",
};

type PipelineMetrics = {
    totalLatencyMs: number;
    stages: Record<string, number>;
    hydeUsed: boolean;
    queryExpansionUsed: boolean;
    matchCount: number;
    cacheHit: boolean;
    cacheTier: string | null;
    llmCallCount: number;
};

type DiagramMatch = {
    question: string;
    answer: string;
    category: string;
    finalScore: number;
};

export interface PipelineInput {
    query: string;
    language: 'en' | 'bn' | 'hi';
    userId: string | null;
    conversationId: string | null;
    conversationHistory: ConversationMessage[];
    settings: RAGSettings | null;
    requestId: string;
    clientIp: string;
    searchMode?: string;
}

export interface PipelineResult {
    answer: string;
    answerMode: string;
    confidence: number;
    isDiagram: boolean;
    diagramStrategy?: 'stored' | 'generate';
    diagramPayload?: unknown;
    diagramType?: string;
    diagramMatches?: DiagramMatch[];
    cacheSource?: CacheSource;
    needsLLMGeneration: boolean;
    systemPrompt?: string;
    formattedUserQuery?: string;
    verificationPrompt?: string;
    needsVerification?: boolean;
    llmVariant?: 'simple' | 'complex';
    llmMaxTokens?: number;
    llmTemperature?: number;
    dbAnswerMode: string;
    englishQuestion: string;
    retrievalQuestion: string;
    originalQueryForLog: string;
    rewrittenQueryForLog: string;
    intent: string;
    fallbackMessage?: string;
    ragResult?: RAGResult;
    matches: RankedMatch[];
    cachedQueryEmbedding?: number[];
    finalChunks: string[];
    retrievedChunks: string[];
    shouldLogUnknownQuestion: boolean;
    metrics: PipelineMetrics;
}

function isEnglish(text: string): boolean {
    const asciiLetters = (text.match(/[a-zA-Z]/g) || []).length;
    const allLetters = (text.match(/\p{L}/gu) || []).length || 1;
    return (asciiLetters / allLetters) > 0.6;
}

export function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => reject(new Error('LLM_TIMEOUT')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timerId !== null) {
            clearTimeout(timerId);
        }
    });
}

async function translateToEnglish(
    text: string,
    language: string,
    llm: ChatOpenAI,
    conversationHistory: string,
): Promise<string> {
    if (language === 'en' || isEnglish(text)) {
        return text.trim();
    }

    const sourceLang = language === 'hi' ? 'Hindi' : 'Bengali';
    const historyCtx = conversationHistory ? `Context:\n${conversationHistory}\n\n` : '';
    const prompt = `Translate the ${sourceLang} question to English. Resolve pronouns using context. Output ONLY the English translation.\n${historyCtx}${sourceLang}: ${text}\nEnglish:`;

    try {
        const result = await raceWithTimeout(llm.invoke(prompt), 10_000);
        return String(result.content).trim() || text.trim();
    } catch (err) {
        console.warn('[translateToEnglish] failed, using original text:', (err as Error).message);
        return text.trim();
    }
}

function elapsed(start: number): string {
    return `${((performance.now() - start) / 1000).toFixed(2)}s`;
}

function buildChunkLabels(matches: RankedMatch[]): string[] {
    return matches.slice(0, 5).map((match) => {
        const source = match.source_name || match.source || 'kb';
        return `${source} | ${match.question}`.replace(/\s+/g, ' ').trim().slice(0, 140);
    });
}

function shouldUseHybridRetrieval(
    analysis: ReturnType<typeof classifyQuery>,
    logicalRouteType: 'vector' | 'relational' | 'hybrid',
    requested: boolean | undefined,
): boolean {
    if (typeof requested === 'boolean') {
        return requested;
    }

    return logicalRouteType === 'hybrid'
        || analysis.type === 'comparative'
        || analysis.complexity === 'complex';
}

function mergeMatches(matchGroups: RankedMatch[][]): RankedMatch[] {
    const merged = new Map<string, RankedMatch>();

    for (const group of matchGroups) {
        for (const match of group) {
            const existing = merged.get(match.id);
            if (!existing || match.finalScore > existing.finalScore) {
                merged.set(match.id, match);
            }
        }
    }

    return [...merged.values()].sort((a, b) => b.finalScore - a.finalScore);
}

type RetrievedSubQuery = {
    subQuery: SubQuery;
    ragResult: RAGResult;
};

function buildMergedRagResult(
    originalAnalysis: ReturnType<typeof classifyQuery>,
    subResults: RetrievedSubQuery[],
    startedAt: number,
): RAGResult {
    const merged = mergeSubQueryResults(
        subResults.map(({ subQuery, ragResult }) => ({
            subQuery,
            matches: ragResult.matches,
            answerMode: ragResult.answerMode,
            confidence: ragResult.confidence,
        })),
        subResults.map(({ subQuery }) => subQuery.query).join(' '),
    );

    const matches = mergeMatches(subResults.map(({ ragResult }) => ragResult.matches));
    const retrievalStats = subResults.reduce(
        (acc, { ragResult }) => {
            acc.queryVectorHits += ragResult.retrievalStats.queryVectorHits;
            acc.hydeVectorHits += ragResult.retrievalStats.hydeVectorHits;
            acc.expandedVectorHits += ragResult.retrievalStats.expandedVectorHits;
            acc.totalCandidates += ragResult.retrievalStats.totalCandidates;
            acc.afterRerank += ragResult.retrievalStats.afterRerank;
            return acc;
        },
        {
            queryVectorHits: 0,
            hydeVectorHits: 0,
            expandedVectorHits: 0,
            totalCandidates: 0,
            afterRerank: 0,
            latencyMs: performance.now() - startedAt,
        },
    );

    const sourcesUsed = [...new Set(matches.map((match) => match.source_name || match.source))];

    return {
        matches,
        queryAnalysis: originalAnalysis,
        answerMode: merged.answerMode,
        confidence: merged.overallConfidence,
        contextString: merged.contextString,
        retrievalStats,
        retrievalMetadata: {
            sourcesUsed,
            totalMatches: matches.length,
            vectorSources: {
                query: retrievalStats.queryVectorHits,
                hyde: retrievalStats.hydeVectorHits,
                expanded: retrievalStats.expandedVectorHits,
            },
            topConfidence: merged.overallConfidence,
            retrievalMethod: 'decomposed-multi-query',
        },
    };
}

async function runRetrievalStages(params: {
    query: string;
    analysis: ReturnType<typeof classifyQuery>;
    llm: ChatOpenAI;
    retrieveOptions: ReturnType<typeof buildRetrievalPlan>;
    queryEmbedding?: number[];
    keywords?: string[];
    entities?: string[];
    requestCache?: ReturnType<typeof createEmbeddingStore>;
}): Promise<{
    ragResult: RAGResult;
    fallbackMessage?: string;
    diagnostics: {
        hydeUsed: boolean;
        hydeAttempted: boolean;
        queryExpansionUsed: boolean;
        keywordMatches: number;
        degradationApplied: boolean;
        effectiveTopK: number;
    };
}> {
    const {
        query,
        analysis,
        llm,
        retrieveOptions,
        queryEmbedding,
        keywords = [],
        entities = [],
        requestCache,
    } = params;

    const retrievalStart = performance.now();
    const fallbackKeywords = keywords.length > 0
        ? keywords
        : query.toLowerCase().split(/\W+/).filter((token) => token.length > 2).slice(0, 5);
    const resolvedQueryEmbedding = queryEmbedding ?? await embedText(query);

    const emptyVectorResult = {
        queryEmbedding: resolvedQueryEmbedding,
        matches: [] as RankedMatch[],
        stats: {
            queryVectorHits: 0,
            hydeVectorHits: 0,
            expandedVectorHits: 0,
            totalCandidates: 0,
        },
    };

    const [baseVectorResult, expansionResult, raptorMatches, keywordMatches] = await Promise.all([
        runMultiVectorSearch({
            query,
            queryEmbedding: resolvedQueryEmbedding,
            expandedQueries: [],
            hydeEmbedding: null,
            similarityThreshold: retrieveOptions.similarityThreshold,
            useMMR: retrieveOptions.useMMR,
            useWeighted: retrieveOptions.useWeighted,
            mmrLambda: retrieveOptions.mmrLambda,
            recencyBoost: retrieveOptions.recencyBoost,
            preferredChunkType: retrieveOptions.preferredChunkType,
            requestCache,
        }),
        generateQueryExpansions({
            query,
            keywords: fallbackKeywords,
            entities,
            llm: retrieveOptions.useQueryExpansion ? llm : undefined,
            maxVariations: 4,
        }),
        retrieveRaptorContexts({
            queryEmbedding: resolvedQueryEmbedding,
            analysis,
            topK: Math.max(retrieveOptions.topK, 4),
            threshold: retrieveOptions.similarityThreshold,
        }),
        retrieveOptions.useHybridSearch
            ? searchKeywordMatches({
                query,
                topK: Math.max(retrieveOptions.topK * 2, 6),
            })
            : Promise.resolve([] as RankedMatch[]),
    ]);

    const expandedVectorResult = expansionResult.variations.length > 0
        ? await runMultiVectorSearch({
            query,
            queryEmbedding: resolvedQueryEmbedding,
            expandedQueries: expansionResult.variations,
            hydeEmbedding: null,
            similarityThreshold: retrieveOptions.similarityThreshold,
            useMMR: retrieveOptions.useMMR,
            useWeighted: retrieveOptions.useWeighted,
            mmrLambda: retrieveOptions.mmrLambda,
            recencyBoost: retrieveOptions.recencyBoost,
            preferredChunkType: retrieveOptions.preferredChunkType,
            includeQueryVector: false,
            requestCache,
        })
        : emptyVectorResult;

    const preliminaryCandidates = mergeHybridMatches({
        query,
        vectorMatches: [
            ...baseVectorResult.matches,
            ...expandedVectorResult.matches,
            ...raptorMatches,
        ],
        keywordMatches,
        topK: Math.max(retrieveOptions.topK * 3, 10),
    });
    const preliminaryReranked = rerankMatches({
        query,
        matches: preliminaryCandidates,
        topK: Math.max(retrieveOptions.topK * 2, 6),
    });
    const preliminaryConfidence = scoreConfidence({
        query,
        matches: preliminaryReranked.slice(0, 3),
        baseConfidence: preliminaryReranked[0]?.finalScore ?? 0,
    });
    const effectiveTopK = Math.min(
        retrieveOptions.topK,
        deriveAdaptiveTopK({
            complexity: analysis.complexity,
            confidence: preliminaryConfidence.score,
            entityCount: entities.length,
        }),
    );

    const hydeEnabled = shouldGenerateHyde({
        enabled: retrieveOptions.useHYDE,
        queryType: analysis.type,
        complexity: analysis.complexity,
        preliminaryConfidence: preliminaryConfidence.score,
        elapsedMs: performance.now() - retrievalStart,
        hasEntities: entities.length > 0,
    });

    const hydeResult = hydeEnabled
        ? await generateHydeEmbedding({
            query,
            queryType: analysis.type,
            llm,
            enabled: true,
        })
        : {
            text: null,
            embedding: null,
            timedOut: false,
            attempted: false,
            skipped: true,
        };

    const hydeVectorResult = hydeResult.embedding
        ? await runMultiVectorSearch({
            query,
            queryEmbedding: resolvedQueryEmbedding,
            expandedQueries: [],
            hydeEmbedding: hydeResult.embedding,
            similarityThreshold: retrieveOptions.similarityThreshold,
            useMMR: retrieveOptions.useMMR,
            useWeighted: retrieveOptions.useWeighted,
            mmrLambda: retrieveOptions.mmrLambda,
            recencyBoost: retrieveOptions.recencyBoost,
            preferredChunkType: retrieveOptions.preferredChunkType,
            includeQueryVector: false,
            requestCache,
        })
        : emptyVectorResult;

    const combinedMatches = rerankMatches({
        query,
        matches: mergeHybridMatches({
            query,
            vectorMatches: [...preliminaryCandidates, ...hydeVectorResult.matches],
            keywordMatches: [],
            topK: Math.max(effectiveTopK * 3, 10),
        }),
        topK: Math.max(effectiveTopK * 2, 6),
    });

    if (combinedMatches.length > 0) {
        await applyFeedbackBoost(combinedMatches);
    }

    const rankedContext = rankAndDeduplicateContext({
        query,
        matches: combinedMatches,
        maxContexts: effectiveTopK,
        preferredChunkType: retrieveOptions.preferredChunkType,
    });

    const confidenceResult = scoreConfidence({
        query,
        matches: rankedContext.matches,
        baseConfidence: combinedMatches[0]?.finalScore ?? 0,
    });
    const contextString = buildContextWindow(rankedContext.matches, 3600);
    const answerMode = answerModeFromConfidence(confidenceResult.score);

    return {
        ragResult: {
            matches: rankedContext.matches,
            queryAnalysis: analysis,
            answerMode,
            confidence: confidenceResult.score,
            contextString,
            retrievalStats: {
                queryVectorHits: baseVectorResult.stats.queryVectorHits,
                hydeVectorHits: hydeVectorResult.stats.hydeVectorHits,
                expandedVectorHits: expandedVectorResult.stats.expandedVectorHits,
                totalCandidates: combinedMatches.length + keywordMatches.length,
                afterRerank: rankedContext.matches.length,
                latencyMs: performance.now() - retrievalStart,
            },
            retrievalMetadata: {
                sourcesUsed: [...new Set(rankedContext.matches.map((match) => match.source_name || match.source))],
                totalMatches: rankedContext.matches.length,
                vectorSources: {
                    query: baseVectorResult.stats.queryVectorHits,
                    hyde: hydeVectorResult.stats.hydeVectorHits,
                    expanded: expandedVectorResult.stats.expandedVectorHits,
                },
                topConfidence: confidenceResult.score,
                retrievalMethod: retrieveOptions.useHybridSearch ? 'hybrid-rag' : 'vector-rag',
            },
        },
        fallbackMessage: confidenceResult.fallbackMessage,
        diagnostics: {
            hydeUsed: Boolean(hydeResult.embedding),
            hydeAttempted: hydeResult.attempted,
            queryExpansionUsed: expansionResult.variations.length > 0,
            keywordMatches: keywordMatches.length,
            degradationApplied: Boolean(confidenceResult.fallbackMessage),
            effectiveTopK,
        },
    };
}

function buildFinalSystemPrompt(params: {
    langName: string;
    routedSystem: string;
    contextPrefix: string;
    context: string;
    history: string;
    decomposedPrefix: string;
    finalAnswerStyle: string;
    fallbackNote?: string;
}): string {
    const {
        langName,
        routedSystem,
        contextPrefix,
        context,
        history,
        decomposedPrefix,
        finalAnswerStyle,
        fallbackNote,
    } = params;

    const sections = [
        `OUTPUT LANGUAGE: ${langName}`,
        `CRITICAL: You must write your entire response in ${langName}. Do not use English if the user asked in ${langName}.`,
        SYSTEM_PROMPT.trim(),
        routedSystem.trim(),
    ];

    if (history.trim()) {
        sections.push(`RECENT CONVERSATION MEMORY:\n${history.trim()}`);
    }

    if (decomposedPrefix.trim()) {
        sections.push(decomposedPrefix.trim());
    }

    if (context.trim()) {
        sections.push(`${contextPrefix}\n${context.trim()}`);
    }

    if (finalAnswerStyle.trim()) {
        sections.push(finalAnswerStyle.trim());
    }

    if (fallbackNote) {
        sections.push(`CONFIDENCE NOTE:\n- Retrieval confidence is limited but some relevant context was found.\n- Synthesize the best possible answer from available context.\n- Briefly note if the answer may be incomplete.`);
    }

    return sections.join('\n\n');
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
    const requestStart = performance.now();
    const stageTimer = createStageTimer();
    const requestEmbeddingCache = createEmbeddingStore();
    const {
        query: latestMessage,
        language,
        settings,
        clientIp,
        conversationHistory,
        searchMode = 'default',
    } = input;

    const languageNames = { en: 'English', bn: 'Bengali', hi: 'Hindi' } as const;
    const langName = languageNames[language] || 'English';
    const notFoundMsg = NOT_FOUND_MESSAGES[language] || NOT_FOUND_MESSAGES.en;

    let cacheSource: CacheSource = 'none';
    let llmCallCount = 0;
    let originalQueryForLog = '';
    let rewrittenQueryForLog = '';
    let intentForLog = 'unknown';

    const finalizeMetrics = (overrides: Partial<PipelineMetrics>): PipelineMetrics => ({
        totalLatencyMs: performance.now() - requestStart,
        stages: { ...stageTimer.getTimings() },
        hydeUsed: false,
        queryExpansionUsed: false,
        matchCount: 0,
        cacheHit: false,
        cacheTier: null,
        llmCallCount,
        ...overrides,
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log(`User [${language}]: "${latestMessage}"`);

    const historyText = conversationHistory
        .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
        .join('\n');

    const complexLlm = getLLM('complex');
    const simpleLlm = getLLM('simple');

    if (language !== 'en' && !isEnglish(latestMessage)) {
        llmCallCount += 1;
    }

    stageTimer.mark('translation');
    const englishQuestion = await translateToEnglish(
        latestMessage,
        language,
        simpleLlm,
        historyText,
    );
    stageTimer.end('translation');

    if (language !== 'en' && !isEnglish(latestMessage)) {
        console.log(`Translation [${language}->EN]: "${englishQuestion}"`);
    }

    originalQueryForLog = englishQuestion;

    const shouldUseRewriteModel = conversationHistory.length > 0 && isLikelyFollowUp(englishQuestion);
    if (shouldUseRewriteModel) {
        llmCallCount += 1;
    }

    const processedQuery = await processQuery({
        originalQuery: englishQuestion,
        history: conversationHistory,
        llm: shouldUseRewriteModel ? simpleLlm : undefined,
    });

    let retrievalQuestion = processedQuery.retrievalQuery;
    if (hasInjectionSignals(retrievalQuestion)) {
        console.warn(`[chat] Injection attempt detected from IP ${clientIp}: "${retrievalQuestion.slice(0, 100)}"`);
    }

    retrievalQuestion = sanitizeInput(retrievalQuestion);
    const baseAnalysis = classifyQuery(retrievalQuestion);
    const intent = classifyIntent(retrievalQuestion, baseAnalysis);
    rewrittenQueryForLog = retrievalQuestion;
    intentForLog = intent.intent;

    if (processedQuery.retrievalQuery !== processedQuery.normalizedOriginal) {
        console.log(`Query rewrite: "${processedQuery.normalizedOriginal}" -> "${processedQuery.retrievalQuery}"`);
    }

    console.log(`Intent: ${intent.intent} (${intent.reason})`);

    if (intent.intent === 'casual') {
        return {
            answer: buildCasualResponse(latestMessage, language),
            answerMode: 'casual',
            confidence: 1,
            isDiagram: false,
            cacheSource,
            needsLLMGeneration: false,
            dbAnswerMode: 'casual',
            englishQuestion,
            retrievalQuestion,
            originalQueryForLog,
            rewrittenQueryForLog,
            intent: intentForLog,
            matches: [],
            finalChunks: [],
            retrievedChunks: [],
            shouldLogUnknownQuestion: false,
            metrics: finalizeMetrics({
                llmCallCount,
            }),
        };
    }

    const origDiagram = isDiagramRequest(englishQuestion);
    const rewrittenDiagram = isDiagramRequest(retrievalQuestion);
    const isDiagram = origDiagram.isDiagram || rewrittenDiagram.isDiagram;
    const diagramType = origDiagram.isDiagram ? origDiagram.diagramType : rewrittenDiagram.diagramType;

    stageTimer.mark('cacheCheck');
    if (!isDiagram) {
        const tier1CacheResult = await checkCache(retrievalQuestion, null, language);
        if (tier1CacheResult.hit) {
            stageTimer.end('cacheCheck');
            cacheSource = 'exact';
            console.log('[chat] Cache Tier 1 hit - skipping full RAG pipeline');
            const cachedAnswer = formatResponse(tier1CacheResult.answer, {
                intent: intent.intent,
                confidence: 0.88,
            });

            return {
                answer: cachedAnswer,
                answerMode: 'cache',
                confidence: 1,
                isDiagram: false,
                cacheSource,
                needsLLMGeneration: false,
                dbAnswerMode: 'cache',
                englishQuestion,
                retrievalQuestion,
                originalQueryForLog,
                rewrittenQueryForLog,
                intent: intentForLog,
                matches: [],
                finalChunks: [],
                retrievedChunks: [],
                shouldLogUnknownQuestion: false,
                metrics: finalizeMetrics({
                    cacheHit: true,
                    cacheTier: '1',
                    llmCallCount,
                }),
            };
        }
    }

    const { decision, relationalResult } = await logicalRoute(retrievalQuestion);
    if (decision.route === 'relational' && relationalResult) {
        return {
            answer: formatRelationalAnswer(relationalResult, langName),
            answerMode: 'relational',
            confidence: 0.9,
            isDiagram: false,
            cacheSource,
            needsLLMGeneration: false,
            dbAnswerMode: 'relational',
            englishQuestion,
            retrievalQuestion,
            originalQueryForLog,
            rewrittenQueryForLog,
            intent: intentForLog,
            matches: [],
            finalChunks: [],
            retrievedChunks: [],
            shouldLogUnknownQuestion: false,
            metrics: finalizeMetrics({
                llmCallCount,
            }),
        };
    }

    stageTimer.mark('embedding');
    const cachedQueryEmbedding = await embedText(retrievalQuestion);
    stageTimer.end('embedding');

    if (!isDiagram && isFastPathCandidate({ query: retrievalQuestion, complexity: baseAnalysis.complexity })) {
        const semanticFastPath = checkSemanticCache({
            query: retrievalQuestion,
            queryEmbedding: cachedQueryEmbedding,
        });

        if (semanticFastPath.hit) {
            stageTimer.end('cacheCheck');
            cacheSource = 'semantic_local';
            console.log(`[chat] Local semantic cache hit (sim=${semanticFastPath.similarity.toFixed(3)}) - skipping full RAG pipeline`);

            return {
                answer: formatResponse(semanticFastPath.answer, {
                    intent: intent.intent,
                    confidence: semanticFastPath.similarity,
                }),
                answerMode: 'cache',
                confidence: semanticFastPath.similarity,
                isDiagram: false,
                cacheSource,
                needsLLMGeneration: false,
                dbAnswerMode: 'cache',
                englishQuestion,
                retrievalQuestion,
                originalQueryForLog,
                rewrittenQueryForLog,
                intent: intentForLog,
                matches: [],
                cachedQueryEmbedding,
                finalChunks: [],
                retrievedChunks: [],
                shouldLogUnknownQuestion: false,
                metrics: finalizeMetrics({
                    cacheHit: true,
                    cacheTier: 'semantic_local',
                    llmCallCount,
                }),
            };
        }
    }

    if (!isDiagram) {
        const tier2CacheResult = await checkCache(retrievalQuestion, cachedQueryEmbedding, language);
        if (tier2CacheResult.hit) {
            stageTimer.end('cacheCheck');
            cacheSource = 'semantic_db';
            console.log(`[chat] Cache Tier 2 hit (sim=${tier2CacheResult.similarity?.toFixed(3)}) - skipping full RAG pipeline`);

            return {
                answer: formatResponse(tier2CacheResult.answer, {
                    intent: intent.intent,
                    confidence: tier2CacheResult.similarity ?? 0.82,
                }),
                answerMode: 'cache',
                confidence: tier2CacheResult.similarity ?? 0.82,
                isDiagram: false,
                cacheSource,
                needsLLMGeneration: false,
                dbAnswerMode: 'cache',
                englishQuestion,
                retrievalQuestion,
                originalQueryForLog,
                rewrittenQueryForLog,
                intent: intentForLog,
                matches: [],
                cachedQueryEmbedding,
                finalChunks: [],
                retrievedChunks: [],
                shouldLogUnknownQuestion: false,
                metrics: finalizeMetrics({
                    cacheHit: true,
                    cacheTier: 'semantic_db',
                    llmCallCount,
                }),
            };
        }
    }

    stageTimer.end('cacheCheck');
    const routedRetrievalConfig = selectRoute(baseAnalysis, langName, notFoundMsg);
    logRoute(baseAnalysis, routedRetrievalConfig);

    const isSimple = baseAnalysis.complexity === 'simple';
    if (!isSimple) {
        llmCallCount += 1;
    }

    const decomposed = isSimple
        ? { isDecomposed: false as const, subQueries: [], reasoning: 'Skipped â€” simple query', originalQuery: retrievalQuestion }
        : await decomposeQuery(retrievalQuestion, baseAnalysis, complexLlm);
    const decomposedPrefix = buildDecomposedPromptPrefix(decomposed);
    const retrieveOptions = buildRetrievalPlan({
        analysis: baseAnalysis,
        intent,
        routeRetrieval: routedRetrievalConfig.route.retrieval,
        ragSettings: settings,
        searchMode,
        logicalRouteType: decision.route,
        requestedHybridSearch: shouldUseHybridRetrieval(
            baseAnalysis,
            decision.route,
            settings?.useHybridSearch,
        ),
    });

    if (retrieveOptions.useQueryExpansion) {
        llmCallCount += 1;
    }

    stageTimer.mark('retrieval');
    const ragStart = performance.now();
    let lastRagResult: RAGResult;
    let fallbackMessage: string | undefined;
    let retrievalDiagnostics = {
        hydeUsed: false,
        hydeAttempted: false,
        queryExpansionUsed: false,
        keywordMatches: 0,
        degradationApplied: false,
        effectiveTopK: retrieveOptions.topK,
    };

    if (decomposed.isDecomposed) {
        const subResults = await Promise.all(
            decomposed.subQueries.map(async (subQuery) => {
                const extracted = extractKeywordsAndEntities(subQuery.query);
                const stageResult = await runRetrievalStages({
                    query: subQuery.query,
                    analysis: classifyQuery(subQuery.query),
                    llm: simpleLlm,
                    retrieveOptions,
                    keywords: extracted.keywords,
                    entities: extracted.entities,
                    requestCache: requestEmbeddingCache,
                });

                return {
                    subQuery,
                    ragResult: stageResult.ragResult,
                    fallbackMessage: stageResult.fallbackMessage,
                    diagnostics: stageResult.diagnostics,
                };
            }),
        );
        lastRagResult = buildMergedRagResult(
            baseAnalysis,
            subResults.map(({ subQuery, ragResult }) => ({ subQuery, ragResult })),
            ragStart,
        );
        retrievalDiagnostics = {
            hydeUsed: subResults.some((result) => result.diagnostics.hydeUsed),
            hydeAttempted: subResults.some((result) => result.diagnostics.hydeAttempted),
            queryExpansionUsed: subResults.some((result) => result.diagnostics.queryExpansionUsed),
            keywordMatches: subResults.reduce((sum, result) => sum + result.diagnostics.keywordMatches, 0),
            degradationApplied: subResults.some((result) => result.diagnostics.degradationApplied),
            effectiveTopK: Math.max(retrieveOptions.topK, ...subResults.map((result) => result.diagnostics.effectiveTopK)),
        };
        fallbackMessage = subResults.find((result) => result.fallbackMessage)?.fallbackMessage;
    } else {
        const stageResult = await runRetrievalStages({
            query: retrievalQuestion,
            analysis: baseAnalysis,
            llm: simpleLlm,
            retrieveOptions,
            queryEmbedding: cachedQueryEmbedding,
            keywords: processedQuery.keywords,
            entities: processedQuery.entities,
            requestCache: requestEmbeddingCache,
        });

        lastRagResult = stageResult.ragResult;
        fallbackMessage = stageResult.fallbackMessage;
        retrievalDiagnostics = stageResult.diagnostics;
    }

    if (retrievalDiagnostics.hydeAttempted) {
        llmCallCount += 1;
    }

    stageTimer.mark('reranking');
    if (decomposed.isDecomposed) {
        const rerankedMerged = rankAndDeduplicateContext({
            query: retrievalQuestion,
            matches: lastRagResult.matches,
            maxContexts: retrievalDiagnostics.effectiveTopK,
            preferredChunkType: retrieveOptions.preferredChunkType,
        });
        const mergedConfidence = scoreConfidence({
            query: retrievalQuestion,
            matches: rerankedMerged.matches,
            baseConfidence: lastRagResult.confidence,
        });

        lastRagResult = {
            ...lastRagResult,
            matches: rerankedMerged.matches,
            confidence: mergedConfidence.score,
            answerMode: answerModeFromConfidence(mergedConfidence.score),
            contextString: buildContextWindow(rerankedMerged.matches, 2400),
            retrievalStats: {
                ...lastRagResult.retrievalStats,
                afterRerank: rerankedMerged.matches.length,
                latencyMs: performance.now() - ragStart,
            },
            retrievalMetadata: {
                sourcesUsed: [...new Set(rerankedMerged.matches.map((match) => match.source_name || match.source))],
                totalMatches: rerankedMerged.matches.length,
                vectorSources: lastRagResult.retrievalMetadata?.vectorSources ?? {
                    query: lastRagResult.retrievalStats.queryVectorHits,
                    hyde: lastRagResult.retrievalStats.hydeVectorHits,
                    expanded: lastRagResult.retrievalStats.expandedVectorHits,
                },
                topConfidence: mergedConfidence.score,
                retrievalMethod: `${lastRagResult.retrievalMetadata?.retrievalMethod || 'pipeline'}:merged`,
            },
        };
        fallbackMessage = mergedConfidence.fallbackMessage || fallbackMessage;
    } else {
        lastRagResult = {
            ...lastRagResult,
            retrievalStats: {
                ...lastRagResult.retrievalStats,
                latencyMs: performance.now() - ragStart,
            },
        };
    }

    stageTimer.end('reranking');
    stageTimer.end('retrieval');
    console.log(`RAG pipeline completed [${elapsed(ragStart)}]`);

    const {
        answerMode,
        confidence,
        contextString,
        matches,
        retrievalStats,
    } = lastRagResult;

    console.log(`[chat] Retrieval result: matches=${matches.length}, confidence=${confidence.toFixed(3)}, answerMode=${answerMode}, contextLen=${contextString?.length ?? 0}, topScore=${matches[0]?.finalScore?.toFixed(3) ?? 'N/A'}, stats=${JSON.stringify(retrievalStats)}`);

    const retrievedChunks = buildChunkLabels(lastRagResult.matches);
    const finalChunks = buildChunkLabels(matches);
    const baseMetrics: Partial<PipelineMetrics> = {
        hydeUsed: retrievalDiagnostics.hydeUsed,
        queryExpansionUsed: retrievalDiagnostics.queryExpansionUsed,
        matchCount: matches.length,
        llmCallCount,
    };
    const topMatch = matches[0];

    if (
        topMatch &&
        topMatch.chunkType === 'diagram' &&
        confidence >= 0.55 &&
        topMatch.answer?.length > 100
    ) {
        console.log(`ðŸ“ Stored diagram found: "${topMatch.question}" (conf: ${confidence.toFixed(2)})`);

        const storedDiagramPayload = {
            __type: 'diagram' as const,
            markdown: topMatch.answer,
            title: topMatch.question,
            diagramType: topMatch.subcategory || 'wiring',
            panelType: 'HMS Panel',
            hasKBContext: true,
            generatedBy: 'kb_stored',
            success: true,
        };

        return {
            answer: `DIAGRAM_RESPONSE:${JSON.stringify(storedDiagramPayload)}`,
            answerMode: 'diagram_stored',
            confidence,
            isDiagram: true,
            diagramStrategy: 'stored',
            diagramPayload: storedDiagramPayload,
            cacheSource,
            needsLLMGeneration: false,
            dbAnswerMode: 'diagram_stored',
            englishQuestion,
            retrievalQuestion,
            originalQueryForLog,
            rewrittenQueryForLog,
            intent: intentForLog,
            fallbackMessage,
            ragResult: lastRagResult,
            matches,
            cachedQueryEmbedding,
            finalChunks,
            retrievedChunks,
            shouldLogUnknownQuestion: confidence < UNKNOWN_THRESHOLD,
            metrics: finalizeMetrics(baseMetrics),
        };
    }

    if (isDiagram) {
        console.log(`Diagram request: ${diagramType}`);
        return {
            answer: '',
            answerMode: 'diagram',
            confidence,
            isDiagram: true,
            diagramStrategy: 'generate',
            diagramType,
            diagramMatches: matches.map((match) => ({
                question: match.question,
                answer: match.answer,
                category: match.category,
                finalScore: match.finalScore,
            })),
            cacheSource,
            needsLLMGeneration: false,
            dbAnswerMode: 'diagram',
            englishQuestion,
            retrievalQuestion,
            originalQueryForLog,
            rewrittenQueryForLog,
            intent: intentForLog,
            fallbackMessage,
            ragResult: lastRagResult,
            matches,
            cachedQueryEmbedding,
            finalChunks,
            retrievedChunks,
            shouldLogUnknownQuestion: confidence < UNKNOWN_THRESHOLD,
            metrics: finalizeMetrics(baseMetrics),
        };
    }

    if (answerMode === 'general' && (!contextString || contextString.trim().length < 30) && matches.length === 0) {
        console.log(`[chat] Hallucination gate triggered - answerMode=general, contextLength=${contextString?.length ?? 0}, matches=${matches.length}`);

        return {
            answer: notFoundMsg,
            answerMode: 'general',
            confidence: 0,
            isDiagram: false,
            cacheSource,
            needsLLMGeneration: false,
            dbAnswerMode: 'not_found',
            englishQuestion,
            retrievalQuestion,
            originalQueryForLog,
            rewrittenQueryForLog,
            intent: intentForLog,
            fallbackMessage,
            ragResult: lastRagResult,
            matches,
            cachedQueryEmbedding,
            finalChunks: [],
            retrievedChunks: [],
            shouldLogUnknownQuestion: true,
            metrics: finalizeMetrics({
                ...baseMetrics,
                matchCount: 0,
            }),
        };
    }

    const routedPrompt = selectRoute(baseAnalysis, langName, notFoundMsg, lastRagResult.answerMode);
    const historySection = sanitizeInput(processedQuery.memory.promptContext.trim());
    const systemPrompt = buildFinalSystemPrompt({
        langName,
        routedSystem: routedPrompt.system,
        contextPrefix: routedPrompt.contextPrefix,
        context: contextString,
        history: historySection,
        decomposedPrefix,
        finalAnswerStyle: buildIntentStylePrompt(intent),
        fallbackNote: fallbackMessage,
    });

    const needsVerification = shouldUseVerificationPass({
        complexity: baseAnalysis.complexity,
        confidence,
        matchCount: matches.length,
    });
    const dbAnswerMode = answerMode.startsWith('rag') ? 'rag' : answerMode;
    const formattedUserQuery = `Respond ENTIRELY in ${langName} using only the provided context.\n\nUser Query: ${latestMessage}`;
    const verificationPrompt = `Revise the draft answer so every claim stays grounded in the provided context. 

CRITICAL: The answer must be written ENTIRELY in ${langName}. If it is not in ${langName}, translate it now.

Context:
${contextString}

Draft answer:
{{DRAFT_ANSWER}}

Return only the improved answer in ${langName}.`;

    return {
        answer: '',
        answerMode,
        confidence,
        isDiagram: false,
        cacheSource,
        needsLLMGeneration: true,
        systemPrompt,
        formattedUserQuery,
        verificationPrompt,
        needsVerification,
        llmVariant: isSimple ? 'simple' : 'complex',
        llmMaxTokens: routedPrompt.route.maxTokens,
        llmTemperature: routedPrompt.route.temperature,
        dbAnswerMode,
        englishQuestion,
        retrievalQuestion,
        originalQueryForLog,
        rewrittenQueryForLog,
        intent: intentForLog,
        fallbackMessage,
        ragResult: lastRagResult,
        matches,
        cachedQueryEmbedding,
        finalChunks,
        retrievedChunks,
        shouldLogUnknownQuestion: confidence < UNKNOWN_THRESHOLD,
        metrics: finalizeMetrics(baseMetrics),
    };
}
