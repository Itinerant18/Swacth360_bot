/**
 * src/app/api/admin/ingest/route.ts
 *
 * PDF/Text Ingestion Pipeline — Fixed PDF parsing for Next.js
 *
 * CHANGE: Replaced broken pdf-parse (dynamic worker error) with
 * pdf2json via src/lib/pdf-extract.ts (pure Node, no worker needed).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { extractPdfText } from '@/lib/pdf-extract';
import { ChatOpenAI } from '@langchain/openai';

// ─── Config ───────────────────────────────────────────────────
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const MIN_CHUNK_LEN = 80;
const MAX_IMAGES_PER_PDF = 20;
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
        ? `This is a description of a TECHNICAL IMAGE/DIAGRAM from "${sourceName}".`
        : `This is a text chunk from the document "${sourceName}".`;

    const prompt = `You are a technical documentation analyst for HMS industrial control panels.

${contextHint}

Generate one Q&A pair a field engineer would find useful about this content.

Content:
"""
${chunk.substring(0, 1500)}
"""

Rules:
- Question: natural language a real user would ask
- Answer: complete, self-contained, specific technical details
- Category: pick best from: ${VALID_CATEGORIES.join(' | ')}
- Tags: 3-5 specific technical keywords
- If no useful technical info: {"skip":true}

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

// ─── Rich Embedding Text ──────────────────────────────────────
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

// ─── Gemini Vision: Extract Technical Images from PDF ─────────
interface ExtractedImage {
    imageIndex: number;
    pageNumber: number;
    imageType: string;
    title: string;
    description: string;
    technicalDetails: string;
    relevantFor: string;
}

async function extractImagesFromPdf(
    pdfBuffer: ArrayBuffer,
    sourceName: string,
    geminiApiKey: string
): Promise<ExtractedImage[]> {
    const pdfBytes = Buffer.from(pdfBuffer);

    if (pdfBytes.length > MAX_GEMINI_PDF_BYTES) {
        console.warn(`⚠️  PDF too large for Gemini vision (${(pdfBytes.length / 1024 / 1024).toFixed(1)}MB)`);
        return [];
    }

    const pdfBase64 = pdfBytes.toString('base64');

    const prompt = `You are analyzing a technical PDF document named "${sourceName}" for an industrial HMS panel support bot.

Find and describe ALL technical visual content: wiring diagrams, schematics, installation drawings, panel layouts, LED indicators, connector pinouts, block diagrams, DIP switch settings, troubleshooting flowcharts.

For EACH technical image found provide:
- imageType: type of visual (e.g. "Wiring Diagram", "LED Panel Layout")
- pageNumber: approximate page (1-based)
- title: brief title/caption
- description: what the image shows (2-4 sentences)
- technicalDetails: specific values, labels, connections, pin numbers visible
- relevantFor: when a field engineer would need this

If NO technical images found, return empty array [].

Respond ONLY with valid JSON array, no markdown:
[{"imageType":"...","pageNumber":1,"title":"...","description":"...","technicalDetails":"...","relevantFor":"..."}]`;

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
                        ],
                    }],
                    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
                }),
            }
        );

        if (!response.ok) {
            console.warn(`⚠️  Gemini API error (${response.status})`);
            return [];
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        if (!text.trim()) return [];

        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let parsed: any[];
        try {
            parsed = JSON.parse(cleaned);
        } catch {
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

function formatImageForQA(img: ExtractedImage): string {
    return [
        `[TECHNICAL IMAGE: ${img.imageType}]`,
        `Title: ${img.title}`,
        img.pageNumber ? `Location: Page ${img.pageNumber}` : '',
        ``,
        `Description:`,
        img.description,
        ``,
        `Technical Details:`,
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

    // ── Parse request ──────────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        const file = form.get('file') as File | null;
        sourceName = (form.get('sourceName') as string | null)?.trim()
            || file?.name.replace('.pdf', '')
            || 'Uploaded PDF';
        inputType = 'pdf';

        if (!file)
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        if (!file.name.toLowerCase().endsWith('.pdf'))
            return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
        if (file.size > 10 * 1024 * 1024)
            return NextResponse.json({ error: 'File too large — max 10 MB' }, { status: 400 });

        pdfBuffer = await file.arrayBuffer();

        // ── Use new pdf-extract utility (no worker, no dynamic require) ──
        try {
            rawText = await extractPdfText(pdfBuffer);
            console.log(`📄 Extracted ${rawText.length} chars from PDF`);
        } catch (err: any) {
            // Don't fail — image pipeline can still run on Gemini
            console.warn(`⚠️  Text extraction failed: ${err.message}`);
            rawText = '';
        }

    } else {
        const body = await req.json().catch(() => ({}));
        rawText = (body.text ?? '').trim();
        sourceName = (body.sourceName ?? 'Admin Text Input').trim();
        inputType = 'text';

        if (rawText.length < 50)
            return NextResponse.json(
                { error: 'Text too short — paste at least 50 characters' },
                { status: 400 }
            );
    }

    // For PDFs with no extractable text, still run image pipeline
    const hasText = rawText.trim().length >= 50;
    const chunks = hasText ? chunkText(rawText) : [];
    const isImageOnly = inputType === 'pdf' && !hasText;

    if (!hasText && inputType === 'text') {
        return NextResponse.json(
            { error: 'No usable text found in input' },
            { status: 400 }
        );
    }

    if (isImageOnly) {
        console.log('ℹ️  No text extracted — running image-only pipeline via Gemini');
    }

    // ── Image extraction ───────────────────────────────────────
    let extractedImages: ExtractedImage[] = [];
    if (inputType === 'pdf' && pdfBuffer && geminiKey) {
        console.log(`🖼️  Extracting images via Gemini...`);
        extractedImages = await extractImagesFromPdf(pdfBuffer, sourceName, geminiKey);
        console.log(`🖼️  Found ${extractedImages.length} image(s)`);
    }

    // Guard: need at least text or images
    if (chunks.length === 0 && extractedImages.length === 0) {
        return NextResponse.json(
            { error: 'No content could be extracted from this PDF. It may be a scanned image-only PDF with no detectable diagrams.' },
            { status: 400 }
        );
    }

    // ── Process text chunks ────────────────────────────────────
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
        console.log(`🖼️  Processing ${extractedImages.length} image(s)...`);

        for (let i = 0; i < extractedImages.length; i++) {
            const img = extractedImages[i];
            const id = `admin_pdf_img_${timestamp}_${String(i).padStart(3, '0')}`;
            const imageContent = formatImageForQA(img);

            try {
                const qa = await generateQAPair(imageContent, sourceName, sarvamLlm, true);
                if (!qa) {
                    results.push({ id, question: `[Image] ${img.title} (skipped)`, status: 'skipped', type: 'image' });
                    skippedCount++;
                    continue;
                }

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