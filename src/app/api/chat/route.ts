/**
 * src/app/api/chat/route.ts
 *
 * Main chat pipeline for Dexter HMS support.
 */

import dns from 'node:dns';
import { ChatOpenAI } from '@langchain/openai';
import { isDiagramRequest, generateDiagramInternal } from '@/app/api/diagram/route';
import { evaluateAndStore } from '@/lib/rag-evaluator';
import { logicalRoute, formatRelationalAnswer } from '@/lib/logical-router';
import { buildDecomposedPromptPrefix, decomposeQuery, mergeSubQueryResults, type SubQuery } from '@/lib/query-decomposer';
import { logRoute, selectRoute } from '@/lib/router';
import { classifyQuery, retrieve, type QueryType, type RAGResult, type RankedMatch } from '@/lib/rag-engine';
import { getSupabase } from '@/lib/supabase';
import { createServerSupabaseClient } from '@/lib/auth-server';

dns.setDefaultResultOrder('ipv4first');

const MAX_HISTORY_TURNS = 4;
const UNKNOWN_THRESHOLD = 0.45;

const NOT_FOUND_MESSAGES: Record<string, string> = {
    en: "I don't have specific information about this in my knowledge base. Please consult the HMS panel manual or contact technical support.",
    bn: "আমার কাছে এই বিষয়ে নির্দিষ্ট তথ্য নেই। অনুগ্রহ করে HMS প্যানেলের ম্যানুয়াল দেখুন বা টেকনিক্যাল সাপোর্টে যোগাযোগ করুন।",
    hi: "मेरे पास इस विषय में विशिष्ट जानकारी नहीं है। कृपया HMS पैनल मैनुअल देखें या तकनीकी सहायता से संपर्क करें।",
};

function isEnglish(text: string): boolean {
    const ascii = text.replace(/[^a-zA-Z]/g, '').length;
    const total = text.replace(/[\s\d\W]/g, '').length || 1;
    return (ascii / total) > 0.6;
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
    const result = await sarvamLlm.invoke(prompt);
    return String(result.content).trim();
}

