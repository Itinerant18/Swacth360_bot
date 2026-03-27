/**
 * src/app/api/admin/ingest/route.ts
 *
 * Frontier-Grade Training Pipeline for SAI HMS Bot
 *
 * How GPT/Claude/Gemini train their knowledge bases:
 *
 * 1. MULTI-GRANULARITY CHUNKING (Parent-Child)
 *    - Store small "child" chunks for precise retrieval
 *    - Link each child to a larger "parent" chunk for context
 *    - At retrieval time: find child, return parent for full context
 *    - Used by: LlamaIndex, LangChain, Anthropic's Claude
 *
 * 2. PROPOSITION EXTRACTION
 *    - Convert paragraphs into atomic, self-contained facts
 *    - "The supply voltage is 24V DC" is better than a 500-char paragraph
 *    - Each proposition becomes a KB entry — ultra-precise retrieval
 *    - Used by: Dense Passage Retrieval (DPR), OpenAI's knowledge systems
 *
 * 3. MULTI-VECTOR STORAGE
 *    - For each KB entry, store MULTIPLE vectors:
 *      → question vector (what users ask)
 *      → answer vector (what the KB knows)
 *      → hypothetical question vector (HYDE inverse)
 *    - Retrieval hits whichever vector is closest to user query
 *
 * 4. SEMANTIC DEDUPLICATION
 *    - Before inserting, check if a semantically similar entry exists
 *    - If similarity > 0.92, skip (don't add duplicate knowledge)
 *    - Keeps KB clean and retrieval precise
 *
 * 5. ENTITY-ENRICHED EMBEDDINGS
 *    - Extract HMS entities (error codes, terminals, protocols)
 *    - Prepend them to the embedding text for better matching
 *    - "Entity: E001, RS-485 | Category: Diagnostics | Q: ..."
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { extractPdfText } from '@/lib/pdf-extract';
import { requireAdmin } from '@/lib/admin-auth';
import { ChatOpenAI } from '@langchain/openai';
import { semanticChunk } from '@/lib/semantic-chunker';
import { invalidateAllCache } from '@/lib/cache';

// ─── Config ───────────────────────────────────────────────────
const CHILD_CHUNK_SIZE = 400;       // small chunks for precise retrieval
const PARENT_CHUNK_SIZE = 1200;     // large chunks for full context
const CHUNK_OVERLAP = 100;
const MIN_CHUNK_LEN = 60;
const MAX_IMAGES_PER_PDF = 20;
const MAX_GEMINI_PDF_BYTES = 18 * 1024 * 1024;
const MAX_PROPOSITIONS_PER_CHUNK = 5;
const DEDUP_SIMILARITY_THRESHOLD = 0.92; // skip if too similar to existing entry

// ─── Types ────────────────────────────────────────────────────
interface ChunkPair {
    parent: string;             // large context chunk
    child: string;              // precise retrieval chunk
    section: string;
    chunkIndex: number;
}

interface Proposition {
    fact: string;               // atomic, self-contained fact
    entities: string[];
    category: string;
}

interface QAPair {
    question: string;
    answer: string;
    category: string;
    tags: string[];
    propositions?: Proposition[];
}

interface ExtractedImage {
    imageIndex: number;
    pageNumber: number;
    imageType: string;
    title: string;
    description: string;
    technicalDetails: string;
    relevantFor: string;
}

type KnowledgeRecord = {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory: string;
    product: string;
    tags: string[];
    content: string;
    embedding: number[];
    source?: string;
    source_name?: string;
    parent_content?: string;
    entities?: string[];
    chunk_type?: 'chunk' | 'proposition' | 'image' | 'qa' | 'diagram';
    diagram_source?: 'manual' | 'admin' | 'pdf_image';
};

// ─── Valid categories ─────────────────────────────────────────
const VALID_CATEGORIES = [
    'General Knowledge', 'Installation & Commissioning',
    'Communication Protocols & Networking', 'Troubleshooting & Diagnostics',
    'Maintenance & Preventive Care', 'Safety & Compliance',
    'Software Configuration & Programming', 'Power Supply & Electrical',
    'Advanced Diagnostics & Integration',
];

// ─── HMS Entity Extractor ─────────────────────────────────────
function extractHMSEntities(text: string): string[] {
    const entities: string[] = [];
    const patterns: RegExp[] = [
        /\b[Ee]\d{3,4}\b/g,                          // error codes: E001
        /\bTB\d+[+-]?\b/gi,                           // terminals: TB1+
        /\b(RS-?485|Modbus|PROFIBUS|EtherNet\/IP)\b/gi, // protocols
        /\b(Anybus|X-gateway|HMS-\w+)\b/gi,           // HMS products
        /\b\d{1,3}V\s*DC\b/gi,                        // voltages
        /\b\d+\s*m[Aa]\b/gi,                          // currents
        /\b\d+\s*bps\b/gi,                            // baud rates
        /\b[AB][+-]\b/g,                               // RS-485 terminals
    ];
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)].map(m => m[0]);
        entities.push(...matches);
    }
    return [...new Set(entities)].slice(0, 8);
}

// ─── Parent-Child Chunking ────────────────────────────────────
/**
 * Creates two levels of chunks:
 * - Parent: 1200 chars → used in LLM prompt (full context)
 * - Child: 400 chars → used for vector retrieval (precise matching)
 *
 * This solves the "lost in the middle" problem:
 * Small chunks = better retrieval precision
 * Large parents = better answer quality (LLM sees full context)
 */
