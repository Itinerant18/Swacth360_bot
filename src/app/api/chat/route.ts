/**
 * src/app/api/chat/route.ts
 *
 * Main chat pipeline for SAI HMS support.
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
import { stripThinkTags, stripRawChainOfThought } from '@/lib/sarvam';
import { type ConversationMessage } from '@/lib/conversation-retrieval';
import { applyFeedbackBoost } from '@/lib/feedback-reranker';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limiter';
import { buildCasualResponse, buildIntentStylePrompt, classifyIntent } from '@/lib/intentClassifier';
import { extractKeywordsAndEntities, processQuery } from '@/lib/queryProcessor';
import { formatResponse } from '@/lib/responseFormatter';
import { buildRetrievalPlan } from '@/lib/retrievalOptimizer';
import { generateQueryExpansions } from '@/lib/queryExpansion';
import { generateHydeEmbedding } from '@/lib/hydeGenerator';
import { runMultiVectorSearch } from '@/lib/vectorSearch';
import { retrieveRaptorContexts } from '@/lib/raptorRetrieval';
import { rankAndDeduplicateContext } from '@/lib/contextRanker';
import { answerModeFromConfidence, scoreConfidence } from '@/lib/confidence';
import { sanitizeInput } from '@/lib/sanitize';

dns.setDefaultResultOrder('ipv4first');

const MAX_HISTORY_TURNS = 4;
const UNKNOWN_THRESHOLD = 0.45;

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

async function translateToEnglish(
    text: string,
    language: string,
    sarvamLlm: ChatOpenAI,
    conversationHistory: string
): Promise<string> {
    if (language === 'en' || isEnglish(text)) {
        return text.trim();
    }

    const sourceLang = language === 'hi' ? 'Hindi' : 'Bengali';
    const historyCtx = conversationHistory ? `Context:\n${conversationHistory}\n\n` : '';
    const prompt = `Translate the ${sourceLang} question to English. Resolve pronouns using context. Output ONLY the English translation.\n${historyCtx}${sourceLang}: ${text}\nEnglish:`;
    
    const result = await Promise.race([
        sarvamLlm.invoke(prompt),
        new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('LLM_TIMEOUT')), 15000)
        )
    ]);

    return stripThinkTags(String(result.content)).trim();
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
    rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>,
    extraHeaders: Record<string, string> = {},
): Response {
    const response = textStreamResponse(text);

    if (activeConversationId) {
        response.headers.set('x-conversation-id', activeConversationId);
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
}): Promise<{
    ragResult: RAGResult;
    fallbackMessage?: string;
}> {
    const {
        query,
        analysis,
        llm,
        retrieveOptions,
        queryEmbedding,
        keywords = [],
        entities = [],
    } = params;

    const fallbackKeywords = keywords.length > 0
        ? keywords
        : query.toLowerCase().split(/\W+/).filter((token) => token.length > 2).slice(0, 5);
    const resolvedQueryEmbedding = queryEmbedding ?? await embedText(query);

    const [expansionResult, hydeResult] = await Promise.all([
        generateQueryExpansions({
            query,
            keywords: fallbackKeywords,
            entities,
            llm: retrieveOptions.useQueryExpansion ? llm : undefined,
            maxVariations: 5,
        }),
        retrieveOptions.useHYDE
            ? generateHydeEmbedding({
                query,
                queryType: analysis.type,
                llm,
            })
            : Promise.resolve({ text: null, embedding: null, timedOut: false }),
    ]);

    const [vectorResult, raptorMatches] = await Promise.all([
        runMultiVectorSearch({
            query,
            queryEmbedding: resolvedQueryEmbedding,
            expandedQueries: expansionResult.variations,
            hydeEmbedding: hydeResult.embedding,
            similarityThreshold: retrieveOptions.similarityThreshold,
            useMMR: retrieveOptions.useMMR,
            useWeighted: retrieveOptions.useWeighted,
            mmrLambda: retrieveOptions.mmrLambda,
            recencyBoost: retrieveOptions.recencyBoost,
            preferredChunkType: retrieveOptions.preferredChunkType,
        }),
        retrieveRaptorContexts({
            queryEmbedding: resolvedQueryEmbedding,
            analysis,
            topK: Math.max(retrieveOptions.topK, 4),
            threshold: retrieveOptions.similarityThreshold,
        }),
    ]);

    const combinedMatches = [...vectorResult.matches, ...raptorMatches];
    if (combinedMatches.length > 0) {
        await applyFeedbackBoost(combinedMatches);
    }

    const rankedContext = rankAndDeduplicateContext({
        query,
        matches: combinedMatches,
        maxContexts: retrieveOptions.topK,
        preferredChunkType: retrieveOptions.preferredChunkType,
    });
    const confidenceResult = scoreConfidence({
        query,
        matches: rankedContext.matches,
        baseConfidence: rankedContext.matches[0]?.finalScore ?? 0,
    });

    return {
        ragResult: {
            matches: rankedContext.matches,
            queryAnalysis: analysis,
            answerMode: answerModeFromConfidence(confidenceResult.score),
            confidence: confidenceResult.score,
            contextString: rankedContext.contextString,
            retrievalStats: {
                queryVectorHits: vectorResult.stats.queryVectorHits,
                hydeVectorHits: vectorResult.stats.hydeVectorHits,
                expandedVectorHits: vectorResult.stats.expandedVectorHits,
                totalCandidates: combinedMatches.length,
                afterRerank: rankedContext.matches.length,
                latencyMs: 0,
            },
            retrievalMetadata: {
                sourcesUsed: [...new Set(rankedContext.matches.map((match) => match.source_name || match.source))],
                totalMatches: rankedContext.matches.length,
                vectorSources: {
                    query: vectorResult.stats.queryVectorHits,
                    hyde: vectorResult.stats.hydeVectorHits,
                    expanded: vectorResult.stats.expandedVectorHits,
                },
                topConfidence: confidenceResult.score,
                retrievalMethod: `pipeline:exp=${expansionResult.variations.length}:hyde=${hydeResult.embedding ? 1 : 0}:raptor=${raptorMatches.length}:filtered=${rankedContext.filteredCount}:deduped=${rankedContext.duplicateCount}`,
            },
        },
        fallbackMessage: confidenceResult.fallbackMessage,
    };
}

export async function POST(req: Request) {
    const requestStart = performance.now();

    // ── Rate Limiting ─────────────────────────────────────────────
    try {
        const body = await req.json();

        if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Invalid messages format' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
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
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const clientIp = getClientIdentifier(req);
        const languageNames = { en: 'English', bn: 'Bengali', hi: 'Hindi' } as const;
        const langName = languageNames[language as keyof typeof languageNames] || 'English';

        // Always read RAG settings from database (single source of truth)
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

        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: process.env.SARVAM_API_KEY,
            configuration: { baseURL: 'https://api.sarvam.ai/v1' },
            temperature: 0.05,
            maxTokens: 768,
        });

        const englishQuestion = await translateToEnglish(
            latestMessage,
            language,
            sarvamLlm,
            conversationHistory
        );

        if (language !== 'en' && !isEnglish(latestMessage)) {
            console.log(`Translation [${language}->EN]: "${englishQuestion}"`);
        }

        // ── Conversation-Aware Retrieval ──────────────────────────────
        // Rewrite follow-up queries using conversation history so that
        // pronouns like "it", "that", "this" resolve correctly.
        const contextMessages: ConversationMessage[] = historySource
            .map((m: { role: string; content: string }) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));

        const processedQuery = await processQuery({
            originalQuery: englishQuestion,
            history: contextMessages,
            llm: sarvamLlm,
        });
        const retrievalQuestion = processedQuery.retrievalQuery;
        const baseAnalysis = classifyQuery(retrievalQuestion);
        const intent = classifyIntent(retrievalQuestion, baseAnalysis);

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

            return buildChatResponse(casualAnswer, activeConversationId, rateLimitResult);
        }

        // ── Diagram detection — MUST run BEFORE cache checks ──────────
        // If this is a diagram request, skip cache entirely and go
        // straight to diagram generation. Otherwise cached text answers
        // for keywords like "hms panel" intercept diagram queries.
        // Check BOTH original and rewritten questions — context rewriting
        // can strip diagram keywords like "show me", "diagram", "wiring".
        const origDiagram = isDiagramRequest(englishQuestion);
        const rewrittenDiagram = isDiagramRequest(retrievalQuestion);
        const isDiagram = origDiagram.isDiagram || rewrittenDiagram.isDiagram;
        const diagramType = origDiagram.isDiagram ? origDiagram.diagramType : rewrittenDiagram.diagramType;

        // Tier 1 Cache Check (exact match, no embedding needed)
        // Skip cache for diagram requests
        if (!isDiagram) {
            const tier1CacheResult = await checkCache(retrievalQuestion, null);
            if (tier1CacheResult.hit) {
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

                return buildChatResponse(cachedAnswer, activeConversationId, rateLimitResult, { 'x-cache': 'HIT:tier1' });
            }
        }

        const notFoundMsg = NOT_FOUND_MESSAGES[language] || NOT_FOUND_MESSAGES.en;
        const { decision, relationalResult } = await logicalRoute(retrievalQuestion);
        if (decision.route === 'relational' && relationalResult) {
            const relationalAnswer = formatRelationalAnswer(relationalResult, langName);
            return buildChatResponse(relationalAnswer, activeConversationId, rateLimitResult);
        }

        // Embed query (reused for Tier 2 cache + RAG retrieval)
        const cachedQueryEmbedding = await embedText(retrievalQuestion);

        // Tier 2 Cache Check (semantic match) — also skip for diagram requests
        if (!isDiagram) {
            const tier2CacheResult = await checkCache(retrievalQuestion, cachedQueryEmbedding);
            if (tier2CacheResult.hit) {
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

                return buildChatResponse(
                    cachedAnswer,
                    activeConversationId,
                    rateLimitResult,
                    { 'x-cache': `HIT:tier2:${tier2CacheResult.similarity?.toFixed(3)}` },
                );
            }
        }

        const routedRetrievalConfig = selectRoute(baseAnalysis, langName, notFoundMsg);
        logRoute(baseAnalysis, routedRetrievalConfig);

        const decomposed = await decomposeQuery(retrievalQuestion, baseAnalysis, sarvamLlm);
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

        const ragStart = performance.now();
        let lastRagResult: RAGResult;
        let fallbackMessage: string | undefined;

        if (decomposed.isDecomposed) {
            // Each sub-query has a different search string — do NOT reuse the parent embedding
            const subResults = await Promise.all(
                decomposed.subQueries.map(async (subQuery) => {
                    const extracted = extractKeywordsAndEntities(subQuery.query);
                    const stageResult = await runRetrievalStages({
                        query: subQuery.query,
                        analysis: classifyQuery(subQuery.query),
                        llm: sarvamLlm,
                        retrieveOptions,
                        keywords: extracted.keywords,
                        entities: extracted.entities,
                    });

                    return {
                        subQuery,
                        ragResult: stageResult.ragResult,
                        fallbackMessage: stageResult.fallbackMessage,
                    };
                })
            );
            lastRagResult = buildMergedRagResult(
                baseAnalysis,
                subResults.map(({ subQuery, ragResult }) => ({ subQuery, ragResult })),
                ragStart
            );
        } else {
            const stageResult = await runRetrievalStages({
                query: retrievalQuestion,
                analysis: baseAnalysis,
                llm: sarvamLlm,
                retrieveOptions,
                queryEmbedding: cachedQueryEmbedding,
                keywords: processedQuery.keywords,
                entities: processedQuery.entities,
            });

            lastRagResult = stageResult.ragResult;
            fallbackMessage = stageResult.fallbackMessage;
        }

        // ── Feedback-Driven Reranking Boost ──────────────────────────
        // Adjust scores based on historical user feedback (thumbs up/down)
        if (decomposed.isDecomposed) {
            const rerankedMerged = rankAndDeduplicateContext({
                query: retrievalQuestion,
                matches: lastRagResult.matches,
                maxContexts: retrieveOptions.topK,
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
                contextString: rerankedMerged.contextString,
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

        console.log(`RAG pipeline completed [${elapsed(ragStart)}]`);

        const {
            answerMode,
            confidence,
            contextString,
            matches,
            retrievalStats,
            retrievalMetadata,
        } = lastRagResult;

        // ── Stored diagram short-circuit ────────────────────
        // If the top RAG match is a stored diagram with high confidence,
        // serve it directly — no Sarvam LLM call needed.
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

                    const payload = JSON.stringify({ __type: 'diagram', ...diagramData });
                    return textStreamResponse(`DIAGRAM_RESPONSE:${payload}`);
                }
            } catch (err: unknown) {
                console.warn(`Diagram generation failed: ${(err as Error).message}`);
                // Return a fallback diagram response instead of silently falling through to text
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

        const routedPrompt = selectRoute(baseAnalysis, langName, notFoundMsg, lastRagResult.answerMode);

        const buildFinalSystemPrompt = (
            routedSystem: string,
            context: string,
            history: string,
            decomposedPrefix: string,
            finalAnswerStyle: string,
            fallbackNote?: string,
        ): string => {
            const sections = [routedSystem.trim()];

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
                sections.push(`CONFIDENCE NOTE:\n- Retrieval confidence is limited.\n- Use only the matched information.\n- Clearly say when an answer is approximate or incomplete.`);
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

        const response = await Promise.race([
            sarvamLlm.invoke([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: retrievalQuestion },
            ]),
            new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('LLM_TIMEOUT')), 15000)
            )
        ]);

        const rawAnswer = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);
        const cleanedAnswer = stripRawChainOfThought(stripThinkTags(rawAnswer), notFoundMsg);
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
            llm: sarvamLlm,
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

        // Store answer in both cache tiers (fire-and-forget)
        void storeCache({
            query: retrievalQuestion,
            queryVector: cachedQueryEmbedding,
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

        console.log(`Response complete [${elapsed(requestStart)}] mode=${answerMode} conf=${(confidence * 100).toFixed(0)}%`);
        console.log(`Stats: ${retrievalStats.totalCandidates} candidates -> ${retrievalStats.afterRerank} after rerank | ${retrievalStats.latencyMs.toFixed(0)}ms`);
        console.log(`Sources: ${retrievalMetadata?.sourcesUsed?.join(', ') || 'none'}`);
        console.log(`${'='.repeat(60)}\n`);

        // Return with conversation ID header and rate limit info
        return buildChatResponse(answer, activeConversationId, rateLimitResult);
    } catch (error: unknown) {
        console.error('Chat API Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
