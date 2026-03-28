/**
 * src/app/api/chat/route.ts
 *
 * Main chat pipeline for SAI HMS support.
 * Refactored to use OpenAI GPT-4o and GPT-4o-mini.
 */

import dns from 'node:dns';
import { ChatOpenAI } from '@langchain/openai';
import { isDiagramRequest, generateDiagramInternal } from '@/app/api/diagram/route';
import { evaluateAndStore } from '@/lib/rag-evaluator';
import { logicalRoute, formatRelationalAnswer } from '@/lib/logical-router';
import { buildDecomposedPromptPrefix, decomposeQuery, mergeSubQueryResults, type SubQuery } from '@/lib/query-decomposer';
import { logRoute, selectRoute } from '@/lib/router';
import { classifyQuery, type RAGResult, type RankedMatch } from '@/lib/rag-engine';
import { parseRAGSettings, type RAGSettings } from '@/lib/rag-settings';
import { getSupabase } from '@/lib/supabase';
import { createServerSupabaseClient } from '@/lib/auth-server';
import { checkCache, storeCache } from '@/lib/cache';
import { embedText } from '@/lib/embeddings';
import { getLLM, SYSTEM_PROMPT } from '@/lib/llm';
import { isLikelyFollowUp, type ConversationMessage } from '@/lib/conversation-retrieval';
import { applyFeedbackBoost } from '@/lib/feedback-reranker';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limiter';
import { buildCasualResponse, buildIntentStylePrompt, classifyIntent } from '@/lib/intentClassifier';
import { extractKeywordsAndEntities, processQuery } from '@/lib/queryProcessor';
import { formatResponse } from '@/lib/responseFormatter';
import { buildRetrievalPlan } from '@/lib/retrievalOptimizer';
import { generateQueryExpansions } from '@/lib/queryExpansion';
import { generateHydeEmbedding, shouldGenerateHyde } from '@/lib/hydeGenerator';
import { createEmbeddingStore, runMultiVectorSearch } from '@/lib/vectorSearch';
import { retrieveRaptorContexts } from '@/lib/raptorRetrieval';
import { rankAndDeduplicateContext } from '@/lib/contextRanker';
import { answerModeFromConfidence, deriveAdaptiveTopK, isFastPathCandidate, scoreConfidence, shouldUseVerificationPass } from '@/lib/confidence';
import { hasInjectionSignals, sanitizeInput } from '@/lib/sanitize';
import { createStageTimer, recordMetric, type PipelineMetric } from '@/lib/pipelineMetrics';
import { checkSemanticCache, storeSemanticCache } from '@/lib/semanticCache';
import { mergeHybridMatches, searchKeywordMatches } from '@/lib/hybridSearch';
import { buildContextWindow, rerankMatches } from '@/lib/reranker';
import { recordChatLog, recordFailure, type CacheSource } from '@/lib/logger';

dns.setDefaultResultOrder('ipv4first');

const MAX_HISTORY_TURNS = 4;
const UNKNOWN_THRESHOLD = 0.35;

const NOT_FOUND_MESSAGES: Record<string, string> = {
    en: "I don't have specific information about this in my knowledge base. Please consult the HMS panel manual or contact technical support.",
    bn: "আমার কাছে এই বিষয়ে নির্দিষ্ট তথ্য নেই। অনুগ্রহ করে HMS প্যানেলের ম্যানুয়াল দেখুন বা টেকনিক্যাল সাপোর্টে যোগাযোগ করুন।",
    hi: "मेरे पास इस विषय में विशिष्ट जानकारी नहीं है। कृपया HMS पैनल मैनुअल देखें या तकनीकी सहायता से संपर्क करें।",
};

function isEnglish(text: string): boolean {
    const asciiLetters = (text.match(/[a-zA-Z]/g) || []).length;
    const allLetters = (text.match(/\p{L}/gu) || []).length || 1;
    return (asciiLetters / allLetters) > 0.6;
}

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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
    conversationHistory: string
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

