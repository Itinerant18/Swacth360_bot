/**
 * src/app/api/chat/route.ts
 *
 * RAG-based chat API for Dexter HMS Panel technical support.
 * Flow: Translate → Diagram Check → Cache → Vector search (RAG) → LLM → Stream
 *
 * OPTIMIZATIONS (v2):
 *  - Lower similarity thresholds (calibrated for OpenAI text-embedding-3-small)
 *  - Query expansion before embedding (appends technical context words)
 *  - Hybrid reranking: vector similarity + keyword overlap + BM25-style term boost
 *  - Robust Supabase RPC call (proper vector casting)
 *  - Smarter cache key (preserves domain terms, not just sorts)
 *  - Partial-match fallback: if top-1 >= RAG_LOW, use it with a "partial" flag
 *  - Better prompt engineering: confidence-aware, source-cited answers
 *  - Logging improvements: logs answer mode + similarity for every request
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
// Calibrated for OpenAI text-embedding-3-small.
// Cosine similarity rarely exceeds 0.85 even for near-identical text.
// 0.45 captures correct answers that are phrased differently.
const RAG_HIGH = 0.65;   // Very confident — answer directly
const RAG_MEDIUM = 0.50;   // Confident — answer with sources
const RAG_LOW = 0.38;   // Partial — answer with caveat
const LOG_UNKNOWN = 0.45;   // Log to unknown_questions below this
const TOP_K = 7;      // Fetch more candidates, rerank to top 3
const SUPABASE_TIMEOUT_MS = 8000;
const MAX_HISTORY_TURNS = 4;

// ─── Response Cache ───────────────────────────────────────────
interface CacheEntry { answer: string; answerMode: string; timestamp: number; }
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 200;
const responseCache = new Map<string, CacheEntry>();

/**
 * Cache key: preserve technical domain terms in order (NOT sorted).
 * Sorting "E001 error code" and "error code E001" to the same key is correct,
 * but we preserve the domain terms intact so "RS-485" ≠ "485 RS".
 */
function normalizeCacheKey(text: string): string {
    const stopWords = new Set([
        'how', 'what', 'where', 'when', 'why', 'which', 'who', 'the', 'is', 'are', 'was', 'were',
        'a', 'an', 'and', 'or', 'to', 'in', 'on', 'for', 'of', 'with', 'do', 'does', 'did', 'can',
        'could', 'will', 'would', 'should', 'may', 'might', 'i', 'my', 'me', 'we', 'you', 'it',
        'this', 'that', 'these', 'be', 'been', 'being', 'have', 'has', 'had', 'not', 'but', 'if',
        'then', 'so', 'from', 'at', 'by', 'about', 'up', 'please', 'tell', 'explain', 'show',
        'give', 'me', 'us', 'your', 'our',
    ]);
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s\u0980-\u09FF\u0900-\u097F]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !stopWords.has(w))
        .join(' ')   // keep order — "e001 error" ≠ "error general"
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

// ─── Language detection ───────────────────────────────────────
function isEnglish(text: string): boolean {
    const ascii = text.replace(/[^a-zA-Z]/g, '').length;
    const total = text.replace(/[\s\d\W]/g, '').length || 1;
    return (ascii / total) > 0.6;
}

// ─── Query Expansion ──────────────────────────────────────────
/**
 * Expands the user query with HMS-domain context before embedding.
 * This dramatically improves recall because KB entries have rich
 * "Source: / Category: / Keywords:" prefixes that short queries miss.
 *
 * Example: "E001 error" → "E001 error HMS panel fault code troubleshooting"
 */
const DOMAIN_EXPANSIONS: [RegExp, string][] = [
    [/\be\d{3,4}\b/i, 'error code fault alarm troubleshooting'],
    [/rs.?485|modbus/i, 'communication protocol wiring terminal RS-485 connection'],
    [/wir|termin|connect/i, 'wiring terminal connection installation commissioning'],
    [/power|voltage|supply|psu/i, 'power supply electrical voltage wiring'],
    [/install|commission|mount/i, 'installation commissioning procedure steps'],
    [/fault|alarm|error|led/i, 'troubleshooting diagnostics fault alarm indicator'],
    [/profibus|ethernet|network/i, 'communication protocol networking bus topology'],
    [/anybus|gateway|x-gateway/i, 'HMS Anybus gateway protocol converter'],
    [/configuration|config|setting/i, 'software configuration programming setup'],
    [/safety|warning|hazard/i, 'safety compliance warning precaution'],
    [/maintain|service|clean/i, 'maintenance preventive care service'],
];

