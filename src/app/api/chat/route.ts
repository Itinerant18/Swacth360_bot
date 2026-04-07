import dns from 'node:dns';
import { generateDiagramInternal } from '@/app/api/diagram/route';
import { evaluateAndStore } from '@/lib/rag-evaluator';
import { parseRAGSettings, type RAGSettings } from '@/lib/rag-settings';
import { getSupabase } from '@/lib/supabase';
import { createServerSupabaseClient } from '@/lib/auth-server';
import { storeCache } from '@/lib/cache';
import { getLLM } from '@/lib/llm';
import { type ConversationMessage } from '@/lib/conversation-retrieval';
import type { UserIntent } from '@/lib/intentClassifier';
import { checkRateLimit, getClientIdentifier, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limiter';
import { formatResponse } from '@/lib/responseFormatter';
import { recordMetric, type PipelineMetric, type StageTimings } from '@/lib/pipelineMetrics';
import { storeSemanticCache } from '@/lib/semanticCache';
import { recordChatLog, recordFailure, type CacheSource } from '@/lib/logger';
import { createSseHeaders, createSseResponse } from '@/lib/sse';
import { raceWithTimeout, runPipeline, type PipelineResult } from '@/lib/pipeline';

dns.setDefaultResultOrder('ipv4first');

const MAX_HISTORY_TURNS = 4;

type ChatRequestBody = {
    messages?: Array<{ role?: string; content?: string }>;
    userId?: string | null;
    language?: string;
    searchMode?: string;
    conversationId?: string | null;
};

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

function buildChatHeaders(
    activeConversationId: string | null,
    requestId: string,
    rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>,
    extraHeaders: Record<string, string> = {},
): Headers {
    const headers = createSseHeaders();

    if (activeConversationId) {
        headers.set('x-conversation-id', activeConversationId);
    }

    headers.set('x-request-id', requestId);

    const rlHeaders = rateLimitHeaders(rateLimitResult);
    for (const [key, value] of Object.entries(rlHeaders)) {
        headers.set(key, value);
    }

    for (const [key, value] of Object.entries(extraHeaders)) {
        headers.set(key, value);
    }

    return headers;
}

function extractTextFromMessageContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }

    if (!Array.isArray(content)) {
        return '';
    }

    return content.map((part) => {
        if (typeof part === 'string') {
            return part;
        }

        if (!part || typeof part !== 'object') {
            return '';
        }

        if ('text' in part && typeof part.text === 'string') {
            return part.text;
        }

        return '';
    }).join('');
}

