/**
 * src/app/api/admin/ingest/route.ts
 *
 * Frontier-Grade Training Pipeline for Dexter HMS Bot
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
import { embedText, embedTexts } from '@/lib/embeddings';
import { extractPdfText } from '@/lib/pdf-extract';
import { ChatOpenAI } from '@langchain/openai';

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
    } catch (err: any) {
        console.warn(`⚠️  Gemini image extraction failed: ${err.message}`);
        return [];
    }
}

// ─── Main Handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const supabase = getSupabase();
    const sarvamKey = process.env.SARVAM_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!sarvamKey) return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 500 });
    if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
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

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file') as File | null;
        sourceName = (form.get('sourceName') as string | null)?.trim()
            || file?.name.replace('.pdf', '') || 'Uploaded PDF';
        inputType = 'pdf';

        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (!file.name.toLowerCase().endsWith('.pdf'))
            return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
        if (file.size > 10 * 1024 * 1024)
            return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 });

        pdfBuffer = await file.arrayBuffer();
        try {
            rawText = await extractPdfText(pdfBuffer);
            console.log(`📄 Extracted ${rawText.length} chars from PDF`);
        } catch (err: any) {
            console.warn(`⚠️  Text extraction failed: ${err.message}`);
            rawText = '';
        }
    } else {
        const body = await req.json().catch(() => ({}));
        rawText = (body.text ?? '').trim();
        sourceName = (body.sourceName ?? 'Admin Text Input').trim();
        inputType = 'text';
        if (rawText.length < 50)
            return NextResponse.json({ error: 'Text too short — paste at least 50 characters' }, { status: 400 });
    }

    const hasText = rawText.trim().length >= 50;
    const chunkPairs = hasText ? buildParentChildChunks(rawText) : [];
    const isImageOnly = inputType === 'pdf' && !hasText;

    if (isImageOnly) console.log('ℹ️  No text extracted — running image-only pipeline via Gemini');

    // Image extraction
    let extractedImages: ExtractedImage[] = [];
    if (inputType === 'pdf' && pdfBuffer && geminiKey) {
        console.log('🖼️  Extracting images via Gemini...');
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
            const [qa, propositions] = await Promise.all([
                generateQAPair(child, sourceName, sarvamLlm, false),
                extractPropositions(child, sourceName, sarvamLlm),
            ]);

            if (!qa) {
                results.push({ id, question: '(skipped — no useful content)', status: 'skipped', type: 'text' });
                skippedCount++;
                continue;
            }

            // Build entity-enriched embedding text
            // KEY DIFFERENCE: we embed the PARENT (full context) but retrieve by CHILD (precise)
            const embeddingText = buildEnrichedEmbeddingText({
                question: qa.question,
                answer: qa.answer,         // answer from Q&A
                category: qa.category,
                tags: qa.tags,
                entities,
                sourceName,
                rawContent: parent,        // ← parent chunk for full context
            });

            const vector = await embedText(embeddingText);

            // Semantic deduplication check
            const isDuplicate = await isSemanticDuplicate(vector, supabase);
            if (isDuplicate) {
                results.push({ id, question: qa.question, status: 'duplicate', type: 'text' });
                duplicateCount++;
                console.log(`  🔁 Skipped duplicate: "${qa.question.slice(0, 60)}"`);
                continue;
            }

            // Store main Q&A entry
            const { error: dbErr } = await supabase.from('hms_knowledge').upsert({
                id,
                question: qa.question,
                answer: qa.answer,
                category: qa.category,
                subcategory: section,
                product: 'HMS Panel',
                tags: [...qa.tags, ...entities.slice(0, 3)],
                content: embeddingText,
                embedding: vector,
                source: inputType === 'pdf' ? 'pdf' : 'admin',
                source_name: sourceName,
                chunk_type: 'chunk',
            });

            if (dbErr) {
                results.push({ id, question: qa.question, status: 'error', type: 'text', error: dbErr.message });
                errorCount++;
            } else {
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
                    if (!isPropDuplicate) {
                        await supabase.from('hms_knowledge').upsert({
                            id: propId,
                            question: `What is the specification: ${prop.fact.slice(0, 80)}?`,
                            answer: prop.fact,
                            category: prop.category,
                            subcategory: `${section} — Proposition`,
                            product: 'HMS Panel',
                            tags: propEntities,
                            content: propEmbeddingText,
                            embedding: propVector,
                            source: inputType === 'pdf' ? 'pdf' : 'admin',
                            source_name: sourceName,
                            chunk_type: 'proposition',
                        });

                        results.push({ id: propId, question: `[Fact] ${prop.fact.slice(0, 80)}`, status: 'success', type: 'proposition' });
                        successCount++;
                    }
                }
            }

            if (i < chunkPairs.length - 1) await new Promise(r => setTimeout(r, 150));

        } catch (err: any) {
            results.push({ id, question: '(error)', status: 'error', type: 'text', error: err.message });
            errorCount++;
        }
    }

    // ── Process images ─────────────────────────────────────
    if (extractedImages.length > 0) {
        console.log(`🖼️  Processing ${extractedImages.length} image(s) with entity enrichment...`);

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
                const qa = await generateQAPair(imageContent, sourceName, sarvamLlm, true);

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

                const { error: dbErr } = await supabase.from('hms_knowledge').upsert({
                    id,
                    question: qa.question,
                    answer: qa.answer,
                    category: qa.category,
                    subcategory: `Visual Content — ${img.imageType}`,
                    product: 'HMS Panel',
                    tags: imageTags,
                    content: embeddingText,
                    embedding: vector,
                    source: 'pdf_image',
                    source_name: sourceName,
                    chunk_type: 'image',
                });

                if (dbErr) {
                    results.push({ id, question: `[Image] ${img.title}`, status: 'error', type: 'image', error: dbErr.message });
                    errorCount++;
                } else {
                    results.push({ id, question: `[Image] ${img.title}: ${qa.question}`, status: 'success', type: 'image' });
                    successCount++;
                }

                if (i < extractedImages.length - 1) await new Promise(r => setTimeout(r, 150));
            } catch (err: any) {
                results.push({ id, question: `[Image] ${img.title} (error)`, status: 'error', type: 'image', error: err.message });
                errorCount++;
            }
        }
    }

    const textResults = results.filter(r => r.type === 'text');
    const propResults = results.filter(r => r.type === 'proposition');
    const imageResults = results.filter(r => r.type === 'image');

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
            parentChildChunking: true,
            propositionExtraction: true,
            semanticDeduplication: true,
            entityEnrichment: true,
        },
    });
}