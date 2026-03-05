/**
 * src/app/api/chat/route.ts
 *
 * RAG-based chat API for Dexter HMS Panel technical support.
 * Flow: Translate → Diagram Check → Cache → Vector search (RAG) → LLM → Stream
 *
 * NEW: Diagram intent detection — if user asks for a wiring/panel diagram,
 * returns a special JSON response that the UI renders as a markdown diagram card.
 */

import dns from 'node:dns';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { LangChainAdapter } from 'ai';
import { isDiagramRequest } from '@/app/api/diagram/route';

dns.setDefaultResultOrder('ipv4first');

// ─── Configuration ────────────────────────────────────────────
const RAG_HIGH = 0.75;
const RAG_MEDIUM = 0.55;
const LOG_THRESHOLD = 0.60;
const TOP_K = 5;
const SUPABASE_TIMEOUT_MS = 6000;
const MAX_HISTORY_TURNS = 4;

export const maxDuration = 60;

// ─── Response Cache ───────────────────────────────────────────
interface CacheEntry { answer: string; answerMode: string; timestamp: number; }
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 100;
const responseCache = new Map<string, CacheEntry>();

function normalizeCacheKey(text: string): string {
    const stopWords = new Set([
        'how', 'what', 'where', 'when', 'why', 'which', 'who', 'the', 'is', 'are',
        'was', 'were', 'a', 'an', 'and', 'or', 'to', 'in', 'on', 'for', 'of', 'with',
        'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'may', 'might',
        'i', 'my', 'me', 'we', 'you', 'it', 'this', 'that', 'these', 'be', 'been',
        'being', 'have', 'has', 'had', 'not', 'but', 'if', 'then', 'so', 'from',
        'at', 'by', 'about', 'up', 'please', 'tell', 'explain', 'show', 'give',
    ]);
    return text.toLowerCase()
        .replace(/[^a-z0-9\s\u0980-\u09FF]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.has(w))
        .sort()
        .join(' ')
        .trim();
}

function getCached(key: string): CacheEntry | null {
    const e = responseCache.get(key);
    if (!e) return null;
    if (Date.now() - e.timestamp > CACHE_TTL_MS) { responseCache.delete(key); return null; }
    return e;
}

function setCache(key: string, answer: string, answerMode: string) {
    if (responseCache.size >= CACHE_MAX) {
        const oldest = responseCache.keys().next().value;
        if (oldest) responseCache.delete(oldest);
    }
    responseCache.set(key, { answer, answerMode, timestamp: Date.now() });
}

// ─── Helpers ──────────────────────────────────────────────────
function isEnglish(text: string): boolean {
    const ascii = text.replace(/[^a-zA-Z]/g, '').length;
    const total = text.replace(/[\s\d\W]/g, '').length || 1;
    return (ascii / total) > 0.6;
}

function extractKeywords(text: string): string[] {
    const stop = new Set([// Products & Brands
        'whisper', 'zapper', 'healer', 'jarvis', 'isis', 'atum', 'pinnacle',
        'hestia', 'chronos', 'dexter', 'biosmart', 'ravel', 'premier', 'dsc',
        'swatch', 'seple', 'hhmd', 'iris', 'sim7600x',

        // Security & Fire Alarm Concepts
        'intrusion', 'fire', 'tamper', 'silent', 'duress', 'zone', 'arm', 'disarm',
        'bypass', 'isolate', 'trigger', 'alarm', 'hooters', 'siren', 'detector',
        'smoke', 'heat', 'pir', 'magnetic', 'vibration', 'glass', 'relay',

        // Connectivity & Protocols
        'gsm', 'pstn', 'gprs', 'lte', 'network', 'router', 'ethernet', 'wifi',
        'lan', 'ip', 'tcp', 'port', 'dhcp', 'dns', 'apn', 'mqtt', 'sia',
        'contact', 'i2c', 'uart', 'rs232', 'modbus', 'weigand', 'esim', 'mac',

        // Hardware & Components
        'microcontroller', 'smps', 'battery', 'lcd', 'keypad', 'buzzer', 'eeprom',
        'rtc', 'crystal', 'diode', 'transistor', 'optocoupler', 'multiplexer',
        'sensor', 'antenna', 'rfid', 'mifare', 'lens', 'pcb', 'smd',

        // Features & Dashboard Metrics
        'dashboard', 'telemetry', 'heartbeat', 'logs', 'audit', 'password',
        'master', 'delay', 'schedule', 'holiday', 'ota', 'cctv', 'nvr', 'dvr',
        'bacs', 'bas', 'fas', 'ias', 'tls', 'gnss', 'gps', 'uptime',

        // Zapper/Health Specific
        'pulser', 'colloidal', 'silver', 'parasite', 'clarkia', 'tincture',
        'frequency', 'wave', 'copper', 'ions']);
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
        .filter(w => w.length > 2 && !stop.has(w));
}

