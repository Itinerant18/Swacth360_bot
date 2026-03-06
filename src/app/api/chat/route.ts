/**
 * src/app/api/chat/route.ts
 *
 * RAG-based chat API for Dexter HMS Panel technical support.
 * Now uses FRONTIER-GRADE RAG Engine with:
 * - HYDE (Hypothetical Document Embeddings)
 * - Multi-vector retrieval (query + HYDE + expanded)
 * - Cross-encoder + BM25 reranking
 * - Semantic caching
 * - Query classification (factual/procedural/diagnostic/visual/comparative)
 * - Contextual compression
 * - Confidence calibration
 */

import dns from 'node:dns';
import { getSupabase } from '@/lib/supabase';
import { retrieve, type RAGResult, type QueryType } from '@/lib/rag-engine';
import { ChatOpenAI } from '@langchain/openai';
import { isDiagramRequest, generateDiagramInternal } from '@/app/api/diagram/route';

dns.setDefaultResultOrder('ipv4first');

// ─── Configuration ────────────────────────────────────────────
const MAX_HISTORY_TURNS = 4;
const UNKNOWN_THRESHOLD = 0.45;

// ─── Language detection ───────────────────────────────────────
function isEnglish(text: string): boolean {
    const ascii = text.replace(/[^a-zA-Z]/g, '').length;
    const total = text.replace(/[\s\d\W]/g, '').length || 1;
    return (ascii / total) > 0.6;
}

// ─── Translation ──────────────────────────────────────────────
async function translateToEnglish(
    text: string,
    language: string,
    sarvamLlm: ChatOpenAI,
    conversationHistory: string
): Promise<string> {
    if (language === 'en' || isEnglish(text)) return text.trim();

    const sourceLang = language === 'hi' ? 'Hindi' : 'Bengali';
    const historyCtx = conversationHistory
        ? `Context:\n${conversationHistory}\n\n`
        : '';

    const prompt = `Translate the ${sourceLang} question to English. Resolve pronouns using context. Output ONLY the English translation, nothing else.
${historyCtx}${sourceLang}: ${text}
English:`;

    const result = await sarvamLlm.invoke(prompt);
    return (result.content as string).trim();
}

// ─── System Prompt Builder ───────────────────────────────────
function buildSystemPrompt(
    queryType: QueryType,
    langName: string,
    notFoundMsg: string,
    answerMode: string,
    confidence: number,
    context: string,
    query: string,
    history: string
): string {
    // Confidence indicator based on calibration
    const confidenceLevel = confidence >= 0.7 ? 'HIGH' : confidence >= 0.5 ? 'MEDIUM' : 'LOW';
    
    const confidenceNote = {
        rag_high: `✅ HIGH CONFIDENCE (${(confidence * 100).toFixed(0)}%) — Sources directly answer this question. Provide complete, confident response.`,
        rag_medium: `⚡ MEDIUM CONFIDENCE (${(confidence * 100).toFixed(0)}%) — Sources are relevant. Synthesize and fill gaps with expertise.`,
        rag_partial: `⚠️ LOW CONFIDENCE (${(confidence * 100).toFixed(0)}%) — Sources partially match. Be honest about limitations.`,
        general: `🔄 GENERAL MODE — No specific knowledge base match found. Use your general HMS/industrial automation expertise.`,
    }[answerMode] || '';

    const formatInstructions = {
        diagnostic: `DIAGNOSTIC FORMAT:
- First: State the likely cause clearly
- Then: Numbered troubleshooting steps (1, 2, 3...)
- Include: Error codes with meanings, LED indicators, test points`,
        procedural: `PROCEDURAL FORMAT:
- Numbered steps: 1. 2. 3. with clear action words
- Include: Terminal labels (TB1+, B-), wire colors, torque values
- Safety: Add ⚠️ warnings for dangerous steps`,
        factual: `FACTUAL FORMAT:
- Lead with the direct answer
- Support with specific values, standards, specifications
- Use tables for 3+ related values`,
        visual: `VISUAL FORMAT:
- Describe connections in logical order (left→right, top→bottom)
- List all terminals, wire colors, cable specs
- End with: "Ask for '[wiring] diagram' to see visual"`,
        comparative: `COMPARATIVE FORMAT:
- Use comparison tables with columns for each option
- Highlight differences clearly
- State recommendation if asked`,
        unknown: `EXPERT FORMAT:
- Provide helpful technical information
- Connect to HMS panel concepts where possible`,
    }[queryType] || '';

    if (answerMode === 'general') {
        return `You are an expert in HMS industrial panels, PLCs, SCADA, Modbus, PROFIBUS, EtherNet/IP, and industrial automation.
${history}
${confidenceNote}
STRICT RULES:
1. Always answer in ${langName} — every word, no exceptions
2. Be specific: include actual values, terminal names, wire colors, voltage specs
3. Never say "I don't know" — use your expertise to help
4. Keep answers under 200 words — concise and actionable
5. If unrelated to HMS/industrial: politely redirect
${formatInstructions}
Question: ${query}
${langName} Answer:`;
    }

    return `You are an expert HMS industrial panel technical support agent for SEPLe/Dexter systems.
${history}
${confidenceNote}
KNOWLEDGE BASE SOURCES:
${context}
STRICT RULES:
1. Answer ONLY from the provided sources — do NOT hallucinate
2. Always answer in ${langName} — every single word
3. Include specific values: terminal labels (TB1+), wire colors, voltages (24V DC), error codes (E001)
4. Use the format specified below:
${formatInstructions}
5. If sources don't fully answer: use expertise to help, mention limitations
6. Keep under 200 words — concise
Question: ${query}
${langName} Answer:`;
}