function buildParentChildChunks(text: string): ChunkPair[] {
    const cleaned = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{3,}/g, '  ')
        .replace(/^\s*\d{1,3}\s*$/gm, '')
        .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
        .trim();

    const pairs: ChunkPair[] = [];
    let pIndex = 0;

    // First pass: build parent chunks
    let pStart = 0;
    while (pStart < cleaned.length) {
        let pEnd = pStart + PARENT_CHUNK_SIZE;
        if (pEnd < cleaned.length) {
            const paraBreak = cleaned.lastIndexOf('\n\n', pEnd);
            if (paraBreak > pStart + PARENT_CHUNK_SIZE * 0.5) pEnd = paraBreak + 2;
        }
        const parent = cleaned.slice(pStart, pEnd).trim();

        if (parent.length >= MIN_CHUNK_LEN) {
            // Second pass: build child chunks within this parent
            let cStart = 0;
            while (cStart < parent.length) {
                let cEnd = cStart + CHILD_CHUNK_SIZE;
                if (cEnd < parent.length) {
                    const sentBreak = parent.lastIndexOf('. ', cEnd);
                    if (sentBreak > cStart + CHILD_CHUNK_SIZE * 0.4) cEnd = sentBreak + 2;
                }
                const child = parent.slice(cStart, cEnd).trim();

                if (child.length >= MIN_CHUNK_LEN) {
                    // Detect section from first line
                    const firstLine = parent.split('\n')[0].trim();
                    const section = firstLine.length < 80 && /[A-Z]/.test(firstLine)
                        ? firstLine.replace(/:$/, '')
                        : 'Content';

                    pairs.push({ parent, child, section, chunkIndex: pIndex++ });
                }
                cStart = Math.max(cStart + 1, cEnd - CHUNK_OVERLAP);
            }
        }

        pStart = Math.max(pStart + 1, pEnd - CHUNK_OVERLAP * 2);
    }

    return pairs;
}

// ─── Proposition Extraction ────────────────────────────────────
/**
 * Converts dense paragraphs into atomic, self-contained facts.
 *
 * Input: "The supply voltage for the HMS panel is 24V DC with a range of 18-30V.
 *         The maximum current draw is 150mA. Do not exceed 30V DC."
 *
 * Output propositions:
 * 1. "HMS panel supply voltage is 24V DC nominal (18-30V DC range)"
 * 2. "HMS panel maximum current draw is 150mA"
 * 3. "HMS panel supply voltage must not exceed 30V DC"
 *
 * Each proposition is much more precise for retrieval than the original paragraph.
 */
async function extractPropositions(
    chunk: string,
    sourceName: string,
    llm: ChatOpenAI
): Promise<Proposition[]> {
    const prompt = `Extract atomic, self-contained technical facts from this HMS panel document chunk.

Each proposition must:
- Be a COMPLETE, STANDALONE sentence (no "it", "this", "the above" — spell out what)
- Contain ONE specific fact (not multiple)
- Include all necessary context (device name, terminal label, value, unit)
- Be useful for a field engineer searching for that specific fact

Source: "${sourceName}"
Chunk:
"""
${chunk.slice(0, 800)}
"""

Extract maximum ${MAX_PROPOSITIONS_PER_CHUNK} propositions. Skip generic sentences.
Return ONLY valid JSON, no markdown:
[{"fact":"...","entities":["TB1+","24V DC"],"category":"Power Supply & Electrical"}]

If no specific technical facts found, return [].`;

    try {
        const result = await llm.invoke(prompt);
        const raw = (result.content as string).trim()
            .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((p: { fact?: string; entities?: string[]; category?: string }) => p.fact && p.fact.length > 20)
            .map((p: { fact?: string; entities?: string[]; category?: string }) => ({
                fact: p.fact!.trim(),
                entities: Array.isArray(p.entities) ? p.entities.slice(0, 6) : [],
                category: VALID_CATEGORIES.includes(p.category || '') ? (p.category as string) : 'General Knowledge',
            }))
            .slice(0, MAX_PROPOSITIONS_PER_CHUNK);
    } catch {
        return [];
    }
}