function textStreamResponse(text: string): Response {
    const enc = new TextEncoder();
    return new Response(
        new ReadableStream({
            start(controller) {
                controller.enqueue(enc.encode(`0:${JSON.stringify(text)}\n`));
                controller.close();
            },
        }),
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
}

function buildChatResponse(
    text: string,
    activeConversationId: string | null,
    requestId: string,
    rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>,
    extraHeaders: Record<string, string> = {},
): Response {
    const response = textStreamResponse(text);

    if (activeConversationId) {
        response.headers.set('x-conversation-id', activeConversationId);
    }

    if (requestId) {
        response.headers.set('x-request-id', requestId);
    }

    const rlHeaders = rateLimitHeaders(rateLimitResult);
    for (const [key, value] of Object.entries(rlHeaders)) {
        response.headers.set(key, value);
    }

    for (const [key, value] of Object.entries(extraHeaders)) {
        response.headers.set(key, value);
    }

    return response;
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
    requested: boolean | undefined
): boolean {
    if (typeof requested === 'boolean') {
        return requested;
    }

    return logicalRouteType === 'hybrid'
        || analysis.type === 'comparative'
        || analysis.complexity === 'complex';
}

type StoredConversationMessage = {
    role: 'user' | 'assistant';
    content: string;
};

type RecoverableChatSession = {
    user_question: string | null;
    bot_answer: string | null;
    created_at: string;
};

type RecoverableConversationMessage = StoredConversationMessage & {
    createdAt: string;
};

function buildRecoveredConversationMessages(sessions: RecoverableChatSession[]): RecoverableConversationMessage[] {
    const recovered: RecoverableConversationMessage[] = [];

    for (const session of sessions) {
        if (session.user_question?.trim()) {
            recovered.push({
                role: 'user',
                content: session.user_question,
                createdAt: session.created_at,
            });
        }

        if (session.bot_answer?.trim()) {
            recovered.push({
                role: 'assistant',
                content: session.bot_answer,
                createdAt: session.created_at,
            });
        }
    }

    return recovered;
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
    startedAt: number
): RAGResult {
    const merged = mergeSubQueryResults(
        subResults.map(({ subQuery, ragResult }) => ({
            subQuery,
            matches: ragResult.matches,
            answerMode: ragResult.answerMode,
            confidence: ragResult.confidence,
        })),
        subResults.map(({ subQuery }) => subQuery.query).join(' ')
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
        }
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

async function persistAssistantMessage(params: {
    enabled: boolean;
    conversationId: string | null;
    content: string;
    answerMode: string;
    topSimilarity?: number;
}): Promise<void> {
    const { enabled, conversationId, content, answerMode, topSimilarity } = params;

    if (!enabled || !conversationId) {
        return;
    }

    try {
        const authSupabase = await createServerSupabaseClient();
        const { error } = await authSupabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content,
            answer_mode: answerMode,
            top_similarity: topSimilarity,
        });

        if (error) {
            console.warn('Assistant message persistence failed:', error.message);
        }
    } catch (err) {
        console.error('[assistant message persistence error]', err);
    }
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
        baseConfidence: rankedContext.matches[0]?.finalScore ?? 0,
    });
    const contextString = buildContextWindow(rankedContext.matches, 3600);
    const totalCandidates = preliminaryCandidates.length + hydeVectorResult.matches.length;

    return {
        ragResult: {
            matches: rankedContext.matches,
            queryAnalysis: analysis,
            answerMode: answerModeFromConfidence(confidenceResult.score),
            confidence: confidenceResult.score,
            contextString,
            retrievalStats: {
                queryVectorHits: baseVectorResult.stats.queryVectorHits,
                hydeVectorHits: hydeVectorResult.stats.hydeVectorHits,
                expandedVectorHits: expandedVectorResult.stats.expandedVectorHits,
                totalCandidates,
                afterRerank: rankedContext.matches.length,
                latencyMs: 0,
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
                retrievalMethod: `pipeline:exp=${expansionResult.variations.length}:hyde=${hydeResult.embedding ? 1 : 0}:raptor=${raptorMatches.length}:keyword=${keywordMatches.length}:filtered=${rankedContext.filteredCount}:deduped=${rankedContext.duplicateCount}:topk=${effectiveTopK}`,
            },
        },
        fallbackMessage: confidenceResult.fallbackMessage,
        diagnostics: {
            hydeUsed: Boolean(hydeResult.embedding),
            hydeAttempted: hydeResult.attempted,
            queryExpansionUsed: expansionResult.variations.length > 0,
            keywordMatches: keywordMatches.length,
            degradationApplied: retrieveOptions.useHYDE && !hydeEnabled,
            effectiveTopK,
        },
    };
}