function expandQuery(query: string): string {
    const lower = query.toLowerCase();
    const expansions: string[] = [];

    for (const [pattern, expansion] of DOMAIN_EXPANSIONS) {
        if (pattern.test(lower)) {
            expansions.push(expansion);
        }
    }

    // Always append HMS context so embeddings align with KB entry format
    const base = `HMS panel technical support: ${query}`;
    return expansions.length > 0
        ? `${base} | ${expansions.slice(0, 3).join(' | ')}`
        : base;
}

// ─── Keyword Extraction & Reranking ───────────────────────────
function extractKeywords(text: string): string[] {
    // Keep technical terms: error codes, product names, acronyms, numbers
    const techPattern = /\b([a-z]{1,3}\d+|\d+[a-z]{0,3}|rs-?\d+|[a-z]{2,}bus|anybus|modbus|profibus|[a-z]{2,}net)\b/gi;
    const techTerms = [...text.matchAll(techPattern)].map(m => m[1].toLowerCase());

    const stop = new Set([
        'how', 'what', 'where', 'when', 'why', 'the', 'is', 'are', 'was', 'a', 'an', 'and', 'or',
        'to', 'in', 'on', 'for', 'of', 'with', 'do', 'does', 'did', 'can', 'will', 'i', 'my',
        'me', 'we', 'you', 'it', 'this', 'that', 'be', 'have', 'not', 'but', 'if', 'so', 'from',
    ]);

    const generalTerms = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stop.has(w));

    return [...new Set([...techTerms, ...generalTerms])];
}

interface KBMatch {
    id: string;
    question: string;
    answer: string;
    category: string;
    content: string;
    source: string;
    source_name: string;
    similarity: number;
}

