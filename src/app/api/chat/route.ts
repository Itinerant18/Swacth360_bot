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
import { isDiagramRequest } from '@/app/api/diagram/route';

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
    const confidenceNote = {
        rag_high: `The knowledge base sources are HIGHLY relevant (${(confidence * 100).toFixed(0)}% confidence). Answer confidently and completely.`,
        rag_medium: `The knowledge base sources are RELEVANT (${(confidence * 100).toFixed(0)}% confidence). Synthesize them into a clear answer.`,
        rag_partial: `The knowledge base sources are PARTIALLY relevant (${(confidence * 100).toFixed(0)}% confidence). Use what applies and note if incomplete.`,
        general: `No specific knowledge base match found. Use your general HMS/industrial automation expertise.`,
    }[answerMode] || '';

    const formatInstructions = {
        diagnostic: `For diagnostic questions:
- Lead with the likely cause
- List troubleshooting steps in numbered order
- Include any error codes and their meanings`,
        procedural: `For procedural questions:
- Use numbered steps (1., 2., 3.)
- Include terminal labels, wire colors, voltage values
- Add safety warnings where relevant`,
        factual: `For factual questions:
- Be concise but complete
- Include exact specifications, values, standards
- Use tables if comparing 3+ items`,
        visual: `For visual/diagram questions:
- Describe the diagram structure clearly
- List all connections, terminals, wire colors
- Suggest asking for a specific diagram if helpful`,
        comparative: `For comparative questions:
- Use comparison tables
- Highlight key differences
- Make a clear recommendation if asked`,
        unknown: `Provide helpful HMS/industrial automation information.`,
    }[queryType] || '';

    if (answerMode === 'general') {
        return `You are an expert in HMS industrial panels, PLCs, SCADA, Modbus, PROFIBUS, EtherNet/IP, and industrial automation.
${history}
${confidenceNote}
INSTRUCTIONS:
1. Answer using your industrial automation expertise.
2. Be specific — give concrete steps, values, and procedures.
3. If the question is completely unrelated to HMS panels or industrial automation, politely say so in ${langName}.
4. WRITE THE ENTIRE RESPONSE IN FLUENT ${langName}.
5. Max 250 words. No padding.
6. If this might be a diagram/wiring question, suggest: "Try: Show wiring diagram for [panel name]"
${formatInstructions}
Question: ${query}
${langName} Expert Answer:`;
    }

    return `You are an expert HMS industrial panel technical support agent for SEPLe/Dexter systems.
${history}
${confidenceNote}
KNOWLEDGE BASE SOURCES:
${context}
INSTRUCTIONS:
1. Answer ONLY from the knowledge base sources above — do not hallucinate.
2. Synthesize information across all relevant sources into one clear, complete answer.
3. Include exact values, codes, steps, wire colors, terminal labels where available.
4. ${formatInstructions}
5. If the sources don't fully answer the question, say: "${notFoundMsg}"
6. WRITE THE ENTIRE RESPONSE IN FLUENT ${langName} — not a word of English if the user asked in ${langName !== 'English' ? langName : 'English'}.
7. Keep the response concise: max 250 words. No unnecessary padding.
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
        const { messages, userId, language = 'en' } = await req.json();

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
        if (isDiagram) {
            console.log(`🖼️  DIAGRAM REQUEST — type: ${diagramType}`);
            try {
                const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
                const diagramRes = await fetch(`${baseUrl}/api/diagram`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: latestMessage, englishQuery: englishQuestion, diagramType, language }),
                });
                const diagramData = await diagramRes.json();

                if (diagramData.success && diagramData.markdown) {
                    const supabase = getSupabase();
                    void supabase.from('chat_sessions').insert({
                        user_question: latestMessage,
                        english_translation: englishQuestion,
                        answer_mode: 'diagram',
                        top_similarity: diagramData.hasKBContext ? 0.8 : 0.3,
                        user_id: userId || null,
                    });

                    const payload = JSON.stringify({ __type: 'diagram', ...diagramData });
                    return textStreamResponse(`DIAGRAM_RESPONSE:${payload}`);
                }
            } catch (err: any) {
                console.warn(`⚠️  Diagram failed: ${err.message} — falling through to RAG`);
            }
        }

        // ── Call Frontier RAG Engine ───────────────────────────
        const ragStart = performance.now();
        const ragResult: RAGResult = await retrieve(englishQuestion, sarvamLlm, { useHYDE: true });
        console.log(`🚀 RAG Engine completed [${elapsed(ragStart)}]`);

        const { answerMode, confidence, contextString, matches, queryAnalysis, retrievalStats } = ragResult;

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
            user_id: userId || null,
        });

        console.log(`✅ Response complete [${elapsed(requestStart)}] mode=${answerMode} conf=${(confidence * 100).toFixed(0)}%`);
        console.log(`   Stats: ${retrievalStats.totalCandidates} candidates → ${retrievalStats.afterRerank} after rerank | ${retrievalStats.latencyMs.toFixed(0)}ms`);
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