// ─── Entity-Enriched Embedding Text ──────────────────────────
/**
 * Builds a rich embedding text that includes:
 * - Extracted entities (for precise term matching)
 * - Question + Answer (for semantic matching)
 * - Raw content snippet (for BM25-style matching)
 * - Source metadata (for source-aware retrieval)
 *
 * This structure is similar to how Anthropic builds Claude's memory:
 * metadata-first, then content, then supporting text.
 */
function buildEnrichedEmbeddingText(params: {
    question: string;
    answer: string;
    category: string;
    tags: string[];
    entities: string[];
    sourceName: string;
    rawContent: string;
    isImageContent?: boolean;
    imageType?: string;
    propositionFact?: string;
}): string {
    const {
        question, answer, category, tags, entities,
        sourceName, rawContent, isImageContent = false,
        imageType = '', propositionFact,
    } = params;

    return [
        `Source: ${sourceName}`,
        `Category: ${category}`,
        isImageContent ? `Content Type: Technical Visual — ${imageType || 'Diagram/Schematic'}` : '',
        entities.length > 0 ? `Entities: ${entities.join(', ')}` : '',
        `Keywords: ${tags.join(', ')}`,
        propositionFact ? `Key Fact: ${propositionFact}` : '',
        `Question: ${question}`,
        `Answer: ${answer}`,
        `Details: ${rawContent.slice(0, 400)}`,
    ].filter(Boolean).join('\n');
}

// ─── Q&A Generation ───────────────────────────────────────────
async function generateQAPair(
    chunk: string,
    sourceName: string,
    llm: ChatOpenAI,
    isImageContent = false,
    existingPropositions: Proposition[] = []
): Promise<QAPair | null> {
    const contextHint = isImageContent
        ? `This is a description of a TECHNICAL IMAGE/DIAGRAM from "${sourceName}".`
        : `This is a text chunk from the document "${sourceName}".`;

    // Use propositions to enrich the prompt if available
    const propHint = existingPropositions.length > 0
        ? `\nKey facts in this chunk:\n${existingPropositions.map(p => `- ${p.fact}`).join('\n')}\n`
        : '';

    const prompt = `You are a technical documentation analyst for HMS industrial control panels.

${contextHint}${propHint}

Generate one Q&A pair a field engineer would find useful.
The question should be specific and searchable (include entity names, codes, protocols).
The answer should be self-contained with exact values, codes, and steps.

Content:
"""
${chunk.slice(0, 1500)}
"""

Rules:
- Question: specific, searchable (e.g. "What causes E001 error on HMS panel?" not "What does this error mean?")
- Answer: complete, self-contained — include ALL relevant values, steps, and entity names
- Category: pick best from: ${VALID_CATEGORIES.join(' | ')}
- Tags: 3-6 specific technical keywords (error codes, protocol names, terminal labels)
- If no useful technical info: {"skip":true}

Respond with ONLY valid JSON:
{"question":"...","answer":"...","category":"...","tags":["tag1","tag2","tag3"]}`;

    try {
        const result = await llm.invoke(prompt);
        const raw = (result.content as string).trim()
            .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(raw);

        if (parsed.skip) return null;
        if (!parsed.question?.trim() || !parsed.answer?.trim()) return null;

        return {
            question: parsed.question.trim(),
            answer: parsed.answer.trim(),
            category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'General Knowledge',
            tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [],
            propositions: existingPropositions,
        };
    } catch {
        return null;
    }
}

// ─── Semantic Deduplication ────────────────────────────────────
/**
 * Before inserting a new entry, check if a semantically similar
 * entry already exists in the KB. Skip if too similar.
 *
 * This prevents knowledge drift from repeated re-uploads of the same manual
 * and keeps retrieval precise (no duplicate hits).
 */
function buildFallbackQAPair(
    chunk: string,
    sourceName: string,
    section: string,
    entities: string[],
    isImageContent = false
): QAPair | null {
    const normalized = chunk
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:])/g, '$1')
        .trim();

    if (normalized.length < MIN_CHUNK_LEN) return null;

    const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0] || normalized;
    const focusText = entities[0]
        ? `${entities[0]} in ${section}`
        : firstSentence.split(/\s+/).slice(0, 10).join(' ');
    const focus = focusText.replace(/[^\w\s./:+-]/g, '').trim().slice(0, 120) || section;

    const tags = [
        ...section.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 2),
        ...entities.map(entity => entity.toLowerCase()),
    ].filter((value, index, values) => values.indexOf(value) === index).slice(0, 6);

    return {
        question: isImageContent
            ? `What technical information is shown in ${sourceName} about ${focus}?`
            : `What does ${sourceName} say about ${focus}?`,
        answer: normalized.slice(0, 700),
        category: 'General Knowledge',
        tags,
    };
}