export async function POST(req: Request) {
    const requestStart = performance.now();
    const stageTimer = createStageTimer();
    const requestEmbeddingCache = createEmbeddingStore();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const metricsSnapshot: Partial<PipelineMetric> = {
        requestId,
        cacheHit: false,
        cacheTier: null,
        answerMode: 'unknown',
        confidence: 0,
        matchCount: 0,
        hydeUsed: false,
        queryExpansionUsed: false,
        error: null,
    };
    let cacheSource: CacheSource = 'none';
    let llmCallCount = 0;
    let originalQueryForLog = '';
    let rewrittenQueryForLog = '';
    let intentForLog = 'unknown';

    // ── Rate Limiting ─────────────────────────────────────────────
    try {
        const body = await req.json();

        if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Invalid messages format' }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-request-id': requestId,
                    },
                }
            );
        }

        const messages = body.messages;
        const userId = body.userId ?? null;
        const validLanguages = ['en', 'bn', 'hi'];
        const language = validLanguages.includes(body.language) ? body.language : 'en';
        const searchMode = body.searchMode ?? 'default';
        const reqConversationId = body.conversationId ?? null;
        const latestMessageRecord = messages[messages.length - 1];
        const latestMessage = typeof latestMessageRecord?.content === 'string'
            ? latestMessageRecord.content.trim()
            : '';

        if (!latestMessage) {
            return new Response(
                JSON.stringify({ error: 'Invalid messages format' }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-request-id': requestId,
                    },
                }
            );
        }

        const clientIp = getClientIdentifier(req);
        const languageNames = { en: 'English', bn: 'Bengali', hi: 'Hindi' } as const;
        const langName = languageNames[language as keyof typeof languageNames] || 'English';

        // Always read RAG settings from database (single source of truth)
        stageTimer.mark('auth');
        let parsedRagSettings: RAGSettings | null = null;
        try {
            const { data } = await getSupabase()
                .from('rag_settings')
                .select('*')
                .eq('id', 1)
                .single();
            if (data) {
                parsedRagSettings = parseRAGSettings({
                    useHybridSearch: data.use_hybrid_search,
                    useReranker: data.use_reranker,
                    useQueryExpansion: data.use_query_expansion,
                    useGraphBoost: data.use_graph_boost,
                    topK: data.top_k,
                    alpha: data.alpha,
                    mmrLambda: data.mmr_lambda,
                });
            }
        } catch (err) {
            console.error('[rag settings load error]', err);
        }

        // ── Resolve authenticated user + conversation (if logged in) ──────
        let authUserId: string | null = null;
        let activeConversationId: string | null = reqConversationId || null;
        let dbHistory: StoredConversationMessage[] = [];

        try {
            const authSupabase = await createServerSupabaseClient();
            const { data: { user } } = await authSupabase.auth.getUser();
            if (user) {
                authUserId = user.id;

                // Create or verify conversation
                if (!activeConversationId) {
                    const { data: conv } = await authSupabase
                        .from('conversations')
                        .insert({ user_id: user.id, title: '' })
                        .select('id')
                        .single();
                    if (conv) activeConversationId = conv.id;
                }

                // Load last 15 messages from DB for history context
                if (activeConversationId) {
                    const { data: historyRows } = await authSupabase
                        .from('messages')
                        .select('role, content')
                        .eq('conversation_id', activeConversationId)
                        .order('created_at', { ascending: false })
                        .limit(15);

                    if (historyRows?.length) {
                        dbHistory = historyRows.reverse() as StoredConversationMessage[];
                    } else {
                        const { data: sessionRows, error: sessionHistoryError } = await authSupabase
                            .from('chat_sessions')
                            .select('user_question, bot_answer, created_at')
                            .eq('conversation_id', activeConversationId)
                            .order('created_at', { ascending: true });

                        if (sessionHistoryError) {
                            console.warn('Chat session recovery skipped:', sessionHistoryError.message);
                        } else if (sessionRows?.length) {
                            const recoveredHistory = buildRecoveredConversationMessages(sessionRows as RecoverableChatSession[]);
                            dbHistory = recoveredHistory.map(({ role, content }) => ({ role, content }));

                            if (recoveredHistory.length > 0) {
                                const { count } = await authSupabase
                                    .from('messages')
                                    .select('id', { count: 'exact', head: true })
                                    .eq('conversation_id', activeConversationId);

                                if (count === 0 || count === null) {
                                    const rowsToInsert = recoveredHistory.map((message, index) => ({
                                        conversation_id: activeConversationId,
                                        role: message.role,
                                        content: message.content,
                                        created_at: new Date(new Date(message.createdAt).getTime() + index).toISOString(),
                                    }));

                                    const { error: recoveryInsertError } = await authSupabase
                                        .from('messages')
                                        .insert(rowsToInsert);

                                    if (recoveryInsertError) {
                                        console.warn('Recovered history persistence failed:', recoveryInsertError.message);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            stageTimer.end('auth');
        } catch (authErr) {
            // Auth is optional — continue without persistence
            console.warn('Auth/conversation resolution skipped:', (authErr as Error).message);
        }

        // ── Rate Limiting (Tier-Aware) ────────────────────────────────
        const limitTier = authUserId ? RATE_LIMITS.authenticated : RATE_LIMITS.guest;
        const rateLimitResult = await checkRateLimit(clientIp, limitTier);

        if (!rateLimitResult.allowed) {
            return new Response(
                JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-request-id': requestId,
                        ...rateLimitHeaders(rateLimitResult),
                    },
                }
            );
        }

        // ── Save user message (Post-Rate-Limit) ───────────────────────
        if (authUserId && activeConversationId) {
            try {
                const authSupabase = await createServerSupabaseClient();
                const { error: saveUserMessageError } = await authSupabase.from('messages').insert({
                    conversation_id: activeConversationId,
                    role: 'user',
                    content: latestMessage,
                });
                if (saveUserMessageError) {
                    console.warn('User message persistence failed:', saveUserMessageError.message);
                }
            } catch (err) {
                console.error('[user message persistence error]', err);
            }
        }

        // Build conversation history from DB (preferred) or client messages
        const historySource = dbHistory.length > 0
            ? dbHistory
            : messages.slice(0, -1).slice(-(MAX_HISTORY_TURNS * 2));
        const conversationHistory = historySource
            .map((message: { role: string; content: string }) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
            .join('\n');

        console.log(`\n${'='.repeat(60)}`);
        console.log(`User [${language}]: "${latestMessage}"`);

        // Central LLM instances
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
            conversationHistory
        );
        stageTimer.end('translation');

        if (language !== 'en' && !isEnglish(latestMessage)) {
            console.log(`Translation [${language}->EN]: "${englishQuestion}"`);
        }

        // ── Conversation-Aware Retrieval ──────────────────────────────
        const contextMessages: ConversationMessage[] = historySource
            .map((m: { role: string; content: string }) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));

        originalQueryForLog = englishQuestion;
        const shouldUseRewriteModel = contextMessages.length > 0 && isLikelyFollowUp(englishQuestion);
        if (shouldUseRewriteModel) {
            llmCallCount += 1;
        }
        const processedQuery = await processQuery({
            originalQuery: englishQuestion,
            history: contextMessages,
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
            const casualAnswer = buildCasualResponse(latestMessage, language);

            await persistAssistantMessage({
                enabled: Boolean(authUserId),
                conversationId: activeConversationId,
                content: casualAnswer,
                answerMode: 'casual',
            });

            recordChatLog({
                requestId,
                query: originalQueryForLog || latestMessage,
                rewrittenQuery: rewrittenQueryForLog || latestMessage,
                intent: intentForLog,
                retrievedChunks: [],
                finalChunks: [],
                confidence: 1,
                responseTimeMs: performance.now() - requestStart,
                success: true,
                fallbackTriggered: false,
                cacheSource,
                hydeUsed: false,
                queryExpansionUsed: false,
                llmCalls: llmCallCount,
                error: null,
            });

            return buildChatResponse(casualAnswer, activeConversationId, requestId, rateLimitResult);
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

                await persistAssistantMessage({
                    enabled: Boolean(authUserId),
                    conversationId: activeConversationId,
                    content: cachedAnswer,
                    answerMode: 'cache',
                });

                void recordMetric({
                    ...metricsSnapshot,
                    totalLatencyMs: performance.now() - requestStart,
                    stages: stageTimer.getTimings(),
                    cacheHit: true,
                    cacheTier: 1,
                    answerMode: 'cache',
                    confidence: 0.88,
                    createdAt: new Date().toISOString(),
                } as PipelineMetric);

                recordChatLog({
                    requestId,
                    query: originalQueryForLog || latestMessage,
                    rewrittenQuery: retrievalQuestion,
                    intent: intentForLog,
                    retrievedChunks: [],
                    finalChunks: [],
                    confidence: 0.88,
                    responseTimeMs: performance.now() - requestStart,
                    success: true,
                    fallbackTriggered: false,
                    cacheSource,
                    hydeUsed: false,
                    queryExpansionUsed: false,
                    llmCalls: llmCallCount,
                    error: null,
                });

                return buildChatResponse(cachedAnswer, activeConversationId, requestId, rateLimitResult, {
                    'x-cache': 'HIT:tier1',
                    'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
                });
            }
        }

        const notFoundMsg = NOT_FOUND_MESSAGES[language] || NOT_FOUND_MESSAGES.en;
        const { decision, relationalResult } = await logicalRoute(retrievalQuestion);
        if (decision.route === 'relational' && relationalResult) {
            const relationalAnswer = formatRelationalAnswer(relationalResult, langName);
            recordChatLog({
                requestId,
                query: originalQueryForLog || latestMessage,
                rewrittenQuery: retrievalQuestion,
                intent: intentForLog,
                retrievedChunks: [],
                finalChunks: [],
                confidence: 0.9,
                responseTimeMs: performance.now() - requestStart,
                success: true,
                fallbackTriggered: false,
                cacheSource,
                hydeUsed: false,
                queryExpansionUsed: false,
                llmCalls: llmCallCount,
                error: null,
            });
            return buildChatResponse(relationalAnswer, activeConversationId, requestId, rateLimitResult);
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

                const cachedAnswer = formatResponse(semanticFastPath.answer, {
                    intent: intent.intent,
                    confidence: semanticFastPath.similarity,
                });

                await persistAssistantMessage({
                    enabled: Boolean(authUserId),
                    conversationId: activeConversationId,
                    content: cachedAnswer,
                    answerMode: 'cache',
                    topSimilarity: semanticFastPath.similarity,
                });

                void recordMetric({
                    ...metricsSnapshot,
                    totalLatencyMs: performance.now() - requestStart,
                    stages: stageTimer.getTimings(),
                    cacheHit: true,
                    cacheTier: 2,
                    answerMode: 'cache',
                    confidence: semanticFastPath.similarity,
                    createdAt: new Date().toISOString(),
                } as PipelineMetric);

                recordChatLog({
                    requestId,
                    query: originalQueryForLog || latestMessage,
                    rewrittenQuery: retrievalQuestion,
                    intent: intentForLog,
                    retrievedChunks: [],
                    finalChunks: [],
                    confidence: semanticFastPath.similarity,
                    responseTimeMs: performance.now() - requestStart,
                    success: true,
                    fallbackTriggered: false,
                    cacheSource,
                    hydeUsed: false,
                    queryExpansionUsed: false,
                    llmCalls: llmCallCount,
                    error: null,
                });

                return buildChatResponse(
                    cachedAnswer,
                    activeConversationId,
                    requestId,
                    rateLimitResult,
                    {
                        'x-cache': `HIT:semantic:${semanticFastPath.similarity.toFixed(3)}`,
                        'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
                    },
                );
            }
        }

        if (!isDiagram) {
            const tier2CacheResult = await checkCache(retrievalQuestion, cachedQueryEmbedding, language);
            if (tier2CacheResult.hit) {
                stageTimer.end('cacheCheck');
                cacheSource = 'semantic_db';
                console.log(`[chat] Cache Tier 2 hit (sim=${tier2CacheResult.similarity?.toFixed(3)}) - skipping full RAG pipeline`);

                const cachedAnswer = formatResponse(tier2CacheResult.answer, {
                    intent: intent.intent,
                    confidence: tier2CacheResult.similarity ?? 0.82,
                });

                await persistAssistantMessage({
                    enabled: Boolean(authUserId),
                    conversationId: activeConversationId,
                    content: cachedAnswer,
                    answerMode: 'cache',
                    topSimilarity: tier2CacheResult.similarity,
                });

                void recordMetric({
                    ...metricsSnapshot,
                    totalLatencyMs: performance.now() - requestStart,
                    stages: stageTimer.getTimings(),
                    cacheHit: true,
                    cacheTier: 2,
                    answerMode: 'cache',
                    confidence: tier2CacheResult.similarity ?? 0.82,
                    createdAt: new Date().toISOString(),
                } as PipelineMetric);

                recordChatLog({
                    requestId,
                    query: originalQueryForLog || latestMessage,
                    rewrittenQuery: retrievalQuestion,
                    intent: intentForLog,
                    retrievedChunks: [],
                    finalChunks: [],
                    confidence: tier2CacheResult.similarity ?? 0.82,
                    responseTimeMs: performance.now() - requestStart,
                    success: true,
                    fallbackTriggered: false,
                    cacheSource,
                    hydeUsed: false,
                    queryExpansionUsed: false,
                    llmCalls: llmCallCount,
                    error: null,
                });

                return buildChatResponse(
                    cachedAnswer,
                    activeConversationId,
                    requestId,
                    rateLimitResult,
                    {
                        'x-cache': `HIT:tier2:${tier2CacheResult.similarity?.toFixed(3)}`,
                        'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
                    },
                );
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
            ? { isDecomposed: false as const, subQueries: [], reasoning: 'Skipped — simple query', originalQuery: retrievalQuestion }
            : await decomposeQuery(retrievalQuestion, baseAnalysis, complexLlm);
        const decomposedPrefix = buildDecomposedPromptPrefix(decomposed);
        const retrieveOptions = buildRetrievalPlan({
            analysis: baseAnalysis,
            intent,
            routeRetrieval: routedRetrievalConfig.route.retrieval,
            ragSettings: parsedRagSettings,
            searchMode,
            logicalRouteType: decision.route,
            requestedHybridSearch: shouldUseHybridRetrieval(
                baseAnalysis,
                decision.route,
                parsedRagSettings?.useHybridSearch
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
                })
            );
            lastRagResult = buildMergedRagResult(
                baseAnalysis,
                subResults.map(({ subQuery, ragResult }) => ({ subQuery, ragResult })),
                ragStart
            );
            retrievalDiagnostics = {
                hydeUsed: subResults.some((result) => result.diagnostics.hydeUsed),
                hydeAttempted: subResults.some((result) => result.diagnostics.hydeAttempted),
                queryExpansionUsed: subResults.some((result) => result.diagnostics.queryExpansionUsed),
                keywordMatches: subResults.reduce((sum, result) => sum + result.diagnostics.keywordMatches, 0),
                degradationApplied: subResults.some((result) => result.diagnostics.degradationApplied),
                effectiveTopK: Math.max(retrieveOptions.topK, ...subResults.map((result) => result.diagnostics.effectiveTopK)),
            };
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

        metricsSnapshot.hydeUsed = retrievalDiagnostics.hydeUsed;
        metricsSnapshot.queryExpansionUsed = retrievalDiagnostics.queryExpansionUsed;
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
            retrievalMetadata,
        } = lastRagResult;

        // Retrieval diagnostics — helps debug "I don't have information" responses
        console.log(`[chat] Retrieval result: matches=${matches.length}, confidence=${confidence.toFixed(3)}, answerMode=${answerMode}, contextLen=${contextString?.length ?? 0}, topScore=${matches[0]?.finalScore?.toFixed(3) ?? 'N/A'}, stats=${JSON.stringify(retrievalStats)}`);

        const topMatch = matches[0];
        if (
            topMatch &&
            topMatch.chunkType === 'diagram' &&
            confidence >= 0.55 &&
            topMatch.answer?.length > 100
        ) {
            console.log(`📐 Stored diagram found: "${topMatch.question}" (conf: ${confidence.toFixed(2)})`);

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

            const supabase = getSupabase();
            void supabase.from('chat_sessions').insert({
                user_question: latestMessage,
                english_translation: englishQuestion,
                answer_mode: 'diagram_stored',
                top_similarity: confidence,
                user_id: userId || null,
            }).then(({ error }) => { if (error) console.warn('chat_sessions insert failed:', error.message); });

            recordChatLog({
                requestId,
                query: originalQueryForLog || latestMessage,
                rewrittenQuery: retrievalQuestion,
                intent: intentForLog,
                retrievedChunks: buildChunkLabels(matches),
                finalChunks: buildChunkLabels(matches),
                confidence,
                responseTimeMs: performance.now() - requestStart,
                success: true,
                fallbackTriggered: false,
                cacheSource,
                hydeUsed: retrievalDiagnostics.hydeUsed,
                queryExpansionUsed: retrievalDiagnostics.queryExpansionUsed,
                llmCalls: llmCallCount,
                error: null,
            });

            const payload = JSON.stringify(storedDiagramPayload);
            return textStreamResponse(`DIAGRAM_RESPONSE:${payload}`);
        }

        if (isDiagram) {
            console.log(`Diagram request: ${diagramType}`);
            try {
                const diagramData = await generateDiagramInternal(
                    latestMessage,
                    englishQuestion,
                    diagramType,
                    language,
                    {
                        ragContext: contextString,
                        ragMatches: matches.map((match) => ({
                            question: match.question,
                            answer: match.answer,
                            category: match.category,
                            finalScore: match.finalScore,
                        })),
                        detailLevel: confidence > 0.5 ? 'context-rich' : 'basic',
                    }
                );

                if (diagramData.success && diagramData.markdown) {
                    const supabase = getSupabase();
                    void supabase.from('chat_sessions').insert({
                        user_question: latestMessage,
                        english_translation: englishQuestion,
                        answer_mode: 'diagram',
                        top_similarity: diagramData.hasKBContext ? confidence : 0.3,
                        user_id: userId || null,
                    }).then(({ error }) => { if (error) console.warn('chat_sessions insert failed:', error.message); });

                    recordChatLog({
                        requestId,
                        query: originalQueryForLog || latestMessage,
                        rewrittenQuery: retrievalQuestion,
                        intent: intentForLog,
                        retrievedChunks: buildChunkLabels(matches),
                        finalChunks: buildChunkLabels(matches),
                        confidence: diagramData.hasKBContext ? confidence : 0.3,
                        responseTimeMs: performance.now() - requestStart,
                        success: true,
                        fallbackTriggered: !diagramData.hasKBContext,
                        cacheSource,
                        hydeUsed: retrievalDiagnostics.hydeUsed,
                        queryExpansionUsed: retrievalDiagnostics.queryExpansionUsed,
                        llmCalls: llmCallCount,
                        error: null,
                    });

                    const payload = JSON.stringify({ __type: 'diagram', ...diagramData });
                    return textStreamResponse(`DIAGRAM_RESPONSE:${payload}`);
                }
            } catch (err: unknown) {
                console.warn(`Diagram generation failed: ${(err as Error).message}`);
                const fallbackPayload = JSON.stringify({
                    __type: 'diagram',
                    markdown: `## Diagram Generation Error\n\nUnable to generate ${diagramType} diagram at this time.\n\nPlease try again or contact technical support if the issue persists.`,
                    title: `${diagramType} diagram — Error`,
                    diagramType,
                    panelType: 'HMS Panel',
                    hasKBContext: false,
                    generatedBy: 'fallback',
                    success: false,
                });
                recordFailure({
                    requestId,
                    query: retrievalQuestion,
                    reason: 'diagram_generation_failed',
                    confidence,
                });
                return textStreamResponse(`DIAGRAM_RESPONSE:${fallbackPayload}`);
            }
        }

        const supabase = getSupabase();
        if (confidence < UNKNOWN_THRESHOLD) {
            void supabase.rpc('upsert_unknown_question', {
                p_user_question: latestMessage,
                p_english_text: englishQuestion,
                p_top_similarity: matches[0]?.finalScore || 0,
            }).then(({ error }) => {
                if (error) {
                    console.warn(`Unknown log skipped: ${error.message}`);
                }
            });
        }

        if (answerMode === 'general' && (!contextString || contextString.trim().length < 30) && matches.length === 0) {
            console.log(`[chat] Hallucination gate triggered - answerMode=general, contextLength=${contextString?.length ?? 0}, matches=${matches.length}`);

            await persistAssistantMessage({
                enabled: Boolean(authUserId),
                conversationId: activeConversationId,
                content: notFoundMsg,
                answerMode: 'not_found',
                topSimilarity: confidence,
            });

            void supabase.from('chat_sessions').insert({
                user_question: latestMessage,
                english_translation: englishQuestion,
                answer_mode: 'not_found',
                top_similarity: confidence,
                user_id: authUserId || userId || null,
                conversation_id: activeConversationId || null,
            }).then(({ error }) => {
                if (error) {
                    console.warn('chat_sessions insert failed:', error.message);
                }
            });

            recordChatLog({
                requestId,
                query: originalQueryForLog || latestMessage,
                rewrittenQuery: retrievalQuestion,
                intent: intentForLog,
                retrievedChunks: [],
                finalChunks: [],
                confidence,
                responseTimeMs: performance.now() - requestStart,
                success: true,
                fallbackTriggered: true,
                cacheSource,
                hydeUsed: retrievalDiagnostics.hydeUsed,
                queryExpansionUsed: retrievalDiagnostics.queryExpansionUsed,
                llmCalls: llmCallCount,
                error: null,
            });

            return buildChatResponse(notFoundMsg, activeConversationId, requestId, rateLimitResult);
        }

        const routedPrompt = selectRoute(baseAnalysis, langName, notFoundMsg, lastRagResult.answerMode);

        const buildFinalSystemPrompt = (
            routedSystem: string,
            context: string,
            history: string,
            decomposedPrefix: string,
            finalAnswerStyle: string,
            fallbackNote?: string,
        ): string => {
            const sections = [
                `OUTPUT LANGUAGE: ${langName}`,
                `CRITICAL: You must write your entire response in ${langName}. Do not use English if the user asked in ${langName}.`,
                SYSTEM_PROMPT.trim(), 
                routedSystem.trim()
            ];

            if (history.trim()) {
                sections.push(`RECENT CONVERSATION MEMORY:\n${history.trim()}`);
            }

            if (decomposedPrefix.trim()) {
                sections.push(decomposedPrefix.trim());
            }

            if (context.trim()) {
                sections.push(`${routedPrompt.contextPrefix}\n${context.trim()}`);
            }

            if (finalAnswerStyle.trim()) {
                sections.push(finalAnswerStyle.trim());
            }

            if (fallbackNote) {
                sections.push(`CONFIDENCE NOTE:\n- Retrieval confidence is limited but some relevant context was found.\n- Synthesize the best possible answer from available context.\n- Briefly note if the answer may be incomplete.`);
            }

            return sections.join('\n\n');
        };

        const historySection = sanitizeInput(processedQuery.memory.promptContext.trim());

        const systemPrompt = buildFinalSystemPrompt(
            routedPrompt.system,
            contextString,
            historySection,
            decomposedPrefix,
            buildIntentStylePrompt(intent),
            fallbackMessage,
        );

        stageTimer.mark('llmGeneration');
        llmCallCount += 1;
        
        // Use streaming for better UX; pass route-specific token limits
        const chatLlm = getLLM(isSimple ? 'simple' : 'complex', {
            streaming: true,
            maxTokens: routedPrompt.route.maxTokens,
            temperature: routedPrompt.route.temperature,
        });
        
        const response = await raceWithTimeout(
            chatLlm.invoke([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Respond ENTIRELY in ${langName} using only the provided context.\n\nUser Query: ${latestMessage}` },
            ]),
            25_000
        );

        let cleanedAnswer = (typeof response.content === 'string' ? response.content : JSON.stringify(response.content)).trim();

        if (shouldUseVerificationPass({
            complexity: baseAnalysis.complexity,
            confidence,
            matchCount: matches.length,
        })) {
            llmCallCount += 1;
            try {
                const verificationPrompt = `Revise the draft answer so every claim stays grounded in the provided context. 

CRITICAL: The answer must be written ENTIRELY in ${langName}. If it is not in ${langName}, translate it now.

Context:
${contextString}

Draft answer:
${cleanedAnswer}

Return only the improved answer in ${langName}.`;
                const verificationResponse = await raceWithTimeout(
                    simpleLlm.invoke([
                        {
                            role: 'system',
                            content: 'You revise support answers for clarity and accuracy. Remove unsupported claims and keep the structure concise.',
                        },
                        { role: 'user', content: verificationPrompt },
                    ]),
                    12_000
                );

                cleanedAnswer = (typeof verificationResponse.content === 'string' ? verificationResponse.content : JSON.stringify(verificationResponse.content)).trim();
            } catch (verifyErr) {
                console.warn('[verification pass] failed, using original answer:', (verifyErr as Error).message);
            }
        }
        stageTimer.end('llmGeneration');

        const answer = formatResponse(cleanedAnswer, {
            intent: intent.intent,
            confidence,
            fallbackMessage,
            matches,
        });

        void evaluateAndStore({
            question: retrievalQuestion,
            answer,
            ragResult: lastRagResult,
            llm: simpleLlm,
            latencyMs: performance.now() - requestStart,
            userId: userId ?? undefined,
        }).catch((err) => {
            console.error('[evaluation error]', err);
        });

        const dbAnswerMode = answerMode.startsWith('rag') ? 'rag' : answerMode;
        void supabase.from('chat_sessions').insert({
            user_question: latestMessage,
            english_translation: englishQuestion,
            answer_mode: dbAnswerMode,
            top_similarity: matches[0]?.finalScore || confidence,
            bot_answer: answer,
            user_id: authUserId || userId || null,
            conversation_id: activeConversationId || null,
        }).then(({ error }) => { if (error) console.warn('chat_sessions insert failed:', error.message); });

        void storeCache({
            query: retrievalQuestion,
            queryVector: cachedQueryEmbedding,
            answer,
            answerMode,
            language,
            confidence,
        });
        storeSemanticCache({
            query: retrievalQuestion,
            queryEmbedding: cachedQueryEmbedding,
            answer,
            answerMode,
            language,
            confidence,
        });

        await persistAssistantMessage({
            enabled: Boolean(authUserId),
            conversationId: activeConversationId,
            content: answer,
            answerMode: dbAnswerMode,
            topSimilarity: matches[0]?.finalScore || confidence,
        });

        if (confidence < 0.5 || fallbackMessage) {
            recordFailure({
                requestId,
                query: retrievalQuestion,
                reason: fallbackMessage ? 'fallback_triggered' : 'low_confidence',
                confidence,
            });
        }

        recordChatLog({
            requestId,
            query: originalQueryForLog || latestMessage,
            rewrittenQuery: retrievalQuestion,
            intent: intentForLog,
            retrievedChunks: buildChunkLabels(lastRagResult.matches),
            finalChunks: buildChunkLabels(matches),
            confidence,
            responseTimeMs: performance.now() - requestStart,
            success: true,
            fallbackTriggered: Boolean(fallbackMessage),
            cacheSource,
            hydeUsed: retrievalDiagnostics.hydeUsed,
            queryExpansionUsed: retrievalDiagnostics.queryExpansionUsed,
            llmCalls: llmCallCount,
            error: null,
        });

        void recordMetric({
            ...metricsSnapshot,
            totalLatencyMs: performance.now() - requestStart,
            stages: stageTimer.getTimings(),
            answerMode: dbAnswerMode,
            confidence,
            matchCount: matches.length,
            createdAt: new Date().toISOString(),
        } as PipelineMetric);

        return buildChatResponse(answer, activeConversationId, requestId, rateLimitResult, {
            'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
        });
    } catch (error: unknown) {
        console.error('Chat API Error:', error);
        const errorMessage = (error as Error).message || 'Unknown error';

        void recordMetric({
            ...metricsSnapshot,
            totalLatencyMs: performance.now() - requestStart,
            stages: stageTimer.getTimings(),
            error: errorMessage,
            createdAt: new Date().toISOString(),
        } as PipelineMetric);

        recordFailure({
            requestId,
            query: rewrittenQueryForLog || originalQueryForLog || 'unknown',
            reason: errorMessage,
            confidence: null,
        });
        
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.' }),
            {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'x-request-id': requestId,
                },
            }
        );
    }
}