function rerankWithKeywords(
    matches: { question: string; answer: string; similarity: number; content?: string }[],
    keywords: string[]
): typeof matches {
    if (!keywords.length) return matches;
    return matches
        .map(m => {
            const t = `${m.question} ${m.answer}`.toLowerCase();
            const hits = keywords.filter(kw => t.includes(kw)).length;
            return { ...m, similarity: m.similarity + Math.min(hits * 0.03, 0.12) };
        })
        .sort((a, b) => b.similarity - a.similarity);
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
        console.log(`💬 User: "${latestMessage}"`);

        // ── 1. Cache check (original language) ──────────────
        const bengaliKey = normalizeCacheKey(latestMessage);
        const bengaliCached = getCached(bengaliKey);
        if (bengaliCached) {
            console.log(`⚡ CACHE HIT [original]`);
            const enc = new TextEncoder();
            return new Response(
                new ReadableStream({
                    start(c) {
                        c.enqueue(enc.encode(`0:${JSON.stringify(bengaliCached.answer)}\n`));
                        c.close();
                    }
                }),
                { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            );
        }

        // ── 2. Sarvam AI setup ───────────────────────────────
        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: process.env.SARVAM_API_KEY,
            configuration: { baseURL: 'https://api.sarvam.ai/v1' },
            temperature: 0.05,
            maxTokens: 768,
        });

        // ── 3. Translation ───────────────────────────────────
        const translateStart = performance.now();
        let englishQuestion = latestMessage.trim();
        const inputIsEnglish = isEnglish(latestMessage);

        if (language !== 'en' && !inputIsEnglish) {
            const sourceLang = language === 'hi' ? 'Hindi' : 'Bengali';
            if (conversationHistory) {
                const prompt = PromptTemplate.fromTemplate(
                    `You are a precise English translator.
Translate the ${sourceLang} question to English. Resolve pronouns using context.
Output ONLY the English translation.

Context:
{history}

${sourceLang}: {input}
English:`
                );
                englishQuestion = (await prompt.pipe(sarvamLlm).pipe(new StringOutputParser())
                    .invoke({ history: conversationHistory, input: latestMessage })).trim();
            } else {
                const prompt = PromptTemplate.fromTemplate(
                    `Translate to English. Output ONLY the translation.
${sourceLang}: {input}
English:`
                );
                englishQuestion = (await prompt.pipe(sarvamLlm).pipe(new StringOutputParser())
                    .invoke({ input: latestMessage })).trim();
            }
            console.log(`🗣️  Translated (${sourceLang} -> EN): "${englishQuestion}" [${elapsed(translateStart)}]`);
        } else {
            console.log(`🗣️  Skipped Translation: "${englishQuestion}" [${elapsed(translateStart)}]`);
        }

        // ── 4. Diagram intent check ──────────────────────────
        const { isDiagram, diagramType } = isDiagramRequest(englishQuestion);

        if (isDiagram) {
            console.log(`🖼️  DIAGRAM REQUEST detected — type: ${diagramType}`);

            try {
                const diagramRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/diagram`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: latestMessage,
                        englishQuery: englishQuestion,
                        diagramType,
                        language,
                    }),
                });

                const diagramData = await diagramRes.json();

                if (diagramData.success && diagramData.markdown) {
                    // Log analytics
                    void getSupabase().from('chat_sessions').insert({
                        user_question: latestMessage,
                        english_translation: englishQuestion,
                        answer_mode: 'diagram',
                        top_similarity: diagramData.hasKBContext ? 0.8 : 0.3,
                        user_id: userId || null,
                    });

                    // Return special diagram JSON response
                    // The UI detects this prefix and renders DiagramCard
                    const diagramPayload = JSON.stringify({
                        __type: 'diagram',
                        ...diagramData,
                    });

                    const enc = new TextEncoder();
                    return new Response(
                        new ReadableStream({
                            start(c) {
                                c.enqueue(enc.encode(`0:${JSON.stringify(`DIAGRAM_RESPONSE:${diagramPayload}`)}\n`));
                                c.close();
                            }
                        }),
                        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
                    );
                }
            } catch (diagramErr: any) {
                console.warn(`⚠️  Diagram generation failed: ${diagramErr.message}, falling through to RAG`);
            }
        }

        // ── 5. English cache check ───────────────────────────
        const englishKey = normalizeCacheKey(englishQuestion);
        const englishCached = getCached(englishKey);
        if (englishCached) {
            console.log(`⚡ CACHE HIT [English]`);
            setCache(bengaliKey, englishCached.answer, englishCached.answerMode);
            const enc = new TextEncoder();
            return new Response(
                new ReadableStream({
                    start(c) {
                        c.enqueue(enc.encode(`0:${JSON.stringify(englishCached.answer)}\n`));
                        c.close();
                    }
                }),
                { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
            );
        }

        // ── 6. Vector search (RAG) ───────────────────────────
        const embedStart = performance.now();
        const queryVector = await embedText(englishQuestion);
        console.log(`🔍 Embedding done [${elapsed(embedStart)}]`);

        const searchStart = performance.now();
        const vectorStr = `[${queryVector.join(',')}]`;
        const supabase = getSupabase();

        let answerMode: string = 'general';
        let confidenceTier: 'high' | 'medium' | 'low' = 'low';
        let topSimilarity = 0;
        let contextStr = '';
        let matchedAnswers: { question: string; answer: string; similarity: number }[] = [];

        try {
            const { data: matches, error: searchError } = await Promise.race([
                supabase.rpc('search_hms_knowledge', {
                    query_embedding: vectorStr,
                    similarity_threshold: 0.0,
                    match_count: TOP_K,
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Supabase timed out')), SUPABASE_TIMEOUT_MS)
                ),
            ]) as any;

            console.log(`🗄️  Search done [${elapsed(searchStart)}]`);

            if (!searchError && matches?.length > 0) {
                const keywords = extractKeywords(englishQuestion);
                const reranked = rerankWithKeywords(matches, keywords);
                topSimilarity = reranked[0].similarity;

                if (topSimilarity >= RAG_MEDIUM) {
                    answerMode = 'rag';
                    confidenceTier = topSimilarity >= RAG_HIGH ? 'high' : 'medium';

                    matchedAnswers = reranked
                        .filter((m: any) => m.similarity >= RAG_MEDIUM)
                        .map((m: any) => ({ question: m.question, answer: m.answer, similarity: m.similarity }));

                    contextStr = matchedAnswers
                        .map((m, i) => `[Source ${i + 1} — ${(m.similarity * 100).toFixed(0)}% match]\nQ: ${m.question}\nA: ${m.answer}`)
                        .join('\n\n---\n\n');
                }
            }
        } catch (e: any) {
            console.warn(`⚠️  KB search failed: ${e.message}`);
        }

        console.log(`📊 Similarity: ${topSimilarity.toFixed(4)} | Mode: ${answerMode.toUpperCase()}`);

        // ── 7. Log unknown questions ─────────────────────────
        if (topSimilarity < LOG_THRESHOLD) {
            supabase.rpc('upsert_unknown_question', {
                p_user_question: latestMessage,
                p_english_text: englishQuestion,
                p_top_similarity: topSimilarity,
            }).then(({ error }) => {
                if (error) console.warn('⚠️  Log skipped:', error.message);
            });
        }

        // ── 8. Build RAG/General Prompt ───────────────────────
        const historySection = conversationHistory
            ? `\nPREVIOUS CONVERSATION:\n${conversationHistory}\n`
            : '';

        let prompt: PromptTemplate;
        let promptInputs: Record<string, string>;

        if (answerMode === 'rag') {
            const confidenceInstruction = confidenceTier === 'high'
                ? 'Sources are HIGHLY relevant. Answer directly and confidently.'
                : 'Sources are PARTIALLY relevant. Note if answer may be incomplete.';

            const notFoundMsg = language === 'bn'
                ? "আমার কাছে এই তথ্য নেই। অনুগ্রহ করে HMS প্যানেলের ম্যানুয়াল দেখুন।"
                : language === 'hi'
                    ? "मेरे पास यह जानकारी नहीं है। कृपया HMS पैनल मैनुअल देखें।"
                    : "I do not have this information. Please check the HMS panel manual.";

            prompt = PromptTemplate.fromTemplate(
                `You are an expert technical support agent for the SEPLe HMS/Dexter Panel.
{history}
CONFIDENCE: {confidence}

KNOWLEDGE BASE:
{context}

RULES:
1. Answer ONLY using the knowledge base above.
2. Synthesize multiple sources into one clear answer.
3. Include exact steps, values, and procedures.
4. If sources don't answer: say "${notFoundMsg}"
5. CRITICAL: Write ENTIRE answer in fluent ${langName}.
6. Use numbered steps for procedures. Tables for comparisons.
7. Keep concise: max 200 words.
8. If user is asking about diagrams/wiring and you don't have visual data, suggest they ask "Show wiring diagram for [panel name]"

Question: {question}
${langName} Answer:`);

            promptInputs = {
                history: historySection,
                confidence: confidenceInstruction,
                context: contextStr,
                question: englishQuestion,
            };
        } else {
            prompt = PromptTemplate.fromTemplate(
                `You are an expert in industrial automation, PLCs, SCADA, HMS panels, Modbus, PROFIBUS, EtherNet/IP.
{history}
RULES:
1. Answer using industrial automation expertise.
2. Be specific with concrete steps.
3. If unrelated to HMS panel support, politely decline in ${langName}.
4. CRITICAL: Write ENTIRE answer in fluent ${langName}.
5. Max 200 words.
6. If user asks about a diagram/wiring, suggest: "Try asking: Show me the wiring diagram for [panel name]"

Question: {question}
${langName} Expert Answer:`);

            promptInputs = { history: historySection, question: englishQuestion };
        }

        // ── 9. Stream Response ────────────────────────────────
        const chain = prompt.pipe(sarvamLlm).pipe(new StringOutputParser());
        const stream = await chain.stream(promptInputs);

        const chunks: string[] = [];
        const transformed = new TransformStream<string, string>({
            transform(chunk, ctrl) { chunks.push(chunk); ctrl.enqueue(chunk); },
            flush() {
                const full = chunks.join('');
                setCache(englishKey, full, answerMode);
                setCache(bengaliKey, full, answerMode);
            },
        });

        // Analytics
        void supabase.from('chat_sessions').insert({
            user_question: latestMessage,
            english_translation: englishQuestion,
            answer_mode: answerMode,
            top_similarity: topSimilarity,
            user_id: userId || null,
        }).then(() => { });

        console.log(`⏱️  Pre-LLM: ${elapsed(requestStart)}`);
        console.log(`${'═'.repeat(60)}\n`);

        return LangChainAdapter.toDataStreamResponse(stream.pipeThrough(transformed));

    } catch (error: any) {
        console.error('❌ Chat API Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to process chat request.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}