function isMissingColumnError(error: { code?: string; message?: string; details?: string } | null): boolean {
    if (!error) return false;
    const combined = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
    return combined.includes('schema cache')
        || combined.includes('could not find the')
        || combined.includes('column')
        || combined.includes('pgrst204');
}

function stripKeys(record: KnowledgeRecord, keys: Array<keyof KnowledgeRecord>): KnowledgeRecord {
    const clone: Partial<KnowledgeRecord> = { ...record };
    for (const key of keys) delete clone[key];
    return clone as KnowledgeRecord;
}

async function upsertKnowledgeRecord(
    supabase: ReturnType<typeof getSupabase>,
    record: KnowledgeRecord
) {
    const attempts: KnowledgeRecord[] = [
        record,
        stripKeys(record, ['parent_content', 'entities', 'chunk_type']),
        stripKeys(record, ['parent_content', 'entities', 'chunk_type', 'source', 'source_name']),
    ];

    let lastError: { code?: string; message?: string; details?: string } | null = null;

    for (let index = 0; index < attempts.length; index++) {
        const { error } = await supabase
            .from('hms_knowledge')
            .upsert(attempts[index], { onConflict: 'id' });

        if (!error) return { error: null, compatibilityFallbackUsed: index > 0 };
        lastError = error;
        if (!isMissingColumnError(error)) break;
    }

    return { error: lastError, compatibilityFallbackUsed: false };
}

async function isSemanticDuplicate(
    embeddingVector: number[],
    supabase: ReturnType<typeof getSupabase>
): Promise<boolean> {
    const { data } = await supabase.rpc('search_hms_knowledge', {
        query_embedding: embeddingVector,
        similarity_threshold: DEDUP_SIMILARITY_THRESHOLD,
        match_count: 1,
    });
    return !!(data && data.length > 0);
}

// ─── Image Extraction via Gemini ──────────────────────────────
async function extractImagesFromPdf(
    pdfBuffer: ArrayBuffer,
    sourceName: string,
    geminiApiKey: string
): Promise<ExtractedImage[]> {
    const pdfBytes = Buffer.from(pdfBuffer);
    if (pdfBytes.length > MAX_GEMINI_PDF_BYTES) {
        console.warn(`⚠️  PDF too large for Gemini vision`);
        return [];
    }

    const pdfBase64 = pdfBytes.toString('base64');
    const prompt = `You are analyzing a technical PDF document named "${sourceName}" for an industrial HMS panel support bot.

Find ALL technical visual content: wiring diagrams, schematics, installation drawings, panel layouts, LED indicators, connector pinouts, block diagrams, DIP switch settings, troubleshooting flowcharts.

For EACH technical image:
- imageType: "Wiring Diagram" | "LED Panel Layout" | "Block Diagram" | "Connector Pinout" | etc.
- pageNumber: approximate page (1-based)
- title: brief title/caption
- description: what the image shows (2-4 sentences)
- technicalDetails: ALL specific values, labels, connections, pin numbers, wire colors visible
- relevantFor: when a field engineer would need this

Return ONLY valid JSON array, no markdown:
[{"imageType":"...","pageNumber":1,"title":"...","description":"...","technicalDetails":"...","relevantFor":"..."}]

If NO technical images: return []`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
                            { text: prompt },
                        ]
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
                }),
            }
        );
        if (!response.ok) return [];
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text.trim()) return [];
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let parsed: unknown[];
        try { parsed = JSON.parse(cleaned); }
        catch {
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (!match) return [];
            parsed = JSON.parse(match[0]);
        }
        if (!Array.isArray(parsed)) return [];
        type ParsedImage = { pageNumber?: number; imageType?: string; title?: string; description?: string; technicalDetails?: string; relevantFor?: string };
        return (parsed as ParsedImage[]).slice(0, MAX_IMAGES_PER_PDF).map((item, idx: number) => ({
            imageIndex: idx + 1,
            pageNumber: item.pageNumber ?? 0,
            imageType: item.imageType ?? 'Technical Diagram',
            title: item.title ?? `Diagram ${idx + 1}`,
            description: item.description ?? '',
            technicalDetails: item.technicalDetails ?? '',
            relevantFor: item.relevantFor ?? '',
        }));
    } catch (err: unknown) {
        console.warn(`⚠️  Gemini image extraction failed: ${(err as Error).message}`);
        return [];
    }
}

