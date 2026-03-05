/**
 * src/app/api/admin/ingest/route.ts
 *
 * PDF/Text Ingestion Pipeline — Enhanced with Image Extraction
 *
 * TWO-PIPELINE APPROACH:
 *
 * Pipeline 1 — Text  (existing, unchanged)
 *   PDF text → 800-char chunks → Sarvam AI Q&A → OpenAI embed → Supabase
 *
 * Pipeline 2 — Images (NEW)
 *   PDF → Gemini 2.0 Flash vision → identifies every technical diagram/schematic/chart
 *   → structured image descriptions → Sarvam AI Q&A → OpenAI embed → Supabase
 *   (stored with source='pdf_image', subcategory='Visual Content — [type]')
 *
 * The Karpathy insight: every piece of knowledge must be represented as a vector.
 * Text embeddings only capture text. Images carry wiring diagrams, installation
 * schematics, panel layouts — information that text alone never contains.
 *
 * No new npm dependencies needed — uses Gemini REST API directly via fetch.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { ChatOpenAI } from '@langchain/openai';



// ─── Config ───────────────────────────────────────────────────
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const MIN_CHUNK_LEN = 80;

// Max images to extract per PDF (Gemini finds them, we process top N)
const MAX_IMAGES_PER_PDF = 20;

// Max PDF size for Gemini inline vision (bytes) — Gemini supports up to ~20MB inline
const MAX_GEMINI_PDF_BYTES = 18 * 1024 * 1024;

// ─── Text Chunker ─────────────────────────────────────────────
function chunkText(raw: string): string[] {
    const text = raw
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{3,}/g, '  ')
        .replace(/^\s*\d{1,3}\s*$/gm, '')
        .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
        .trim();

    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        let end = start + CHUNK_SIZE;
        if (end < text.length) {
            const paraBreak = text.lastIndexOf('\n\n', end);
            const sentBreak = text.lastIndexOf('. ', end);
            if (paraBreak > start + CHUNK_SIZE * 0.5) end = paraBreak + 2;
            else if (sentBreak > start + CHUNK_SIZE * 0.5) end = sentBreak + 2;
        }
        const chunk = text.slice(start, end).trim();
        if (chunk.length >= MIN_CHUNK_LEN) chunks.push(chunk);
        start = Math.max(start + 1, end - CHUNK_OVERLAP);
    }
    return chunks;
}

// ─── Q&A Generation via Sarvam AI ────────────────────────────
interface QAPair {
    question: string;
    answer: string;
    category: string;
    tags: string[];
}

const VALID_CATEGORIES = [
    'General Knowledge',
    'Installation & Commissioning',
    'Communication Protocols & Networking',
    'Troubleshooting & Diagnostics',
    'Maintenance & Preventive Care',
    'Safety & Compliance',
    'Software Configuration & Programming',
    'Power Supply & Electrical',
    'Advanced Diagnostics & Integration',
];

async function generateQAPair(
    chunk: string,
    sourceName: string,
    llm: ChatOpenAI,
    isImageContent = false
): Promise<QAPair | null> {
    const contextHint = isImageContent
        ? `This is a description of a TECHNICAL IMAGE/DIAGRAM from "${sourceName}".
           The image shows visual technical content such as wiring diagrams, installation
           schematics, panel layouts, connector pinouts, LED indicators, or similar.`
        : `This is a text chunk from the document "${sourceName}".`;

    const prompt = `You are a technical documentation analyst for HMS industrial control panels.

${contextHint}

Generate one Q&A pair a field engineer would find useful about this content.

Content:
"""
${chunk.substring(0, 1500)}
"""

Rules:
- Question: natural language a real user would ask (e.g. "What does the wiring diagram show for X?", "How do I interpret the LED panel?")
- Answer: complete, self-contained, specific technical details
- Category: pick best from: ${VALID_CATEGORIES.join(' | ')}
- Tags: 3-5 specific technical keywords
- If this content has no useful technical info: {"skip":true}

Respond with ONLY valid JSON, no markdown:
{"question":"...","answer":"...","category":"...","tags":["tag1","tag2","tag3"]}`;

    try {
        const result = await llm.invoke(prompt);
        const raw = (result.content as string).trim();
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed.skip) return null;
        if (!parsed.question?.trim() || !parsed.answer?.trim()) return null;

        return {
            question: parsed.question.trim(),
            answer: parsed.answer.trim(),
            category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'General Knowledge',
            tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
        };
    } catch {
        return null;
    }
}

// ─── Rich Embedding Text Builder ──────────────────────────────
function buildEmbeddingText(
    qa: QAPair,
    sourceName: string,
    rawContent: string,
    isImageContent = false,
    imageType = ''
): string {
    return [
        `Source: ${sourceName}`,
        `Category: ${qa.category}`,
        isImageContent ? `Content Type: Technical Visual — ${imageType || 'Diagram/Schematic'}` : '',
        `Keywords: ${qa.tags.join(', ')}`,
        `Question: ${qa.question}`,
        `Answer: ${qa.answer}`,
        `Details: ${rawContent.substring(0, 500)}`,
    ].filter(Boolean).join('\n');
}

// ─── PDF Text Extractor ───────────────────────────────────────
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
    // Polyfill missing DOM classes for pdf.js (used by pdf-parse) in Node environment
    if (typeof global !== 'undefined') {
        if (!(global as any).DOMMatrix) (global as any).DOMMatrix = class DOMMatrix { };
        if (!(global as any).ImageData) (global as any).ImageData = class ImageData { };
        if (!(global as any).Path2D) (global as any).Path2D = class Path2D { };
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParseModule = require('pdf-parse');
    const pdfParse = typeof pdfParseModule === 'function'
        ? pdfParseModule
        : (pdfParseModule.PDFParse || pdfParseModule.default);
    const data = await pdfParse(Buffer.from(buffer));
    return data.text;
}

// ─── Gemini Vision: Extract Technical Images from PDF ─────────
/**
 * Sends the entire PDF to Gemini 2.0 Flash vision.
 * Gemini natively understands PDFs — it reads both text AND images.
 * Returns a structured list of all technical visual content found.
 *
 * Why Gemini and not Sarvam?
 * Sarvam AI is text-only. Gemini 2.0 Flash is multimodal — it can see
 * diagrams, schematics, panel layouts, wiring drawings inside PDFs.
 */