function rerankWithKeywords(matches: KBMatch[], keywords: string[]): KBMatch[] {
    if (!keywords.length) return matches;

    return matches
        .map(m => {
            const searchable = `${m.question} ${m.answer} ${m.content || ''}`.toLowerCase();

            // Count exact keyword hits (weighted by term specificity)
            let boost = 0;
            for (const kw of keywords) {
                if (searchable.includes(kw)) {
                    // Longer/rarer terms get higher boost
                    boost += kw.length > 4 ? 0.05 : 0.02;
                }
            }

            // Bonus: question text directly mentions the query topic
            const questionMatch = keywords.filter(kw => m.question.toLowerCase().includes(kw)).length;
            boost += questionMatch * 0.04;

            return { ...m, similarity: Math.min(m.similarity + boost, 0.99) };
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
        console.log(`💬 User [${language}]: "${latestMessage}"`);

        // ── 1. Cache check (original language) ────────────────────
        const originalKey = normalizeCacheKey(latestMessage);
        const originalCached = getCached(originalKey);
        if (originalCached) {
            console.log(`⚡ CACHE HIT [original] mode=${originalCached.answerMode}`);
            return textStreamResponse(originalCached.answer);
        }

        // ── 2. Sarvam AI setup ─────────────────────────────────────
        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: process.env.SARVAM_API_KEY,
            configuration: { baseURL: 'https://api.sarvam.ai/v1' },
            temperature: 0.05,
            maxTokens: 768,
        });

        // ── 3. Translation ─────────────────────────────────────────
        const translateStart = performance.now();
        let englishQuestion = latestMessage.trim();
        const inputIsEnglish = isEnglish(latestMessage);

        if (language !== 'en' && !inputIsEnglish) {
            const sourceLang = language === 'hi' ? 'Hindi' : 'Bengali';
            const historyCtx = conversationHistory
                ? `Context:\n${conversationHistory}\n\n`
                : '';
            const prompt = PromptTemplate.fromTemplate(
                `Translate the ${sourceLang} question to English. Resolve pronouns using context. Output ONLY the English translation, nothing else.
${historyCtx}${sourceLang}: {input}
English:`
            );
            englishQuestion = (
                await prompt.pipe(sarvamLlm).pipe(new StringOutputParser())
                    .invoke({ input: latestMessage })
            ).trim();
            console.log(`🗣️  Translated (${sourceLang}→EN): "${englishQuestion}" [${elapsed(translateStart)}]`);
        }

        // ── 4. Diagram intent check ────────────────────────────────
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
                    void getSupabase().from('chat_sessions').insert({
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

        // ── 5. English cache check ─────────────────────────────────
        const englishKey = normalizeCacheKey(englishQuestion);
        const englishCached = getCached(englishKey);
        if (englishCached) {
            console.log(`⚡ CACHE HIT [english] mode=${englishCached.answerMode}`);
            setCache(originalKey, englishCached.answer, englishCached.answerMode);
            return textStreamResponse(englishCached.answer);
        }

        // ── 6. Vector search with query expansion ─────────────────
        const embedStart = performance.now();
        const expandedQuery = expandQuery(englishQuestion);
        const queryVector = await embedText(expandedQuery);
        console.log(`🔍 Embedded (expanded) [${elapsed(embedStart)}]`);
        console.log(`   Original:  "${englishQuestion}"`);
        console.log(`   Expanded:  "${expandedQuery.substring(0, 120)}..."`);

        const searchStart = performance.now();
        const supabase = getSupabase();
        let answerMode = 'general';
        let confidenceTier: 'high' | 'medium' | 'low' | 'partial' = 'low';
        let topSimilarity = 0;
        let contextStr = '';
        let matchedAnswers: KBMatch[] = [];

        try {
            const { data: matches, error: searchError } = await Promise.race([
                supabase.rpc('search_hms_knowledge', {
                    query_embedding: queryVector,   // Pass as array, not string cast
                    similarity_threshold: 0.20,    // Fetch wide net; reranking filters
                    match_count: TOP_K,
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Supabase timeout')), SUPABASE_TIMEOUT_MS)
                ),
            ]) as any;

            console.log(`🗄️  KB search [${elapsed(searchStart)}]`);

            if (searchError) {
                console.warn(`⚠️  KB search error: ${searchError.message}`);
            } else if (matches && matches.length > 0) {
                const keywords = extractKeywords(englishQuestion);
                const reranked = rerankWithKeywords(matches as KBMatch[], keywords);

                topSimilarity = reranked[0].similarity;
                console.log(`📊 Top similarity: ${topSimilarity.toFixed(4)} | Candidates: ${reranked.length} | Keywords: [${keywords.slice(0, 5).join(', ')}]`);

                if (topSimilarity >= RAG_MEDIUM) {
                    answerMode = 'rag';
                    confidenceTier = topSimilarity >= RAG_HIGH ? 'high' : 'medium';

                    matchedAnswers = reranked.filter(m => m.similarity >= RAG_LOW).slice(0, 4);
                    contextStr = matchedAnswers
                        .map((m, i) =>
                            `[Source ${i + 1} — ${(m.similarity * 100).toFixed(0)}% match]\n` +
                            `Q: ${m.question}\nA: ${m.answer}`
                        )
                        .join('\n\n---\n\n');

                } else if (topSimilarity >= RAG_LOW) {
                    // Partial match — use KB but flag low confidence
                    answerMode = 'rag';
                    confidenceTier = 'partial';

                    matchedAnswers = reranked.slice(0, 2);
                    contextStr = matchedAnswers
                        .map((m, i) =>
                            `[Partial Source ${i + 1} — ${(m.similarity * 100).toFixed(0)}% relevance]\n` +
                            `Q: ${m.question}\nA: ${m.answer}`
                        )
                        .join('\n\n---\n\n');

                } else {
                    console.log(`   → Below RAG_LOW (${RAG_LOW}) — using general LLM`);
                }
            } else {
                console.log(`   → No KB matches returned`);
            }
        } catch (e: any) {
            console.warn(`⚠️  KB search failed: ${e.message}`);
        }

        console.log(`📋 Mode: ${answerMode.toUpperCase()} | Confidence: ${confidenceTier} | Similarity: ${topSimilarity.toFixed(4)}`);

        // ── 7. Log unknown questions ───────────────────────────────
        if (topSimilarity < LOG_UNKNOWN) {
            void supabase.rpc('upsert_unknown_question', {
                p_user_question: latestMessage,
                p_english_text: englishQuestion,
                p_top_similarity: topSimilarity,
            }).then(({ error }) => {
                if (error) console.warn('⚠️  Unknown log skipped:', error.message);
                else console.log(`   📝 Logged as unknown (sim=${topSimilarity.toFixed(3)})`);
            });
        }

        // ── 8. Build prompt ────────────────────────────────────────
        const historySection = conversationHistory
            ? `\nCONVERSATION HISTORY:\n${conversationHistory}\n`
            : '';

        const notFoundMessages: Record<string, string> = {
            en: "I don't have specific information about this in my knowledge base. Please consult the HMS panel manual or contact technical support.",
            bn: "আমার কাছে এই বিষয়ে নির্দিষ্ট তথ্য নেই। অনুগ্রহ করে HMS প্যানেলের ম্যানুয়াল দেখুন বা টেকনিক্যাল সাপোর্টে যোগাযোগ করুন।",
            hi: "मेरे पास इस विषय में विशिष्ट जानकारी नहीं है। कृपया HMS पैनल मैनुअल देखें या तकनीकी सहायता से संपर्क करें।",
        };
        const notFoundMsg = notFoundMessages[language as string] || "I don't have this information. Please check the HMS panel manual.";

        let prompt: PromptTemplate;
        let promptInputs: Record<string, string>;

        if (answerMode === 'rag') {
            const confidenceNote = {
                high: `The knowledge base sources are HIGHLY relevant. Answer confidently and completely.`,
                medium: `The knowledge base sources are RELEVANT. Synthesize them into a clear answer.`,
                partial: `The knowledge base sources are PARTIALLY relevant. Use what applies and note if incomplete.`,
                low: ``, // shouldn't reach here in rag mode
            }[confidenceTier];

            prompt = PromptTemplate.fromTemplate(`You are an expert HMS industrial panel technical support agent for SEPLe/Dexter systems.
{history}
CONFIDENCE: {confidence}

KNOWLEDGE BASE SOURCES:
{context}

INSTRUCTIONS:
1. Answer ONLY from the knowledge base sources above — do not hallucinate.
2. Synthesize information across all relevant sources into one clear, complete answer.
3. Include exact values, codes, steps, wire colors, terminal labels where available.
4. For procedures, use numbered steps. For specs, use a table if there are 3+ values.
5. If the sources don't fully answer the question, say: "${notFoundMsg}"
6. WRITE THE ENTIRE RESPONSE IN FLUENT ${langName} — not a word of English if the user asked in ${langName !== 'English' ? langName : 'English'}.
7. Keep the response concise: max 250 words. No unnecessary padding.
8. If this is about diagrams/wiring visuals, suggest: ask "Show wiring diagram for [panel]"

Question: {question}
${langName} Answer:`);

            promptInputs = {
                history: historySection,
                confidence: confidenceNote,
                context: contextStr,
                question: englishQuestion,
            };

        } else {
            // General LLM fallback — still useful for HMS expertise
            prompt = PromptTemplate.fromTemplate(`You are an expert in HMS industrial panels, PLCs, SCADA, Modbus, PROFIBUS, EtherNet/IP, and industrial automation.
{history}
INSTRUCTIONS:
1. Answer using your industrial automation expertise.
2. Be specific — give concrete steps, values, and procedures.
3. If the question is completely unrelated to HMS panels or industrial automation, politely say so in ${langName}.
4. WRITE THE ENTIRE RESPONSE IN FLUENT ${langName}.
5. Max 250 words. No padding.
6. If this might be a diagram/wiring question, suggest: "Try: Show wiring diagram for [panel name]"

Question: {question}
${langName} Expert Answer:`);

            promptInputs = {
                history: historySection,
                question: englishQuestion,
            };
        }

        // ── 9. Stream response ─────────────────────────────────────
        const chain = prompt.pipe(sarvamLlm).pipe(new StringOutputParser());
        const stream = await chain.stream(promptInputs);

        const chunks: string[] = [];
        const transformed = new TransformStream<string, string>({
            transform(chunk, ctrl) {
                chunks.push(chunk);
                ctrl.enqueue(chunk);
            },
            flush() {
                const full = chunks.join('');
                setCache(englishKey, full, answerMode);
                setCache(originalKey, full, answerMode);
                console.log(`✅ Response streamed [${elapsed(requestStart)}] mode=${answerMode} len=${full.length}`);
            },
        });

        // Analytics (non-blocking)
        void supabase.from('chat_sessions').insert({
            user_question: latestMessage,
            english_translation: englishQuestion,
            answer_mode: answerMode,
            top_similarity: topSimilarity,
            user_id: userId || null,
        });

        console.log(`⏱️  Pre-LLM total: ${elapsed(requestStart)}`);
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

// ─── Helper: return a simple streaming text response ──────────
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