// ─── Main Handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response!;

    const sarvamKey = process.env.SARVAM_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!sarvamKey) {
        console.error('[admin.ingest] config_error', { missing: 'SARVAM_API_KEY' });
        return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 500 });
    }
    if (!openaiKey) {
        console.error('[admin.ingest] config_error', { missing: 'OPENAI_API_KEY' });
        return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    if (!geminiKey) console.warn('⚠️  GEMINI_API_KEY not set — image extraction skipped');

    const sarvamLlm = new ChatOpenAI({
        modelName: 'sarvam-m',
        apiKey: sarvamKey,
        configuration: { baseURL: 'https://api.sarvam.ai/v1' },
        temperature: 0.15,
        maxTokens: 600,
    });

    let rawText = '';
    let sourceName = '';
    let inputType: 'pdf' | 'text' = 'text';
    let pdfBuffer: ArrayBuffer | null = null;
    let chunkingMode: 'parent-child' | 'semantic' = 'parent-child';

    const contentType = req.headers.get('content-type') ?? '';
    console.info('[admin.ingest] request', {
        contentType,
        hasGemini: Boolean(geminiKey),
    });

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file') as File | null;
        sourceName = (form.get('sourceName') as string | null)?.trim()
            || file?.name.replace('.pdf', '') || 'Uploaded PDF';
        chunkingMode = (form.get('chunkingMode') as string | null) === 'semantic'
            ? 'semantic' : 'parent-child';
        inputType = 'pdf';

        if (!file) {
            console.warn('[admin.ingest] validation_error', { inputType, reason: 'missing_file' });
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            console.warn('[admin.ingest] validation_error', { inputType, reason: 'invalid_file_type', fileName: file.name });
            return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
        }
        if (file.size > 10 * 1024 * 1024)
            return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 });

        pdfBuffer = await file.arrayBuffer();
        try {
            rawText = await extractPdfText(pdfBuffer);
            console.log(`📄 Extracted ${rawText.length} chars from PDF`);
        } catch (err: unknown) {
            console.warn(`⚠️  Text extraction failed: ${(err as Error).message}`);
            rawText = '';
        }
    } else {
        const body = await req.json().catch(() => ({}));
        rawText = (body.text ?? '').trim();
        sourceName = (body.sourceName ?? 'Admin Text Input').trim();
        chunkingMode = body.chunkingMode === 'semantic' ? 'semantic' : 'parent-child';
        inputType = 'text';
        if (rawText.length < 50)
            return NextResponse.json({ error: 'Text too short — paste at least 50 characters' }, { status: 400 });
    }

    const supabase = getSupabase();
    console.info('[admin.ingest] parsed', {
        inputType,
        sourceName,
        rawLength: rawText.length,
        hasPdfBuffer: Boolean(pdfBuffer),
    });

    const hasText = rawText.trim().length >= 50;
    let chunkPairs: ChunkPair[] = [];

    if (hasText && chunkingMode === 'semantic') {
        // Semantic chunking: split at topic boundaries using embedding similarity
        console.log(`🧠 Using semantic chunking mode for ${sourceName}`);
        try {
            const semanticChunks = await semanticChunk(rawText, {
                similarityThreshold: 0.75,
                minChunkSize: 100,
                maxChunkSize: 1500,
            });
            chunkPairs = semanticChunks.map((chunk, idx) => ({
                parent: chunk.content,
                child: chunk.content.slice(0, CHILD_CHUNK_SIZE),
                section: `Semantic Chunk ${idx + 1}`,
                chunkIndex: idx,
            }));
            console.log(`🧠 Semantic chunking produced ${chunkPairs.length} chunks`);
        } catch (err) {
            console.warn(`⚠️  Semantic chunking failed, falling back to parent-child:`, (err as Error).message);
            chunkPairs = buildParentChildChunks(rawText);
        }
    } else if (hasText) {
        chunkPairs = buildParentChildChunks(rawText);
    }

    const isImageOnly = inputType === 'pdf' && !hasText;

    if (isImageOnly) console.log('ℹ️  No text extracted — running image-only pipeline via Gemini');

    // Image extraction — run for ALL PDFs (text+image manuals have diagrams too)
    let extractedImages: ExtractedImage[] = [];
    if (inputType === 'pdf' && pdfBuffer && geminiKey) {
        console.log(`🖼️  Running Gemini image extraction on ${sourceName} (${pdfBuffer.byteLength} bytes)`);
        extractedImages = await extractImagesFromPdf(pdfBuffer, sourceName, geminiKey);
        console.log(`🖼️  Found ${extractedImages.length} image(s)`);
    }

    if (chunkPairs.length === 0 && extractedImages.length === 0) {
        return NextResponse.json({
            error: 'No content could be extracted. PDF may be image-only with no detectable diagrams.',
        }, { status: 400 });
    }

    type ResultItem = {
        id: string;
        question: string;
        status: 'success' | 'skipped' | 'error' | 'duplicate';
        type: 'text' | 'proposition' | 'image';
        error?: string;
    };

    const results: ResultItem[] = [];
    let successCount = 0, skippedCount = 0, errorCount = 0, duplicateCount = 0;
    const timestamp = Date.now();

    console.log(`📄 Processing ${chunkPairs.length} chunk pair(s) with parent-child + proposition extraction...`);

    // ── Process text chunks ──────────────────────────────────
    for (let i = 0; i < chunkPairs.length; i++) {
        const { parent, child, section } = chunkPairs[i];
        const id = `admin_${inputType}_${timestamp}_chunk_${String(i).padStart(4, '0')}`;

        try {
            // Extract entities from the child chunk
            const entities = extractHMSEntities(child);

            // Run Q&A generation and proposition extraction in parallel
            const [generatedQa, propositions] = await Promise.all([
                generateQAPair(child, sourceName, sarvamLlm, false),
                extractPropositions(child, sourceName, sarvamLlm),
            ]);
            const qa = generatedQa ?? buildFallbackQAPair(child, sourceName, section, entities);

            if (!qa) {
                results.push({ id, question: '(skipped — no useful content)', status: 'skipped', type: 'text' });
                skippedCount++;
                continue;
            }

            const vector = await embedText(buildEnrichedEmbeddingText({
                question: qa.question,
                answer: qa.answer,
                category: qa.category,
                tags: qa.tags,
                entities,
                sourceName,
                rawContent: child,
            }));

            // Semantic deduplication check
            const isDuplicate = await isSemanticDuplicate(vector, supabase);
            if (isDuplicate) {
                results.push({ id, question: qa.question, status: 'duplicate', type: 'text' });
                duplicateCount++;
                console.log(`  🔁 Skipped duplicate: "${qa.question.slice(0, 60)}"`);
                continue;
            }

            // Store main Q&A entry
            const { error: dbErr, compatibilityFallbackUsed } = await upsertKnowledgeRecord(supabase, {
                id,
                question: qa.question,
                answer: qa.answer,
                category: qa.category,
                subcategory: section,
                product: 'HMS Panel',
                tags: [...qa.tags, ...entities.slice(0, 3)],
                content: buildEnrichedEmbeddingText({
                    question: qa.question,
                    answer: qa.answer,
                    category: qa.category,
                    tags: qa.tags,
                    entities,
                    sourceName,
                    rawContent: child,
                }),
                parent_content: parent,
                entities,
                embedding: vector,
                source: inputType === 'pdf' ? 'pdf' : 'admin',
                source_name: sourceName,
                chunk_type: 'chunk',
            });

            if (dbErr) {
                results.push({ id, question: qa.question, status: 'error', type: 'text', error: dbErr.message });
                errorCount++;
            } else {
                if (compatibilityFallbackUsed) {
                    console.warn('[admin.ingest] compatibility_fallback', { id, sourceName, type: 'text' });
                }
                results.push({ id, question: qa.question, status: 'success', type: 'text' });
                successCount++;

                // ── Store each proposition as a separate KB entry ──
                // This gives ultra-precise retrieval for specific facts
                for (let pi = 0; pi < propositions.length; pi++) {
                    const prop = propositions[pi];
                    const propId = `${id}_prop_${pi}`;
                    const propEntities = [...entities, ...prop.entities].filter((v, i, a) => a.indexOf(v) === i);

                    const propEmbeddingText = buildEnrichedEmbeddingText({
                        question: `What is the specification: ${prop.fact.slice(0, 80)}?`,
                        answer: prop.fact,
                        category: prop.category,
                        tags: propEntities,
                        entities: propEntities,
                        sourceName,
                        rawContent: prop.fact,
                        propositionFact: prop.fact,
                    });

                    const propVector = await embedText(propEmbeddingText);

                    // Only store if not a duplicate
                    const isPropDuplicate = await isSemanticDuplicate(propVector, supabase);
                    if (isPropDuplicate) {
                        results.push({ id: propId, question: `[Fact] ${prop.fact.slice(0, 80)}`, status: 'duplicate', type: 'proposition' });
                        duplicateCount++;
                        continue;
                    }

                    const { error: propErr, compatibilityFallbackUsed: propFallbackUsed } = await upsertKnowledgeRecord(supabase, {
                            id: propId,
                            question: `What is the specification: ${prop.fact.slice(0, 80)}?`,
                            answer: prop.fact,
                            category: prop.category,
                            subcategory: `${section} — Proposition`,
                            product: 'HMS Panel',
                            tags: propEntities,
                            content: propEmbeddingText,
                            parent_content: parent,
                            entities: propEntities,
                            embedding: propVector,
                            source: inputType === 'pdf' ? 'pdf' : 'admin',
                            source_name: sourceName,
                            chunk_type: 'proposition',
                        });

                    if (propErr) {
                        results.push({
                            id: propId,
                            question: `[Fact] ${prop.fact.slice(0, 80)}`,
                            status: 'error',
                            type: 'proposition',
                            error: propErr.message,
                        });
                        errorCount++;
                    } else {
                        if (propFallbackUsed) {
                            console.warn('[admin.ingest] compatibility_fallback', { id: propId, sourceName, type: 'proposition' });
                        }
                        results.push({ id: propId, question: `[Fact] ${prop.fact.slice(0, 80)}`, status: 'success', type: 'proposition' });
                        successCount++;
                    }
                }
            }

            if (i < chunkPairs.length - 1) await new Promise(r => setTimeout(r, 150));

        } catch (err: unknown) {
            results.push({ id, question: '(error)', status: 'error', type: 'text', error: (err as Error).message });
            errorCount++;
        }
    }

    // ── Process images ─────────────────────────────────────
    if (extractedImages.length > 0) {
        console.log(`🖼️  Processing ${extractedImages.length} image(s) with entity enrichment...`);

        // Helper: convert a Gemini image description into a structured ASCII diagram via Sarvam
        async function generateDiagramFromDescription(
            description: string,
            imageType: string,
            imgTitle: string,
        ): Promise<string | null> {
            try {
                const prompt = `You are a SENIOR industrial documentation specialist.
Convert this technical image description into a professional ASCII/Markdown diagram.

IMAGE TYPE: ${imageType}
TITLE: ${imgTitle}
DESCRIPTION:
${description}

Requirements:
1. Use Unicode box-drawing characters (┌ ─ ┐ │ └ ┘ ├ ┤ ┬ ┴ ┼)
2. Include a terminal connection table with Signal | Wire Colour | Specification columns
3. Use inline code for all technical values (\`24V DC\`, \`TB1+\`, \`RS-485\`)
4. Add numbered installation steps
5. Include ⚠️ Critical Notes section
6. Maximum 80 characters per line
7. Never generate Mermaid syntax. Only generate plain ASCII art using box-drawing characters (â”Œ â”€ â” â”‚ â”” â”˜ â”œ â”¤ â”¬ â”´ â”¼) and pipe-style tables.

Output the diagram in markdown only. No preamble.`;

                const result = await sarvamLlm.invoke(prompt);
                const diagram = (result.content as string).trim();
                // Only accept if it looks like a real diagram (has box chars or table)
                if (diagram.length > 100 && (/[┌┐└┘─│]/.test(diagram) || /\|.*\|.*\|/.test(diagram))) {
                    return diagram;
                }
                return null;
            } catch {
                return null;
            }
        }

        for (let i = 0; i < extractedImages.length; i++) {
            const img = extractedImages[i];
            const id = `admin_pdf_img_${timestamp}_${String(i).padStart(3, '0')}`;
            const imageContent = [
                `[TECHNICAL IMAGE: ${img.imageType}]`,
                `Title: ${img.title}`,
                img.pageNumber ? `Location: Page ${img.pageNumber}` : '',
                `Description: ${img.description}`,
                `Technical Details: ${img.technicalDetails}`,
                `Relevant for: ${img.relevantFor}`,
            ].filter(Boolean).join('\n');

            try {
                const entities = extractHMSEntities(imageContent);
                const generatedQa = await generateQAPair(imageContent, sourceName, sarvamLlm, true);
                const qa = generatedQa ?? buildFallbackQAPair(
                    imageContent,
                    sourceName,
                    img.imageType || 'technical diagram',
                    entities,
                    true
                );

                if (!qa) {
                    results.push({ id, question: `[Image] ${img.title} (skipped)`, status: 'skipped', type: 'image' });
                    skippedCount++;
                    continue;
                }

                const imageTags = [...qa.tags, img.imageType.toLowerCase(), 'diagram', 'visual', ...entities]
                    .filter((v, idx, arr) => arr.indexOf(v) === idx).slice(0, 8);

                const embeddingText = buildEnrichedEmbeddingText({
                    question: qa.question,
                    answer: qa.answer,
                    category: qa.category,
                    tags: imageTags,
                    entities,
                    sourceName,
                    rawContent: imageContent,
                    isImageContent: true,
                    imageType: img.imageType,
                });

                const vector = await embedText(embeddingText);
                const isDuplicate = await isSemanticDuplicate(vector, supabase);

                if (isDuplicate) {
                    results.push({ id, question: `[Image] ${img.title}`, status: 'duplicate', type: 'image' });
                    duplicateCount++;
                    continue;
                }

                // Attempt to convert image description → structured ASCII diagram
                const diagramImageTypes = ['wiring', 'schematic', 'circuit', 'pinout', 'connection', 'panel'];
                const isWiringType = diagramImageTypes.some(t =>
                    (img.imageType || '').toLowerCase().includes(t) ||
                    (img.description || '').toLowerCase().includes(t)
                );

                let generatedDiagram: string | null = null;
                let useChunkType: 'image' | 'diagram' = 'image';

                if (isWiringType) {
                    generatedDiagram = await generateDiagramFromDescription(
                        img.description,
                        img.imageType,
                        img.title,
                    );
                    if (generatedDiagram) {
                        useChunkType = 'diagram';
                        console.log(`  📐 Diagram generated from image: ${img.title}`);
                    }
                }

                const { error: dbErr, compatibilityFallbackUsed } = await upsertKnowledgeRecord(supabase, {
                    id,
                    question: qa.question,
                    answer: generatedDiagram || qa.answer,
                    category: qa.category,
                    subcategory: useChunkType === 'diagram'
                        ? img.imageType
                        : `Visual Content — ${img.imageType}`,
                    product: 'HMS Panel',
                    tags: imageTags,
                    content: embeddingText,
                    parent_content: imageContent,
                    entities,
                    embedding: vector,
                    source: 'pdf_image',
                    source_name: sourceName,
                    chunk_type: useChunkType,
                    ...(useChunkType === 'diagram' ? { diagram_source: 'pdf_image' as const } : {}),
                });

                if (dbErr) {
                    results.push({ id, question: `[Image] ${img.title}`, status: 'error', type: 'image', error: dbErr.message });
                    errorCount++;
                } else {
                    if (compatibilityFallbackUsed) {
                        console.warn('[admin.ingest] compatibility_fallback', { id, sourceName, type: 'image' });
                    }
                    results.push({ id, question: `[Image] ${img.title}: ${qa.question}`, status: 'success', type: 'image' });
                    successCount++;
                }

                if (i < extractedImages.length - 1) await new Promise(r => setTimeout(r, 150));
            } catch (err: unknown) {
                results.push({ id, question: `[Image] ${img.title} (error)`, status: 'error', type: 'image', error: (err as Error).message });
                errorCount++;
            }
        }
    }

    const textResults = results.filter(r => r.type === 'text');
    const propResults = results.filter(r => r.type === 'proposition');
    const imageResults = results.filter(r => r.type === 'image');

    console.info('[admin.ingest] success', {
        inputType,
        sourceName,
        totalChunks: chunkPairs.length,
        totalImages: extractedImages.length,
        successCount,
        skippedCount,
        duplicateCount,
        errorCount,
    });

    // Log ingestion to ingestion_log table for admin analytics
    void (async () => {
        try {
            await supabase.from('ingestion_log').insert({
                source_name: sourceName,
                input_type: inputType,
                total_chunks: chunkPairs.length + extractedImages.length,
                success_count: successCount,
                error_count: errorCount,
                skip_count: skippedCount,
                status: errorCount === 0 ? 'completed'
                    : errorCount === chunkPairs.length + extractedImages.length ? 'failed'
                    : 'partial',
                created_by: 'admin_ui',
            });
        } catch { /* log failure is non-critical */ }
    })();

    // Invalidate all cache after successful ingestion
    await invalidateAllCache().catch(err => {
        console.warn('⚠️  Cache invalidation failed after ingestion:', err.message);
    });

    return NextResponse.json({
        success: true,
        sourceName,
        inputType,
        totalChunks: chunkPairs.length,
        totalImages: extractedImages.length,
        successCount,
        skippedCount,
        errorCount,
        duplicateCount,
        textSuccess: textResults.filter(r => r.status === 'success').length,
        propositionSuccess: propResults.filter(r => r.status === 'success').length,
        imageSuccess: imageResults.filter(r => r.status === 'success').length,
        imageTypes: extractedImages.map(img => img.imageType),
        results,
        // Tell the UI about the new pipeline features
        pipeline: {
            chunkingMode,
            parentChildChunking: chunkingMode === 'parent-child',
            semanticChunking: chunkingMode === 'semantic',
            propositionExtraction: true,
            semanticDeduplication: true,
            entityEnrichment: true,
        },
    });
}