// ─── Helper: streaming text response ───────────────────────────
function textStreamResponse(text: string): Response {
    const enc = new TextEncoder();
    return new Response(
        new ReadableStream({
            start(c) {
                c.enqueue(enc.encode(`0:${JSON.stringify(text)}\n`));
                c.close();
            },
        }),
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
}

function elapsed(start: number): string {
    return `${((performance.now() - start) / 1000).toFixed(2)}s`;
}

// ─── Main Handler ─────────────────────────────────────────────
export async function POST(req: Request) {
    const requestStart = performance.now();

    try {
        const { messages, userId, language = 'en', searchMode = 'standard' } = await req.json();

        const LANGUAGE_NAMES = { en: 'English', bn: 'Bengali', hi: 'Hindi' };
        const langName = LANGUAGE_NAMES[language as keyof typeof LANGUAGE_NAMES] || 'English';

        const historyMessages = messages.slice(0, -1);
        const latestMessage = messages[messages.length - 1].content;
        const recentHistory = historyMessages.slice(-(MAX_HISTORY_TURNS * 2));
        const conversationHistory = recentHistory
            .map((m: { role: string; content: string }) =>
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n');

        console.log(`\n${'═'.repeat(60)}`);
        console.log(`💬 User [${language}]: "${latestMessage}"`);

        // ── Sarvam AI setup ─────────────────────────────────────
        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: process.env.SARVAM_API_KEY,
            configuration: { baseURL: 'https://api.sarvam.ai/v1' },
            temperature: 0.05,
            maxTokens: 768,
        });

        // ── Translation ─────────────────────────────────────────
        const translateStart = performance.now();
        const englishQuestion = await translateToEnglish(
            latestMessage,
            language,
            sarvamLlm,
            conversationHistory
        );
        if (language !== 'en' && !isEnglish(latestMessage)) {
            console.log(`🗣️  Translated (${language}→EN): "${englishQuestion}" [${elapsed(translateStart)}]`);
        }

        // ── Diagram intent check ────────────────────────────────
        const { isDiagram, diagramType } = isDiagramRequest(englishQuestion);
        
        // ── Call Frontier RAG Engine FIRST (always) ─────────────
        const ragStart = performance.now();
        const retrieveOptions = {
            useHYDE: true,
            useMMR: searchMode === 'mmr',
            useWeighted: searchMode === 'weighted',
            mmrLambda: searchMode === 'mmr' ? 0.5 : undefined,
            timeBoostDays: searchMode === 'mmr' ? 30 : undefined,
        };
        const ragResult: RAGResult = await retrieve(englishQuestion, sarvamLlm, retrieveOptions);
        console.log(`🚀 RAG Engine completed [${elapsed(ragStart)}]`);

        const { answerMode, confidence, contextString, matches, queryAnalysis, retrievalStats, retrievalMetadata } = ragResult;

        // ── If diagram requested, pass RAG context to diagram generation ─
        if (isDiagram) {
            console.log(`🖼️  DIAGRAM REQUEST — type: ${diagramType} | using RAG context: ${contextString.length > 50}`);
            try {
                // Pass RAG context to diagram for context-aware generation
                const diagramData = await generateDiagramInternal(
                    latestMessage,
                    englishQuestion,
                    diagramType,
                    language,
                    {
                        ragContext: contextString,
                        ragMatches: matches.map(m => ({
                            question: m.question,
                            answer: m.answer,
                            category: m.category,
                            finalScore: m.finalScore,
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
            } catch (err: any) {
                console.warn(`⚠️  Diagram failed: ${err.message} — falling through to RAG answer`);
            }
        }

        // ── Log unknown questions ───────────────────────────────
        const supabase = getSupabase();
        if (confidence < UNKNOWN_THRESHOLD) {
            void supabase.rpc('upsert_unknown_question', {
                p_user_question: latestMessage,
                p_english_text: englishQuestion,
                p_top_similarity: matches[0]?.finalScore || 0,
            }).then(({ error }) => {
                if (error) console.warn('⚠️  Unknown log skipped:', error.message);
                else console.log(`   📝 Logged as unknown (conf=${confidence.toFixed(3)})`);
            });
        }

        // ── Build prompt ────────────────────────────────────────
        const notFoundMessages: Record<string, string> = {
            en: "I don't have specific information about this in my knowledge base. Please consult the HMS panel manual or contact technical support.",
            bn: "আমার কাছে এই বিষয়ে নির্দিষ্ট তথ্য নেই। অনুগ্রহ করে HMS প্যানেলের ম্যানুয়াল দেখুন বা টেকনিক্যাল সাপোর্টে যোগাযোগ করুন।",
            hi: "मेरे पास इस विषय में विशिष्ट जानकारी नहीं है। कृपया HMS पैनल मैनुअल देखें या तकनीकी सहायता से संपर्क करें।",
        };
        const notFoundMsg = notFoundMessages[language as string] || notFoundMessages.en;

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
            historySection
        );

        // ── Stream response ─────────────────────────────────────
        const response = await sarvamLlm.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: englishQuestion },
        ]);

        const answer = response.content as string;

        // ── Analytics (non-blocking) ────────────────────────────
        const dbAnswerMode = answerMode.startsWith('rag') ? 'rag' : answerMode;
        void supabase.from('chat_sessions').insert({
            user_question: latestMessage,
            english_translation: englishQuestion,
            answer_mode: dbAnswerMode,
            top_similarity: matches[0]?.finalScore || confidence,
            bot_answer: answer,
            user_id: userId || null,
        });

        console.log(`✅ Response complete [${elapsed(requestStart)}] mode=${answerMode} conf=${(confidence * 100).toFixed(0)}%`);
        console.log(`   Stats: ${retrievalStats.totalCandidates} candidates → ${retrievalStats.afterRerank} after rerank | ${retrievalStats.latencyMs.toFixed(0)}ms`);
        console.log(`   Sources: ${retrievalMetadata?.sourcesUsed?.join(', ') || 'none'}`);
        console.log(`${'═'.repeat(60)}\n`);

        return textStreamResponse(answer);

    } catch (error: any) {
        console.error('❌ Chat API Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