function buildChatResponse(
    text: string,
    activeConversationId: string | null,
    requestId: string,
    rateLimitResult: Awaited<ReturnType<typeof checkRateLimit>>,
    extraHeaders: Record<string, string> = {},
    meta?: { answerMode?: string; confidence?: number; knowledgeId?: string | null },
): Response {
    return createSseResponse({
        headers: buildChatHeaders(activeConversationId, requestId, rateLimitResult, extraHeaders),
        meta: {
            requestId,
            conversationId: activeConversationId,
            stream: 'chat',
            source: null,
        },
        stream: ({ send }) => {
            send('delta', { text });
            send('done', {
                content: text,
                answerMode: meta?.answerMode ?? null,
                confidence: meta?.confidence ?? null,
                knowledgeId: meta?.knowledgeId ?? null,
            });
        },
    });
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

function toStageTimings(stages: Record<string, number>): StageTimings {
    return {
        auth: stages.auth ?? 0,
        translation: stages.translation ?? 0,
        cacheCheck: stages.cacheCheck ?? 0,
        embedding: stages.embedding ?? 0,
        retrieval: stages.retrieval ?? 0,
        reranking: stages.reranking ?? 0,
        llmGeneration: stages.llmGeneration ?? 0,
    };
}

function resolveCacheTier(cacheSource: CacheSource | undefined): 1 | 2 | null {
    if (cacheSource === 'exact') {
        return 1;
    }

    if (cacheSource === 'semantic_local' || cacheSource === 'semantic_db') {
        return 2;
    }

    return null;
}

function recordPipelineMetric(params: {
    requestId: string;
    result: PipelineResult;
    totalLatencyMs: number;
    stages?: StageTimings;
    answerMode: string;
    confidence: number;
    error?: string | null;
}): void {
    const { requestId, result, totalLatencyMs, stages, answerMode, confidence, error = null } = params;

    void recordMetric({
        requestId,
        totalLatencyMs,
        stages: stages ?? toStageTimings(result.metrics.stages),
        cacheHit: result.metrics.cacheHit,
        cacheTier: resolveCacheTier(result.cacheSource),
        answerMode,
        confidence,
        matchCount: result.matches.length,
        hydeUsed: result.metrics.hydeUsed,
        queryExpansionUsed: result.metrics.queryExpansionUsed,
        error,
        createdAt: new Date().toISOString(),
    } as PipelineMetric);
}

export async function POST(req: Request) {
    const requestStart = performance.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let originalQueryForLog = '';
    let rewrittenQueryForLog = '';
    let pipelineResult: PipelineResult | null = null;

    try {
        const body = await req.json() as ChatRequestBody;

        if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Invalid messages format' }),
                {
                    status: 400,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-request-id': requestId,
                    },
                },
            );
        }

        const messages = body.messages;
        const userId = body.userId ?? null;
        const language = body.language === 'bn' || body.language === 'hi' ? body.language : 'en';
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
                },
            );
        }

        const clientIp = getClientIdentifier(req);

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

        let authUserId: string | null = null;
        let activeConversationId: string | null = reqConversationId || null;
        let dbHistory: StoredConversationMessage[] = [];

        try {
            const authSupabase = await createServerSupabaseClient();
            const { data: { user } } = await authSupabase.auth.getUser();
            if (user) {
                authUserId = user.id;

                if (!activeConversationId) {
                    const { data: conv } = await authSupabase
                        .from('conversations')
                        .insert({ user_id: user.id, title: '' })
                        .select('id')
                        .single();
                    if (conv) {
                        activeConversationId = conv.id;
                    }
                }

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
            console.warn('Auth/conversation resolution skipped:', (authErr as Error).message);
        }

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
                },
            );
        }

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

        const historySource = dbHistory.length > 0
            ? dbHistory
            : messages.slice(0, -1).slice(-(MAX_HISTORY_TURNS * 2));
        const conversationHistory: ConversationMessage[] = historySource.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: typeof message.content === 'string' ? message.content : '',
        }));

        pipelineResult = await runPipeline({
            query: latestMessage,
            language,
            userId: authUserId ?? userId,
            conversationId: activeConversationId,
            conversationHistory,
            settings: parsedRagSettings,
            requestId,
            clientIp,
            searchMode,
        });
        originalQueryForLog = pipelineResult.originalQueryForLog;
        rewrittenQueryForLog = pipelineResult.rewrittenQueryForLog;
        const result = pipelineResult;
        const knowledgeId = result.matches[0]?.id ?? null;

        const supabase = getSupabase();
        if (result.shouldLogUnknownQuestion) {
            void supabase.rpc('upsert_unknown_question', {
                p_user_question: latestMessage,
                p_english_text: result.englishQuestion,
                p_top_similarity: result.matches[0]?.finalScore || 0,
            }).then(({ error }) => {
                if (error) {
                    console.warn(`Unknown log skipped: ${error.message}`);
                }
            });
        }

        if (!result.needsLLMGeneration) {
            if (result.isDiagram && result.diagramStrategy === 'generate') {
                try {
                    const diagramData = await generateDiagramInternal(
                        latestMessage,
                        result.englishQuestion,
                        result.diagramType || 'wiring',
                        language,
                        {
                            ragContext: result.ragResult?.contextString || '',
                            ragMatches: result.diagramMatches ?? [],
                            detailLevel: result.confidence > 0.5 ? 'context-rich' : 'basic',
                        },
                    );

                    if (diagramData.success && diagramData.markdown) {
                        void supabase.from('chat_sessions').insert({
                            user_question: latestMessage,
                            english_translation: result.englishQuestion,
                            answer_mode: 'diagram',
                            top_similarity: diagramData.hasKBContext ? result.confidence : 0.3,
                            user_id: userId || null,
                        }).then(({ error }) => {
                            if (error) console.warn('chat_sessions insert failed:', error.message);
                        });

                        recordChatLog({
                            requestId,
                            query: originalQueryForLog || latestMessage,
                            rewrittenQuery: result.retrievalQuestion,
                            intent: result.intent,
                            retrievedChunks: result.retrievedChunks,
                            finalChunks: result.finalChunks,
                            confidence: diagramData.hasKBContext ? result.confidence : 0.3,
                            responseTimeMs: performance.now() - requestStart,
                            success: true,
                            fallbackTriggered: !diagramData.hasKBContext,
                            cacheSource: result.cacheSource ?? 'none',
                            hydeUsed: result.metrics.hydeUsed,
                            queryExpansionUsed: result.metrics.queryExpansionUsed,
                            llmCalls: result.metrics.llmCallCount,
                            error: null,
                        });

                        const payload = JSON.stringify({ __type: 'diagram', ...diagramData });
                        return buildChatResponse(`DIAGRAM_RESPONSE:${payload}`, activeConversationId, requestId, rateLimitResult, {}, {
                            answerMode: 'diagram',
                            confidence: diagramData.hasKBContext ? result.confidence : 0.3,
                            knowledgeId,
                        });
                    }
                } catch (err: unknown) {
                    console.warn(`Diagram generation failed: ${(err as Error).message}`);
                    recordFailure({
                        requestId,
                        query: result.retrievalQuestion,
                        reason: 'diagram_generation_failed',
                        confidence: result.confidence,
                    });

                    const fallbackPayload = JSON.stringify({
                        __type: 'diagram',
                        markdown: `## Diagram Generation Error\n\nUnable to generate ${result.diagramType || 'wiring'} diagram at this time.\n\nPlease try again or contact technical support if the issue persists.`,
                        title: `${result.diagramType || 'wiring'} diagram - Error`,
                        diagramType: result.diagramType || 'wiring',
                        panelType: 'HMS Panel',
                        hasKBContext: false,
                        generatedBy: 'fallback',
                        success: false,
                    });
                    return buildChatResponse(`DIAGRAM_RESPONSE:${fallbackPayload}`, activeConversationId, requestId, rateLimitResult, {}, {
                        answerMode: 'diagram',
                        confidence: result.confidence,
                        knowledgeId,
                    });
                }
            }

            if (result.answerMode === 'casual') {
                await persistAssistantMessage({
                    enabled: Boolean(authUserId),
                    conversationId: activeConversationId,
                    content: result.answer,
                    answerMode: 'casual',
                });
            } else if (result.answerMode === 'cache') {
                await persistAssistantMessage({
                    enabled: Boolean(authUserId),
                    conversationId: activeConversationId,
                    content: result.answer,
                    answerMode: 'cache',
                    topSimilarity: result.confidence,
                });

                recordPipelineMetric({
                    requestId,
                    result,
                    totalLatencyMs: performance.now() - requestStart,
                    answerMode: 'cache',
                    confidence: result.confidence,
                });
            } else if (result.dbAnswerMode === 'not_found') {
                await persistAssistantMessage({
                    enabled: Boolean(authUserId),
                    conversationId: activeConversationId,
                    content: result.answer,
                    answerMode: 'not_found',
                    topSimilarity: result.confidence,
                });

                void supabase.from('chat_sessions').insert({
                    user_question: latestMessage,
                    english_translation: result.englishQuestion,
                    answer_mode: 'not_found',
                    top_similarity: result.confidence,
                    user_id: authUserId || userId || null,
                    conversation_id: activeConversationId || null,
                }).then(({ error }) => {
                    if (error) console.warn('chat_sessions insert failed:', error.message);
                });
            } else if (result.answerMode === 'diagram_stored') {
                void supabase.from('chat_sessions').insert({
                    user_question: latestMessage,
                    english_translation: result.englishQuestion,
                    answer_mode: 'diagram_stored',
                    top_similarity: result.confidence,
                    user_id: userId || null,
                }).then(({ error }) => {
                    if (error) console.warn('chat_sessions insert failed:', error.message);
                });
            }

            recordChatLog({
                requestId,
                query: originalQueryForLog || latestMessage,
                rewrittenQuery: result.retrievalQuestion,
                intent: result.intent,
                retrievedChunks: result.dbAnswerMode === 'not_found' ? [] : result.retrievedChunks,
                finalChunks: result.dbAnswerMode === 'not_found' ? [] : result.finalChunks,
                confidence: result.confidence,
                responseTimeMs: performance.now() - requestStart,
                success: true,
                fallbackTriggered: Boolean(result.fallbackMessage) || result.dbAnswerMode === 'not_found',
                cacheSource: result.cacheSource ?? 'none',
                hydeUsed: result.metrics.hydeUsed,
                queryExpansionUsed: result.metrics.queryExpansionUsed,
                llmCalls: result.metrics.llmCallCount,
                error: null,
            });

            const extraHeaders: Record<string, string> = {};
            if (result.answerMode === 'cache') {
                if (result.cacheSource === 'exact') {
                    extraHeaders['x-cache'] = 'HIT:tier1';
                } else if (result.cacheSource === 'semantic_local') {
                    extraHeaders['x-cache'] = `HIT:semantic:${result.confidence.toFixed(3)}`;
                } else if (result.cacheSource === 'semantic_db') {
                    extraHeaders['x-cache'] = `HIT:tier2:${result.confidence.toFixed(3)}`;
                }
                extraHeaders['x-pipeline-latency'] = `${(performance.now() - requestStart).toFixed(0)}ms`;
            } else if (result.answerMode === 'diagram_stored') {
                extraHeaders['x-pipeline-latency'] = `${(performance.now() - requestStart).toFixed(0)}ms`;
            }

            return buildChatResponse(
                result.answer,
                activeConversationId,
                requestId,
                rateLimitResult,
                extraHeaders,
                {
                    answerMode: result.answerMode,
                    confidence: result.confidence,
                    knowledgeId,
                },
            );
        }

        const simpleLlm = getLLM('simple');
        const buildGenerationStages = (startedAt: number): StageTimings => toStageTimings({
            ...result.metrics.stages,
            llmGeneration: Math.round((performance.now() - startedAt) * 100) / 100,
        });

        const finalizeAnswer = async (answer: string, llmCalls: number, stages: StageTimings) => {
            void evaluateAndStore({
                question: result.retrievalQuestion,
                answer,
                ragResult: result.ragResult!,
                llm: simpleLlm,
                latencyMs: performance.now() - requestStart,
                userId: authUserId || userId || undefined,
            }).catch((err) => {
                console.error('[evaluation error]', err);
            });

            void supabase.from('chat_sessions').insert({
                user_question: latestMessage,
                english_translation: result.englishQuestion,
                answer_mode: result.dbAnswerMode,
                top_similarity: result.matches[0]?.finalScore || result.confidence,
                bot_answer: answer,
                user_id: authUserId || userId || null,
                conversation_id: activeConversationId || null,
            }).then(({ error }) => {
                if (error) console.warn('chat_sessions insert failed:', error.message);
            });

            if (result.cachedQueryEmbedding) {
                void storeCache({
                    query: result.retrievalQuestion,
                    queryVector: result.cachedQueryEmbedding,
                    answer,
                    answerMode: result.answerMode,
                    language,
                    confidence: result.confidence,
                });
                storeSemanticCache({
                    query: result.retrievalQuestion,
                    queryEmbedding: result.cachedQueryEmbedding,
                    answer,
                    answerMode: result.answerMode,
                    language,
                    confidence: result.confidence,
                });
            }

            await persistAssistantMessage({
                enabled: Boolean(authUserId),
                conversationId: activeConversationId,
                content: answer,
                answerMode: result.dbAnswerMode,
                topSimilarity: result.matches[0]?.finalScore || result.confidence,
            });

            if (result.confidence < 0.5 || result.fallbackMessage) {
                recordFailure({
                    requestId,
                    query: result.retrievalQuestion,
                    reason: result.fallbackMessage ? 'fallback_triggered' : 'low_confidence',
                    confidence: result.confidence,
                });
            }

            recordChatLog({
                requestId,
                query: originalQueryForLog || latestMessage,
                rewrittenQuery: result.retrievalQuestion,
                intent: result.intent,
                retrievedChunks: result.retrievedChunks,
                finalChunks: result.finalChunks,
                confidence: result.confidence,
                responseTimeMs: performance.now() - requestStart,
                success: true,
                fallbackTriggered: Boolean(result.fallbackMessage),
                cacheSource: result.cacheSource ?? 'none',
                hydeUsed: result.metrics.hydeUsed,
                queryExpansionUsed: result.metrics.queryExpansionUsed,
                llmCalls,
                error: null,
            });

            recordPipelineMetric({
                requestId,
                result,
                totalLatencyMs: performance.now() - requestStart,
                stages,
                answerMode: result.dbAnswerMode,
                confidence: result.confidence,
            });
        };

        let llmCallCount = result.metrics.llmCallCount + 1;

        if (!result.needsVerification) {
            const chatLlm = getLLM(result.llmVariant ?? 'simple', {
                streaming: true,
                maxTokens: result.llmMaxTokens,
                temperature: result.llmTemperature,
            });

            return createSseResponse({
                request: req,
                headers: buildChatHeaders(activeConversationId, requestId, rateLimitResult),
                meta: {
                    requestId,
                    conversationId: activeConversationId,
                    stream: 'chat',
                    source: null,
                },
                stream: async ({ send, isClosed }) => {
                    let streamedAnswer = '';
                    const generationStartedAt = performance.now();

                    try {
                        const stream = await raceWithTimeout(
                            chatLlm.stream([
                                { role: 'system', content: result.systemPrompt || '' },
                                { role: 'user', content: result.formattedUserQuery || latestMessage },
                            ]),
                            25_000,
                        );

                        for await (const chunk of stream) {
                            if (isClosed()) {
                                return;
                            }

                            const deltaText = extractTextFromMessageContent(chunk.content);
                            if (!deltaText) {
                                continue;
                            }

                            streamedAnswer += deltaText;
                            send('delta', { text: deltaText });
                        }

                        const answer = formatResponse(streamedAnswer.trim(), {
                            intent: result.intent as UserIntent,
                            confidence: result.confidence,
                            fallbackMessage: result.fallbackMessage,
                            matches: result.matches,
                        });

                        await finalizeAnswer(answer, llmCallCount, buildGenerationStages(generationStartedAt));

                        if (!isClosed()) {
                            send('done', {
                                content: answer,
                                answerMode: result.dbAnswerMode,
                                confidence: result.confidence,
                                knowledgeId,
                            });
                        }
                    } catch (streamError) {
                        console.error('Chat API Stream Error:', streamError);
                        const errorMessage = (streamError as Error).message || 'Unknown error';

                        recordPipelineMetric({
                            requestId,
                            result,
                            totalLatencyMs: performance.now() - requestStart,
                            stages: buildGenerationStages(generationStartedAt),
                            answerMode: result.dbAnswerMode,
                            confidence: result.confidence,
                            error: errorMessage,
                        });

                        recordFailure({
                            requestId,
                            query: rewrittenQueryForLog || originalQueryForLog || latestMessage,
                            reason: errorMessage,
                            confidence: null,
                        });

                        if (!isClosed()) {
                            send('error', { message: 'Failed to process chat request.' });
                        }
                    }
                },
            });
        }

        const chatLlm = getLLM(result.llmVariant ?? 'simple', {
            streaming: false,
            maxTokens: result.llmMaxTokens,
            temperature: result.llmTemperature,
        });
        const generationStartedAt = performance.now();

        const response = await raceWithTimeout(
            chatLlm.invoke([
                { role: 'system', content: result.systemPrompt || '' },
                { role: 'user', content: result.formattedUserQuery || latestMessage },
            ]),
            25_000,
        );

        let cleanedAnswer = (typeof response.content === 'string' ? response.content : JSON.stringify(response.content)).trim();

        if (result.needsVerification && result.verificationPrompt) {
            llmCallCount += 1;
            try {
                const verificationResponse = await raceWithTimeout(
                    simpleLlm.invoke([
                        {
                            role: 'system',
                            content: 'You revise support answers for clarity and accuracy. Remove unsupported claims and keep the structure concise.',
                        },
                        {
                            role: 'user',
                            content: result.verificationPrompt.replace('{{DRAFT_ANSWER}}', cleanedAnswer),
                        },
                    ]),
                    12_000,
                );

                cleanedAnswer = (typeof verificationResponse.content === 'string' ? verificationResponse.content : JSON.stringify(verificationResponse.content)).trim();
            } catch (verifyErr) {
                console.warn('[verification pass] failed, using original answer:', (verifyErr as Error).message);
            }
        }

        const answer = formatResponse(cleanedAnswer, {
            intent: result.intent as UserIntent,
            confidence: result.confidence,
            fallbackMessage: result.fallbackMessage,
            matches: result.matches,
        });
        await finalizeAnswer(answer, llmCallCount, buildGenerationStages(generationStartedAt));

        return buildChatResponse(answer, activeConversationId, requestId, rateLimitResult, {
            'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
        }, { answerMode: result.dbAnswerMode, confidence: result.confidence, knowledgeId });
    } catch (error: unknown) {
        console.error('Chat API Error:', error);
        const errorMessage = (error as Error).message || 'Unknown error';

        if (pipelineResult) {
            recordPipelineMetric({
                requestId,
                result: pipelineResult,
                totalLatencyMs: performance.now() - requestStart,
                answerMode: pipelineResult.dbAnswerMode,
                confidence: pipelineResult.confidence,
                error: errorMessage,
            });
        }

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
            },
        );
    }
}