function buildSystemPrompt(
    queryType: QueryType,
    langName: string,
    notFoundMsg: string,
    answerMode: string,
    confidence: number,
    context: string,
    query: string,
    history: string,
    decomposedPrefix: string
): string {
    const confidenceNote = {
        rag_high: `HIGH CONFIDENCE (${(confidence * 100).toFixed(0)}%) - sources directly answer this question.`,
        rag_medium: `MEDIUM CONFIDENCE (${(confidence * 100).toFixed(0)}%) - sources are relevant, synthesize carefully.`,
        rag_partial: `LOW CONFIDENCE (${(confidence * 100).toFixed(0)}%) - sources only partially match, be explicit about limits.`,
        general: 'GENERAL MODE - no specific knowledge base match found.',
    }[answerMode] || '';

    const formatInstructions = {
        diagnostic: `DIAGNOSTIC FORMAT:\n- Start with the likely cause\n- Then numbered troubleshooting steps\n- Include error codes, LED indicators, and test points`,
        procedural: `PROCEDURAL FORMAT:\n- Use numbered steps\n- Include terminal labels, wire colors, and torque values\n- Add safety warnings where needed`,
        factual: `FACTUAL FORMAT:\n- Lead with the direct answer\n- Support with exact values and standards\n- Use tables for 3 or more related values`,
        visual: `VISUAL FORMAT:\n- Describe connections in logical order\n- List terminals, wire colors, and cable specs\n- End by offering a diagram if useful`,
        comparative: `COMPARATIVE FORMAT:\n- Use a comparison table\n- Highlight the differences clearly\n- State a recommendation if asked`,
        unknown: `EXPERT FORMAT:\n- Provide helpful technical information\n- Connect the answer to HMS concepts where possible`,
    }[queryType] || '';

    if (answerMode === 'general') {
        return `You are an expert in HMS industrial panels, PLCs, SCADA, Modbus, PROFIBUS, EtherNet/IP, and industrial automation.\n${history}\n${confidenceNote}\n${decomposedPrefix}\nSTRICT RULES:\n1. Always answer in ${langName}\n2. Be specific and actionable\n3. Keep answers under 200 words\n4. If unrelated to HMS or industrial automation, politely redirect\n${formatInstructions}\nQuestion: ${query}\n${langName} Answer:`;
    }

    return `You are an expert HMS industrial panel technical support agent for SEPLe/Dexter systems.\n${history}\n${confidenceNote}\n${decomposedPrefix}\nKNOWLEDGE BASE SOURCES:\n${context}\nSTRICT RULES:\n1. Answer from the provided sources whenever possible\n2. Always answer in ${langName}\n3. Include specific values, terminal labels, voltages, and error codes when present\n4. If sources do not fully answer the question, say what is missing and use careful expertise\n5. If no source is relevant, use this fallback: ${notFoundMsg}\n6. Keep answers under 200 words\n${formatInstructions}\nQuestion: ${query}\n${langName} Answer:`;
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

function elapsed(start: number): string {
    return `${((performance.now() - start) / 1000).toFixed(2)}s`;
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

export async function POST(req: Request) {
    const requestStart = performance.now();

    try {
        const { messages, userId, language = 'en', searchMode = 'standard', conversationId: reqConversationId } = await req.json();
        const languageNames = { en: 'English', bn: 'Bengali', hi: 'Hindi' } as const;
        const langName = languageNames[language as keyof typeof languageNames] || 'English';

        const latestMessage = messages[messages.length - 1].content;

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
                        .insert({ user_id: user.id, title: 'New Conversation' })
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

                    // Save user message
                    const { error: saveUserMessageError } = await authSupabase.from('messages').insert({
                        conversation_id: activeConversationId,
                        role: 'user',
                        content: latestMessage,
                    });
                    if (saveUserMessageError) {
                        console.warn('User message persistence failed:', saveUserMessageError.message);
                    }
                }
            }
        } catch (authErr) {
            // Auth is optional — continue without persistence
            console.warn('Auth/conversation resolution skipped:', (authErr as Error).message);
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

        const notFoundMsg = NOT_FOUND_MESSAGES[language] || NOT_FOUND_MESSAGES.en;
        const { decision, relationalResult } = await logicalRoute(englishQuestion);
        if (decision.route === 'relational' && relationalResult) {
            const relationalAnswer = formatRelationalAnswer(relationalResult, langName);
            return textStreamResponse(relationalAnswer);
        }

        const baseAnalysis = classifyQuery(englishQuestion);
        const routedPrompt = selectRoute(baseAnalysis, langName, notFoundMsg, 'general');
        logRoute(baseAnalysis, routedPrompt);

        const decomposed = await decomposeQuery(englishQuestion, baseAnalysis, sarvamLlm);
        const decomposedPrefix = buildDecomposedPromptPrefix(decomposed);
        const retrieveOptions = {
            useHYDE: routedPrompt.route.retrieval.useHYDE,
            topK: routedPrompt.route.retrieval.topK,
            useMMR: searchMode === 'mmr',
            useWeighted: searchMode === 'weighted',
            mmrLambda: searchMode === 'mmr' ? 0.5 : undefined,
            timeBoostDays: searchMode === 'mmr' ? 30 : undefined,
            useGraphBoost: routedPrompt.route.retrieval.boostEntities,
        };

        const ragStart = performance.now();
        let lastRagResult: RAGResult;

        if (decomposed.isDecomposed) {
            const subResults = await Promise.all(
                decomposed.subQueries.map(async (subQuery) => ({
                    subQuery,
                    ragResult: await retrieve(subQuery.query, sarvamLlm, retrieveOptions),
                }))
            );
            lastRagResult = buildMergedRagResult(baseAnalysis, subResults, ragStart);
        } else {
            lastRagResult = await retrieve(englishQuestion, sarvamLlm, retrieveOptions);
        }

        console.log(`RAG Engine completed [${elapsed(ragStart)}]`);

        const {
            answerMode,
            confidence,
            contextString,
            matches,
            queryAnalysis,
            retrievalStats,
            retrievalMetadata,
        } = lastRagResult;

        const { isDiagram, diagramType } = isDiagramRequest(englishQuestion);
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
                    });

                    const payload = JSON.stringify({ __type: 'diagram', ...diagramData });
                    return textStreamResponse(`DIAGRAM_RESPONSE:${payload}`);
                }
            } catch (err: unknown) {
                console.warn(`Diagram failed: ${(err as Error).message}`);
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

        const historySection = conversationHistory
            ? `\nCONVERSATION HISTORY:\n${conversationHistory}\n`
            : '';

        const systemPrompt = buildSystemPrompt(
            queryAnalysis.type,
            langName,
            notFoundMsg,
            answerMode,
            confidence,
            contextString,
            englishQuestion,
            historySection,
            decomposedPrefix
        );

        const response = await sarvamLlm.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: englishQuestion },
        ]);

        const answer = typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content);

        void evaluateAndStore({
            question: englishQuestion,
            answer,
            ragResult: lastRagResult,
            llm: sarvamLlm,
            latencyMs: performance.now() - requestStart,
            userId: userId ?? undefined,
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
        });

        // ── Save assistant message + auto-title ──
        if (authUserId && activeConversationId) {
            try {
                const authSupabase = await createServerSupabaseClient();

                // Save assistant message before returning so resumed conversations can load reliably.
                const { error: saveAssistantMessageError } = await authSupabase.from('messages').insert({
                    conversation_id: activeConversationId,
                    role: 'assistant',
                    content: answer,
                });
                if (saveAssistantMessageError) {
                    console.warn('Assistant message persistence failed:', saveAssistantMessageError.message);
                }

                // Auto-title if still "New Conversation"
                const { data: conv } = await authSupabase
                    .from('conversations')
                    .select('title')
                    .eq('id', activeConversationId)
                    .single();

                if (conv && conv.title === 'New Conversation') {
                    const titlePrompt = `Generate a concise 4-6 word title summarizing this conversation topic. Output ONLY the title text, no quotes, no trailing punctuation.\nUser question: ${latestMessage}\nAssistant answer: ${answer.slice(0, 200)}\nTitle:`;
                    console.log('[Auto-title] Generating title via LLM...');
                    const titleResult = await sarvamLlm.invoke(titlePrompt);
                    const title = String(titleResult.content).trim().replace(/^["']|["']$/g, '').replace(/\.+$/, '').slice(0, 80);
                    console.log(`[Auto-title] LLM returned: "${title}"`);

                    if (title && title.length > 1) {
                        const { error: updateError } = await authSupabase
                            .from('conversations')
                            .update({ title })
                            .eq('id', activeConversationId);

                        if (updateError) {
                            console.error(`[Auto-title] DB update FAILED:`, updateError.message);
                        } else {
                            console.log(`[Auto-title] ✅ Title updated to: "${title}"`);
                        }
                    } else {
                        console.warn('[Auto-title] Generated title was empty or too short');
                    }
                }
            } catch { /* persistence is non-critical */ }
        }

        console.log(`Response complete [${elapsed(requestStart)}] mode=${answerMode} conf=${(confidence * 100).toFixed(0)}%`);
        console.log(`Stats: ${retrievalStats.totalCandidates} candidates -> ${retrievalStats.afterRerank} after rerank | ${retrievalStats.latencyMs.toFixed(0)}ms`);
        console.log(`Sources: ${retrievalMetadata?.sourcesUsed?.join(', ') || 'none'}`);
        console.log(`${'='.repeat(60)}\n`);

        // Return with conversation ID header for frontend
        const chatResponse = textStreamResponse(answer);
        if (activeConversationId) {
            chatResponse.headers.set('x-conversation-id', activeConversationId);
        }
        return chatResponse;
    } catch (error: unknown) {
        console.error('Chat API Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