interface ExtractedImage {
    imageIndex: number;       // sequential ID
    pageNumber: number;       // page where image appears (if determinable)
    imageType: string;        // e.g. "Wiring Diagram", "Installation Schematic", "LED Panel", "Connector Pinout"
    title: string;            // short title/caption
    description: string;      // full technical description (what the image shows)
    technicalDetails: string; // specific values, labels, connections visible in image
    relevantFor: string;      // use case: "installation", "troubleshooting", etc.
}

async function extractImagesFromPdf(
    pdfBuffer: ArrayBuffer,
    sourceName: string,
    geminiApiKey: string
): Promise<ExtractedImage[]> {
    const pdfBytes = Buffer.from(pdfBuffer);

    // Skip if too large for Gemini inline (use text-only for very large PDFs)
    if (pdfBytes.length > MAX_GEMINI_PDF_BYTES) {
        console.warn(`⚠️  PDF too large for Gemini vision (${(pdfBytes.length / 1024 / 1024).toFixed(1)}MB > 18MB) — skipping image extraction`);
        return [];
    }

    const pdfBase64 = pdfBytes.toString('base64');

    const prompt = `You are analyzing a technical PDF document named "${sourceName}" for an industrial HMS (Hazard Monitoring System) panel support bot.

Your task: Find and describe ALL technical visual content in this PDF.

Look for:
- Wiring diagrams and electrical schematics
- Installation drawings and mounting diagrams
- Panel layouts and component placement diagrams
- LED indicator panels and status light legends
- Connector pinouts and terminal block diagrams
- Block diagrams and system architecture diagrams
- Troubleshooting flowcharts
- Cable routing and connection diagrams
- DIP switch settings tables/diagrams
- PCB layouts
- Safety warning symbols with technical meaning
- Any labeled technical illustration

For EACH technical image/diagram found, provide:
1. imageType: the type of visual (e.g. "Wiring Diagram", "LED Panel Layout", "Connector Pinout", "Installation Schematic")
2. pageNumber: approximate page number (1-based, estimate if unsure)
3. title: brief title or caption of the image
4. description: detailed description of what the image shows (2-4 sentences)
5. technicalDetails: all specific technical information visible: pin numbers, wire colors, voltage levels, component labels, LED names/states, step numbers, measurements, etc.
6. relevantFor: when would a field engineer need this? (e.g. "initial installation", "RS-485 wiring", "fault diagnosis")

If NO technical images are found, return an empty array.

Respond with ONLY valid JSON array, no markdown or explanation:
[
  {
    "imageType": "...",
    "pageNumber": 1,
    "title": "...",
    "description": "...",
    "technicalDetails": "...",
    "relevantFor": "..."
  }
]`;

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            {
                                inline_data: {
                                    mime_type: 'application/pdf',
                                    data: pdfBase64,
                                },
                            },
                            { text: prompt },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192,
                    },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.text();
            console.warn(`⚠️  Gemini vision API error (${response.status}): ${err.substring(0, 200)}`);
            return [];
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

        if (!text.trim()) return [];

        // Parse JSON from Gemini response
        const cleaned = text
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        let parsed: any[];
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            // Try to extract JSON array from mixed text response
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (!match) return [];
            parsed = JSON.parse(match[0]);
        }

        if (!Array.isArray(parsed)) return [];

        return parsed.slice(0, MAX_IMAGES_PER_PDF).map((item: any, idx: number) => ({
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

/** Format an extracted image into rich text for Sarvam Q&A generation */
function formatImageForQA(img: ExtractedImage): string {
    return [
        `[TECHNICAL IMAGE: ${img.imageType}]`,
        `Title: ${img.title}`,
        img.pageNumber ? `Location: Page ${img.pageNumber}` : '',
        ``,
        `Description:`,
        img.description,
        ``,
        `Technical Details (labels, values, connections visible in image):`,
        img.technicalDetails,
        ``,
        `Relevant for: ${img.relevantFor}`,
    ].filter(s => s !== null && s !== undefined).join('\n');
}

// ─── Main Handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const supabase = getSupabase();
    const sarvamKey = process.env.SARVAM_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!sarvamKey)
        return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 500 });
    if (!openaiKey)
        return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    if (!geminiKey)
        console.warn('⚠️  GEMINI_API_KEY not set — image extraction will be skipped');

    // Sarvam for Q&A generation (text + image descriptions)
    const sarvamLlm = new ChatOpenAI({
        modelName: 'sarvam-m',
        apiKey: sarvamKey,
        configuration: { baseURL: 'https://api.sarvam.ai/v1' },
        temperature: 0.2,
        maxTokens: 512,
    });

    let rawText = '';
    let sourceName = '';
    let inputType: 'pdf' | 'text' = 'text';
    let pdfBuffer: ArrayBuffer | null = null;

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file') as File | null;
        sourceName = (form.get('sourceName') as string | null)?.trim() || file?.name.replace('.pdf', '') || 'Uploaded PDF';
        inputType = 'pdf';

        if (!file)
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (!file.name.toLowerCase().endsWith('.pdf'))
            return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
        if (file.size > 10 * 1024 * 1024)
            return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 });

        pdfBuffer = await file.arrayBuffer();

        try {
            rawText = await extractPdfText(pdfBuffer);
        } catch (err: any) {
            return NextResponse.json({ error: `PDF text parsing failed: ${err.message}` }, { status: 400 });
        }

    } else {
        const body = await req.json().catch(() => ({}));
        rawText = (body.text ?? '').trim();
        sourceName = (body.sourceName ?? 'Admin Text Input').trim();
        inputType = 'text';

        if (rawText.length < 50)
            return NextResponse.json({ error: 'Text too short — paste at least 50 characters' }, { status: 400 });
    }

    if (!rawText || rawText.trim().length < 50)
        return NextResponse.json({ error: 'No usable text extracted from file' }, { status: 400 });

    // ── Pipeline 1: Text Chunks ────────────────────────────────
    const chunks = chunkText(rawText);
    if (chunks.length === 0)
        return NextResponse.json({ error: 'Could not extract any usable text chunks' }, { status: 400 });

    // ── Pipeline 2: Image Extraction (PDF only, Gemini vision) ─
    let extractedImages: ExtractedImage[] = [];
    if (inputType === 'pdf' && pdfBuffer && geminiKey) {
        console.log(`🖼️  Extracting technical images from PDF via Gemini vision...`);
        extractedImages = await extractImagesFromPdf(pdfBuffer, sourceName, geminiKey);
        console.log(`🖼️  Found ${extractedImages.length} technical image(s)`);
    }

    // ── Process all chunks + images ────────────────────────────
    type ResultItem = {
        id: string;
        question: string;
        status: 'success' | 'skipped' | 'error';
        type: 'text' | 'image';
        error?: string;
    };

    const results: ResultItem[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const timestamp = Date.now();

    // ── Process text chunks ────────────────────────────────────
    console.log(`📄 Processing ${chunks.length} text chunk(s)...`);
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = `admin_${inputType}_${timestamp}_text_${String(i).padStart(4, '0')}`;

        try {
            const qa = await generateQAPair(chunk, sourceName, sarvamLlm, false);
            if (!qa) {
                results.push({ id, question: '(skipped — no useful content)', status: 'skipped', type: 'text' });
                skippedCount++;
                continue;
            }

            const embeddingText = buildEmbeddingText(qa, sourceName, chunk, false);
            const vector = await embedText(embeddingText);

            const { error: dbErr } = await supabase.from('hms_knowledge').upsert({
                id,
                question: qa.question,
                answer: qa.answer,
                category: qa.category,
                subcategory: 'Admin Ingested — Text',
                product: 'HMS Panel',
                tags: qa.tags,
                content: embeddingText,
                embedding: vector,
                source: inputType === 'pdf' ? 'pdf' : 'admin',
                source_name: sourceName,
            });

            if (dbErr) {
                results.push({ id, question: qa.question, status: 'error', type: 'text', error: dbErr.message });
                errorCount++;
            } else {
                results.push({ id, question: qa.question, status: 'success', type: 'text' });
                successCount++;
            }

            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));

        } catch (err: any) {
            results.push({ id, question: '(error)', status: 'error', type: 'text', error: err.message });
            errorCount++;
        }
    }

    // ── Process extracted images ───────────────────────────────
    if (extractedImages.length > 0) {
        console.log(`🖼️  Processing ${extractedImages.length} image description(s)...`);

        for (let i = 0; i < extractedImages.length; i++) {
            const img = extractedImages[i];
            const id = `admin_pdf_img_${timestamp}_${String(i).padStart(3, '0')}`;
            const imageContent = formatImageForQA(img);

            try {
                // Generate Q&A specifically for image content
                const qa = await generateQAPair(imageContent, sourceName, sarvamLlm, true);
                if (!qa) {
                    results.push({ id, question: `[Image] ${img.title} (skipped)`, status: 'skipped', type: 'image' });
                    skippedCount++;
                    continue;
                }

                // Enhance tags with image-specific terms
                const imageTags = [
                    ...qa.tags,
                    img.imageType.toLowerCase(),
                    'diagram',
                    'visual',
                ].filter((v, idx, arr) => arr.indexOf(v) === idx).slice(0, 8);

                const embeddingText = buildEmbeddingText(
                    { ...qa, tags: imageTags },
                    sourceName,
                    imageContent,
                    true,
                    img.imageType
                );
                const vector = await embedText(embeddingText);

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
                });

                if (dbErr) {
                    results.push({ id, question: `[Image] ${img.title}`, status: 'error', type: 'image', error: dbErr.message });
                    errorCount++;
                } else {
                    results.push({ id, question: `[Image] ${img.title}: ${qa.question}`, status: 'success', type: 'image' });
                    successCount++;
                }

                if (i < extractedImages.length - 1) await new Promise(r => setTimeout(r, 200));

            } catch (err: any) {
                results.push({ id, question: `[Image] ${img.title} (error)`, status: 'error', type: 'image', error: err.message });
                errorCount++;
            }
        }
    }

    // Calculate separate counts for response
    const textResults = results.filter(r => r.type === 'text');
    const imageResults = results.filter(r => r.type === 'image');

    return NextResponse.json({
        success: true,
        sourceName,
        inputType,
        totalChunks: chunks.length,
        totalImages: extractedImages.length,
        successCount,
        skippedCount,
        errorCount,
        textSuccess: textResults.filter(r => r.status === 'success').length,
        imageSuccess: imageResults.filter(r => r.status === 'success').length,
        imageTypes: extractedImages.map(img => img.imageType),
        results,
    });
}
