/**
 * scripts/seed-pdfs.ts
 *
 * Batch-processes ALL PDFs in data/pdf/ and seeds them into Supabase hms_knowledge.
 *
 * Two pipelines:
 *   1. Text PDFs   → pdf-parse → chunking → OpenAI text-embedding-3-large → source='pdf'
 *   2. Image PDFs  → GPT-4o Vision → describe diagrams → OpenAI embedding → source='pdf_image'
 *
 * Option C Hybrid: uses two-pass chunking (section → semantic), proposition decomposition,
 * and triggers RAPTOR tree rebuild for parent-child linking.
 *
 * Usage:
 *   npx tsx scripts/seed-pdfs.ts                   # process all PDFs
 *   npx tsx scripts/seed-pdfs.ts --dry-run          # scan only, no uploads
 *   npx tsx scripts/seed-pdfs.ts --limit=5          # process first 5 PDFs only
 *   npx tsx scripts/seed-pdfs.ts --start=50         # resume from PDF #50
 *   npx tsx scripts/seed-pdfs.ts --start=10 --limit=5 --dry-run
 */

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import {
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    embedTexts,
} from '../src/lib/embeddings';

loadEnvConfig(process.cwd());
import { semanticChunk, type SemanticChunk } from '../src/lib/semantic-chunker';

// ═══════════════════════════════════════════════════════════════
// DNS / Fetch fix (Windows IPv6 workaround)
// ═══════════════════════════════════════════════════════════════
dns.setDefaultResultOrder('ipv4first');
const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

function customLookup(hostname: string, _opts: unknown, cb: (err: Error | null, address?: string, family?: number) => void) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

const agent = new Agent({ connect: { family: 4, lookup: customLookup as never } });
const customFetch = (input: unknown, init?: unknown) =>
    undiciFetch(input as Parameters<typeof undiciFetch>[0], { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════
const PDF_DIR = path.join(process.cwd(), 'data', 'pdf');
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 300;
const IMAGE_TEXT_THRESHOLD = 100; // PDFs with less text than this → image pipeline
const BATCH_EMBED_SIZE = EMBEDDING_BATCH_SIZE;
const DELAY_BETWEEN_PDFS = 500;  // ms
const GPT_VISION_MODEL = 'gpt-4o';
const GPT_ENRICHMENT_MODEL = 'gpt-4o-mini';
const ENRICHMENT_BATCH_SIZE = 5;  // chunks per AI enrichment call

const VALID_CATEGORIES = [
    'General Knowledge', 'Installation & Commissioning',
    'Communication Protocols & Networking', 'Troubleshooting & Diagnostics',
    'Maintenance & Preventive Care', 'Safety & Compliance',
    'Software Configuration & Programming', 'Power Supply & Electrical',
    'Advanced Diagnostics & Integration',
];

// ═══════════════════════════════════════════════════════════════
// CLI argument parser
// ═══════════════════════════════════════════════════════════════
function parseArgs() {
    const args: Record<string, string> = {};
    const flags = new Set<string>();
    for (const a of process.argv.slice(2)) {
        const kv = a.match(/^--(\w[\w-]*)=(.+)$/);
        if (kv) args[kv[1]] = kv[2];
        else if (a.startsWith('--')) flags.add(a.slice(2));
    }
    return { args, flags };
}

// ═══════════════════════════════════════════════════════════════
// Text cleaning (same as ingest-pdf.ts)
// ═══════════════════════════════════════════════════════════════
function cleanText(raw: string): string {
    return raw
        .replace(/\r\n/g, '\n')
        .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')  // page markers
        .replace(/^\s*\d{1,3}\s*$/gm, '')            // lone page numbers
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{3,}/g, '  ')
        .trim();
}

// ═══════════════════════════════════════════════════════════════
// Section-aware chunking (same as ingest-pdf.ts)
// ═══════════════════════════════════════════════════════════════
interface Chunk { section: string; content: string; }

function isHeading(line: string): boolean {
    const t = line.trim();
    if (!t || t.length > 80) return false;
    return (
        /^[A-Z][A-Z\s\-&:\/\d]{10,}$/.test(t) ||
        /^\d+(\.\d+)?\s+[A-Z]/.test(t) ||
        (t.endsWith(':') && t.length > 5 && t.length < 60)
    );
}

function buildChunks(text: string): Chunk[] {
    const lines = text.split('\n');
    const sections: { title: string; body: string }[] = [];
    let curTitle = 'Introduction';
    let curBody: string[] = [];

    for (const line of lines) {
        if (!line.trim()) { curBody.push(''); continue; }
        if (isHeading(line) && curBody.join('\n').trim().length > 0) {
            sections.push({ title: curTitle, body: curBody.join('\n').trim() });
            curTitle = line.trim().replace(/:$/, '');
            curBody = [];
        } else {
            curBody.push(line);
        }
    }
    if (curBody.join('\n').trim()) sections.push({ title: curTitle, body: curBody.join('\n').trim() });

    const chunks: Chunk[] = [];
    for (const { title, body } of sections) {
        let start = 0;
        while (start < body.length) {
            let end = start + CHUNK_SIZE;
            if (end < body.length) {
                const pb = body.lastIndexOf('\n\n', end);
                const sb = body.lastIndexOf('. ', end);
                if (pb > start + CHUNK_SIZE * 0.5) end = pb + 2;
                else if (sb > start + CHUNK_SIZE * 0.5) end = sb + 2;
            }
            const chunk = body.slice(start, end).trim();
            if (chunk.length >= 80) chunks.push({ section: title, content: chunk });
            start = Math.max(start + 1, end - CHUNK_OVERLAP);
        }
    }
    return chunks;
}

// ═══════════════════════════════════════════════════════════════
// Build rich embedding text (for search quality)
// ═══════════════════════════════════════════════════════════════
function buildEmbeddingText(
    question: string, answer: string, section: string,
    category: string, keywords: string[], sourceName: string
): string {
    return [
        `Source: ${sourceName}`,
        `Section: ${section}`,
        `Category: ${category}`,
        `Keywords: ${keywords.join(', ')}`,
        `Question: ${question}`,
        `Answer: ${answer}`,
    ].join('\n');
}

// ═══════════════════════════════════════════════════════════════
// GPT-4o-mini enrichment — generate real Q&A + category + keywords
//
// Takes a batch of raw text chunks and returns enriched metadata:
// real questions, proper categories, and technical keywords.
// ═══════════════════════════════════════════════════════════════
interface EnrichedChunk {
    question: string;
    category: string;
    keywords: string[];
}

async function enrichChunksWithAI(
    chunks: Chunk[],
    sourceName: string,
    openaiClient: OpenAI,
): Promise<EnrichedChunk[]> {
    const results: EnrichedChunk[] = [];

    for (let i = 0; i < chunks.length; i += ENRICHMENT_BATCH_SIZE) {
        const batch = chunks.slice(i, i + ENRICHMENT_BATCH_SIZE);

        const chunkDescriptions = batch.map((c, idx) =>
            `--- CHUNK ${i + idx + 1} [Section: ${c.section}] ---\n${c.content.substring(0, 800)}`
        ).join('\n\n');

        const prompt = `You are analyzing technical documentation chunks from "${sourceName}" (HMS industrial control panels / Seple / SWATCH 360).

For EACH chunk below, generate:
1. A specific question a field engineer would ask that this chunk answers
2. The best category from: ${VALID_CATEGORIES.join(' | ')}
3. 3-5 technical keywords from the content (model numbers, protocols, components, specs)

Respond with ONLY a valid JSON array, one object per chunk:
[{"question":"...","category":"...","keywords":["kw1","kw2","kw3"]},...]

${chunkDescriptions}`;

        try {
            const response = await openaiClient.chat.completions.create({
                model: GPT_ENRICHMENT_MODEL,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2048,
                temperature: 0.1,
            });

            const text = response.choices[0]?.message?.content ?? '[]';
            const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);

            if (Array.isArray(parsed)) {
                for (let j = 0; j < batch.length; j++) {
                    const entry = parsed[j];
                    results.push({
                        question: entry?.question || `What information is in ${sourceName}, section ${batch[j].section}?`,
                        category: VALID_CATEGORIES.includes(entry?.category) ? entry.category : 'General Knowledge',
                        keywords: Array.isArray(entry?.keywords) ? entry.keywords : [],
                    });
                }
            } else {
                // Fallback if response isn't an array
                for (const chunk of batch) {
                    results.push({
                        question: `What information is in ${sourceName}, section ${chunk.section}?`,
                        category: 'General Knowledge',
                        keywords: [],
                    });
                }
            }
        } catch (err: unknown) {
            console.error(`│    ⚠️  AI enrichment failed: ${(err as Error).message}. Using fallback.`);
            for (const chunk of batch) {
                results.push({
                    question: `What information is in ${sourceName}, section ${chunk.section}?`,
                    category: 'General Knowledge',
                    keywords: chunk.section.toLowerCase().split(/\s+/).filter(w => w.length > 3),
                });
            }
        }
    }

    return results;
}

// ═══════════════════════════════════════════════════════════════
// Proposition Decomposition — extract atomic facts from chunks
//
// Each chunk is decomposed into self-contained propositions that
// capture individual facts. These propositions are stored alongside
// the parent chunk, creating parent-child relationships that
// improve retrieval precision for specific queries.
// ═══════════════════════════════════════════════════════════════
interface Proposition {
    fact: string;
    parentChunkId: string;
}

async function extractPropositions(
    chunks: Chunk[],
    chunkIds: string[],
    sourceName: string,
    openaiClient: OpenAI,
): Promise<Proposition[]> {
    const allPropositions: Proposition[] = [];
    const PROP_BATCH_SIZE = 3; // chunks per call

    for (let i = 0; i < chunks.length; i += PROP_BATCH_SIZE) {
        const batch = chunks.slice(i, i + PROP_BATCH_SIZE);
        const batchIds = chunkIds.slice(i, i + PROP_BATCH_SIZE);

        const chunkDescriptions = batch.map((c, idx) =>
            `--- CHUNK_ID: ${batchIds[i + idx]} ---\n${c.content.substring(0, 1000)}`
        ).join('\n\n');

        const prompt = `Extract self-contained factual propositions from these HMS technical documentation chunks (source: "${sourceName}").

Rules:
- Each proposition must be a complete, standalone fact (understandable without the original text)
- Include specific values: model numbers, voltages, pin assignments, protocol names, measurements
- Skip filler/introductory text — only extract actionable technical facts
- 3-8 propositions per chunk

Respond with ONLY valid JSON:
[{"chunk_id":"...","facts":["fact1","fact2","fact3"]},...]

${chunkDescriptions}`;

        try {
            const response = await openaiClient.chat.completions.create({
                model: GPT_ENRICHMENT_MODEL,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 2048,
                temperature: 0.1,
                response_format: { type: 'json_object' },
            });

            const text = response.choices[0]?.message?.content ?? '[]';
            let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            // Escape any unescaped backslashes to prevent JSON.parse syntax errors (e.g. from file paths or register maps)
            cleaned = cleaned.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
            const parsed = JSON.parse(cleaned);

            if (Array.isArray(parsed)) {
                for (const entry of parsed) {
                    const chunkId = entry?.chunk_id;
                    const facts = Array.isArray(entry?.facts) ? entry.facts : [];
                    for (const fact of facts) {
                        if (typeof fact === 'string' && fact.length > 20) {
                            allPropositions.push({ fact, parentChunkId: chunkId || batchIds[0] });
                        }
                    }
                }
            }
        } catch (err: unknown) {
            console.error(`│    ⚠️  Proposition extraction failed: ${(err as Error).message}`);
            // Non-fatal — we still have the parent chunks
        }
    }

    return allPropositions;
}

// ═══════════════════════════════════════════════════════════════
// GPT-4o Vision — extract content from image-heavy PDFs
//
// Uses OpenAI's File Upload API to send the PDF directly to GPT-4o.
// GPT-4o natively understands PDF content including diagrams, tables,
// and schematics — no client-side rendering required.
// ═══════════════════════════════════════════════════════════════
async function extractWithGPTVision(
    pdfBuffer: Buffer,
    fileName: string,
    openaiClient: OpenAI,
): Promise<{ question: string; answer: string; category: string; keywords: string[] }[]> {

    // OpenAI Files API has a 50MB limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
    if (pdfBuffer.length > MAX_FILE_SIZE) {
        console.warn(`      ⚠️  PDF too large for GPT-4o Vision (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB > 50MB limit). Using filename-based fallback.`);
        return [{
            question: `What technical content is shown in ${fileName}?`,
            answer: `Large technical document: ${fileName} (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB). Contains diagrams or schematics too large for automated vision analysis. Manual review recommended.`,
            keywords: [fileName.replace('.pdf', '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim()],
            category: 'General Knowledge',
        }];
    }

    const prompt = `You are a technical documentation analyst for HMS industrial control panels and security systems (by Seple/SWATCH 360).

Analyze this PDF document "${fileName}" which contains technical diagrams, schematics, or product images.

For EACH distinct diagram, schematic, or visual element you find, generate a Q&A entry:

1. A specific question a field engineer would ask about what's shown
2. A detailed answer describing the visual content, specifications, connections, and any text visible
3. 3-5 technical keywords
4. Best category from: ${VALID_CATEGORIES.join(' | ')}

Respond with ONLY a valid JSON array, no markdown:
[{"question":"...","answer":"...","keywords":["kw1","kw2"],"category":"..."},...]

If you find multiple diagrams, create one entry per diagram. If the PDF has a single main diagram, return an array with one entry. Minimum 1, maximum 10 entries.`;

    try {
        // Upload the PDF file to OpenAI's Files API
        const file = await openaiClient.files.create({
            file: new File([new Uint8Array(pdfBuffer)], fileName, { type: 'application/pdf' }),
            purpose: 'assistants',
        });

        const response = await openaiClient.chat.completions.create({
            model: GPT_VISION_MODEL,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'file',
                            file: { file_id: file.id },
                        } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart,
                        { type: 'text', text: prompt },
                    ],
                },
            ],
            max_tokens: 4096,
            temperature: 0.2,
        });

        // Clean up the uploaded file
        try { await openaiClient.files.delete(file.id); } catch { /* best-effort cleanup */ }

        const responseText = response.choices[0]?.message?.content ?? '[]';
        const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (!Array.isArray(parsed)) return [parsed];
        return parsed.map((entry: { question?: string; answer?: string; category?: string; keywords?: string[] }) => ({
            question: entry.question || `What does this diagram in ${fileName} show?`,
            answer: entry.answer || 'Technical diagram from PDF',
            keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
            category: VALID_CATEGORIES.includes(entry.category as string) ? (entry.category as string) : 'General Knowledge',
        }));
    } catch (err: unknown) {
        console.error(`      ⚠️  GPT-4o Vision failed: ${(err as Error).message}`);
        return [{
            question: `What technical content is shown in ${fileName}?`,
            answer: `Technical diagram/schematic from ${fileName}. Visual content could not be fully analyzed.`,
            keywords: [fileName.replace('.pdf', '').toLowerCase()],
            category: 'General Knowledge',
        }];
    }
}

// ═══════════════════════════════════════════════════════════════
// Log ingestion to ingestion_log table
// ═══════════════════════════════════════════════════════════════
async function logIngestion(
    supabase: SupabaseClient,
    sourceName: string,
    inputType: string,
    totalChunks: number,
    successCount: number,
    errorCount: number,
) {
    const status = errorCount === 0 ? 'completed' : errorCount === totalChunks ? 'failed' : 'partial';
    const { error } = await supabase.from('ingestion_log').insert({
        source_name: sourceName,
        input_type: inputType,
        total_chunks: totalChunks,
        success_count: successCount,
        error_count: errorCount,
        skip_count: 0,
        status,
        created_by: 'seed-pdfs',
    });
    if (error) console.error(`      ⚠️  Failed to log ingestion: ${error.message}`);
}

async function warnOrClearExistingEmbeddings(
    supabase: SupabaseClient,
): Promise<void> {
    const { count, error: countError } = await supabase
        .from('hms_knowledge')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    if (countError) {
        console.warn('[seed-pdfs] failed to count existing embeddings:', countError.message);
        return;
    }

    if ((count ?? 0) > 0) {
        console.warn(
            `[seed-pdfs] detected ${count} existing embedded rows. Re-ingest all content after embedding model changes to avoid mixed vectors.`,
        );
    }

    if (process.env.CLEAR_EMBEDDINGS !== 'true') {
        return;
    }

    console.warn('[seed-pdfs] CLEAR_EMBEDDINGS=true - removing existing hms_knowledge rows before import');
    const { error: deleteError } = await supabase
        .from('hms_knowledge')
        .delete()
        .neq('id', '');

    if (deleteError) {
        throw new Error(`[seed-pdfs] failed to clear existing embeddings: ${deleteError.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════
async function main() {
    const { args, flags } = parseArgs();
    const dryRun = flags.has('dry-run') || flags.has('help');
    const startIdx = parseInt(args.start || '0');
    const limit = args.limit ? parseInt(args.limit) : Infinity;

    if (flags.has('help')) {
        console.log(`
Usage: npx tsx scripts/seed-pdfs.ts [options]

Options:
  --dry-run       Scan PDFs and report classification, no uploads
  --start=N       Start from PDF number N (0-indexed, for crash recovery)
  --limit=N       Process at most N PDFs
  --help          Show this help message
`);
        return;
    }

    // ── Validate env vars ──────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    if (!openaiKey) throw new Error('❌ Missing OPENAI_API_KEY');

    // ── Scan PDF directory ─────────────────────────────────────
    const allFiles = fs.readdirSync(PDF_DIR)
        .filter(f => f.toLowerCase().endsWith('.pdf'))
        .sort();

    const filesToProcess = allFiles.slice(startIdx, startIdx + limit);

    console.log('\n' + '═'.repeat(65));
    console.log('📄 SAI — Batch PDF Seeder');
    console.log(`   Embedding:  ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
    console.log('   Vision:     GPT-4o (for image-heavy PDFs)');
    console.log('   Target:     Supabase hms_knowledge');
    console.log('═'.repeat(65));
    console.log(`📁 PDF Dir:    ${PDF_DIR}`);
    console.log(`📦 Total PDFs: ${allFiles.length}`);
    console.log(`🎯 Processing: ${filesToProcess.length} (start=${startIdx}, limit=${limit === Infinity ? 'all' : limit})`);
    console.log(`🧪 Dry Run:    ${dryRun ? 'YES (no uploads)' : 'NO (live mode)'}`);
    console.log('═'.repeat(65) + '\n');

    if (dryRun && flags.has('help')) return;

    // ── Init clients ───────────────────────────────────────────
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });
    await warnOrClearExistingEmbeddings(supabase);

    const openaiVisionClient = new OpenAI({
        apiKey: openaiKey,
        maxRetries: 2,
        timeout: 60_000,
        fetch: customFetch as unknown as typeof globalThis.fetch,
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse, VerbosityLevel } = require('pdf-parse');

    // ── Stats ──────────────────────────────────────────────────
    let totalSuccess = 0;
    let totalErrors = 0;
    let totalChunks = 0;
    let textPdfCount = 0;
    let imagePdfCount = 0;
    let skippedPdfCount = 0;

    // ── Process each PDF ───────────────────────────────────────
    for (let idx = 0; idx < filesToProcess.length; idx++) {
        const fileName = filesToProcess[idx];
        const filePath = path.join(PDF_DIR, fileName);
        const pdfNum = startIdx + idx + 1;
        const sourceName = path.basename(fileName, '.pdf');
        const idPrefix = `pdf_${sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

        console.log(`\n┌─── PDF ${pdfNum}/${allFiles.length}: ${fileName}`);
        console.log(`│    Size: ${(fs.statSync(filePath).size / 1024).toFixed(1)} KB`);

        try {
            // ── Step 1: Parse PDF ──────────────────────────────
            const pdfBuffer = fs.readFileSync(filePath);
            let rawText = '';
            let numPages = 0;
            try {
                const parser = new PDFParse({
                    data: new Uint8Array(pdfBuffer),
                    verbosity: VerbosityLevel.ERRORS,
                });
                await parser.load();
                const textResult = await parser.getText();
                rawText = cleanText(
                    (textResult.pages || []).map((pg: { text?: string }) => pg.text || '').join('\n')
                );
                try {
                    const info = await parser.getInfo();
                    numPages = info?.numPages || 0;
                } catch { /* ignore info errors */ }
                parser.destroy();
            } catch (parseErr: unknown) {
                console.log(`│    ⚠️  pdf-parse failed: ${(parseErr as Error).message}`);
                console.log(`│    → Treating as image-only PDF`);
            }

            const textLength = rawText.length;
            console.log(`│    Pages: ${numPages || '?'} · Text: ${textLength.toLocaleString()} chars`);

            // ── Step 2: Classify pipeline ──────────────────────
            const isImagePdf = textLength < IMAGE_TEXT_THRESHOLD;
            console.log(`│    Pipeline: ${isImagePdf ? '🖼️  IMAGE (GPT-4o Vision)' : '📝 TEXT (pdf-parse + OpenAI)'}`);

            if (dryRun) {
                if (isImagePdf) imagePdfCount++;
                else textPdfCount++;
                console.log(`└─── [DRY RUN] Skipped\n`);
                continue;
            }

            // ════════════════════════════════════════════════════
            // PIPELINE A: Text-heavy PDF
            // ════════════════════════════════════════════════════
            if (!isImagePdf) {
                textPdfCount++;

                // ── Step 2a: Two-pass chunking (Hybrid Option C) ──
                // Pass 1: Section-aware split (preserves document structure)
                const sectionChunks = buildChunks(rawText);

                // Pass 2: Semantic split — further split large chunks at topic boundaries
                let chunks: Chunk[] = [];
                try {
                    const semanticResults: SemanticChunk[] = await semanticChunk(rawText, {
                        similarityThreshold: 0.72,
                        minChunkSize: 150,
                        maxChunkSize: 1800,
                    });
                    // Convert SemanticChunks to our Chunk interface
                    chunks = semanticResults.map(sc => ({ section: 'Semantic', content: sc.content }));
                    // Merge with section-aware chunks: prefer semantic if it produces more, otherwise use section-based
                    if (chunks.length < sectionChunks.length) {
                        chunks = sectionChunks;
                        console.log(`│    📐 Using section-aware chunking (${chunks.length} chunks)`);
                    } else {
                        console.log(`│    🧠 Using semantic chunking (${chunks.length} chunks, threshold=0.72)`);
                    }
                } catch {
                    // Semantic chunking requires embedding calls — fallback to section-based
                    chunks = sectionChunks;
                    console.log(`│    📐 Semantic chunking failed, using section-aware (${chunks.length} chunks)`);
                }

                if (chunks.length === 0) {
                    console.log(`│    ⚠️  No usable chunks after splitting. Skipping.`);
                    skippedPdfCount++;
                    console.log(`└─── Done\n`);
                    continue;
                }
                let pdfSuccess = 0;
                let pdfErrors = 0;

                // ── Step 3a: Enrich chunks with GPT-4o-mini ────
                console.log(`│    🧠 Enriching with GPT-4o-mini…`);
                const enriched = await enrichChunksWithAI(chunks, sourceName, openaiVisionClient);
                console.log(`│    ✨ ${enriched.length} chunks enriched`);

                // ── Step 3b: Embed and upload in batches ────────
                for (let b = 0; b < chunks.length; b += BATCH_EMBED_SIZE) {
                    const batch = chunks.slice(b, b + BATCH_EMBED_SIZE);
                    const batchTexts: string[] = [];
                    const batchMeta: { id: string; question: string; answer: string; section: string; category: string; keywords: string[] }[] = [];

                    for (let j = 0; j < batch.length; j++) {
                        const chunk = batch[j];
                        const chunkIdx = b + j;
                        const id = `${idPrefix}_${String(chunkIdx).padStart(4, '0')}`;

                        // Use AI-enriched metadata
                        const meta = enriched[chunkIdx] || {
                            question: `What information is in ${sourceName}, section ${chunk.section}?`,
                            category: 'General Knowledge',
                            keywords: [],
                        };

                        // Full answer with document context (no truncation!)
                        const answer = [
                            `[Document: ${sourceName}]`,
                            `[Section: ${chunk.section}]`,
                            chunk.content,
                        ].join('\n');

                        const embText = buildEmbeddingText(meta.question, answer, chunk.section, meta.category, meta.keywords, sourceName);
                        batchTexts.push(embText);
                        batchMeta.push({ id, question: meta.question, answer, section: chunk.section, category: meta.category, keywords: meta.keywords });
                    }

                    // Batch embed with OpenAI
                    let vectors: number[][];
                    try {
                        vectors = await embedTexts(batchTexts);
                    } catch (embErr: unknown) {
                        console.error(`│    ❌ Batch embedding failed: ${(embErr as Error).message}`);
                        pdfErrors += batch.length;
                        continue;
                    }

                    // Upsert each chunk
                    for (let j = 0; j < batch.length; j++) {
                        const meta = batchMeta[j];
                        try {
                            const { error } = await supabase.from('hms_knowledge').upsert({
                                id: meta.id,
                                question: meta.question,
                                answer: meta.answer,
                                category: meta.category,
                                subcategory: meta.section,
                                product: 'HMS Panel',
                                tags: meta.keywords,
                                content: batchTexts[j],
                                embedding: vectors[j],
                                source: 'pdf',
                                source_name: sourceName,
                            }, { onConflict: 'id' });

                            if (error) { pdfErrors++; } else { pdfSuccess++; }
                        } catch (err: unknown) {
                            pdfErrors++;
                            console.error(`│    ❌ ${meta.id}: ${(err as Error).message}`);
                        }
                    }
                }

                totalSuccess += pdfSuccess;
                totalErrors += pdfErrors;
                totalChunks += chunks.length;
                console.log(`│    ✅ ${pdfSuccess}/${chunks.length} chunks uploaded`);
                if (pdfErrors > 0) console.log(`│    ❌ ${pdfErrors} errors`);

                // ── Step 4: Proposition Decomposition (Option C Hybrid) ──
                // Extract atomic facts and store as child entries linked to parent chunks
                if (chunks.length > 0 && pdfSuccess > 0) {
                    console.log(`│    🔬 Extracting propositions…`);
                    const chunkIds = chunks.map((_, idx) => `${idPrefix}_${String(idx).padStart(4, '0')}`);
                    try {
                        const propositions = await extractPropositions(chunks, chunkIds, sourceName, openaiVisionClient);
                        console.log(`│    📝 ${propositions.length} propositions extracted`);

                        // Embed and store propositions as child chunks
                        if (propositions.length > 0) {
                            const propTexts = propositions.map(p =>
                                `[Fact from ${sourceName}] ${p.fact}`
                            );

                            let propVectors: number[][] = [];
                            try {
                                const EMBED_BATCH_SIZE = 128;
                                for (let b = 0; b < propTexts.length; b += EMBED_BATCH_SIZE) {
                                    const slice = propTexts.slice(b, b + EMBED_BATCH_SIZE);
                                    try {
                                        const sliceVectors = await embedTexts(slice);
                                        propVectors.push(...sliceVectors);
                                    } catch (err) {
                                        console.error(`│    ⚠️  Failed to embed proposition sub-batch starting at index ${b}: ${(err as Error).message}`);
                                        const empty = Array(slice.length).fill([]);
                                        propVectors.push(...empty);
                                    }
                                    if (b + EMBED_BATCH_SIZE < propTexts.length) {
                                        await new Promise(r => setTimeout(r, 200));
                                    }
                                }
                            } catch (err) {
                                console.error(`│    ⚠️  Proposition embedding process failed: ${(err as Error).message}`);
                            }

                            let propSuccess = 0;
                            for (let p = 0; p < propositions.length && p < propVectors.length; p++) {
                                const prop = propositions[p];
                                const propVector = propVectors[p];
                                if (!propVector || propVector.length === 0) {
                                    continue; // Skip failed embedding items
                                }
                                
                                const propId = `${prop.parentChunkId}_prop_${String(p).padStart(3, '0')}`;
                                const parentIdx = chunkIds.indexOf(prop.parentChunkId);
                                const parentContent = parentIdx !== -1 ? chunks[parentIdx].content : '';

                                try {
                                    const { error } = await supabase.from('hms_knowledge').upsert({
                                        id: propId,
                                        question: prop.fact,
                                        answer: prop.fact,
                                        category: 'Proposition',
                                        subcategory: 'Atomic Fact',
                                        product: 'HMS Panel',
                                        tags: [],
                                        content: propTexts[p],
                                        embedding: propVector,
                                        source: 'pdf_proposition',
                                        source_name: sourceName,
                                        chunk_type: 'proposition',
                                        parent_content: parentContent,
                                    }, { onConflict: 'id' });

                                    if (error) {
                                        console.error(`│        ❌ Failed to save proposition ${propId}:`, error.message);
                                    } else {
                                        propSuccess++;
                                    }
                                } catch (err: unknown) {
                                    console.error(`│        ⚠️  Unexpected error saving proposition ${propId}:`, (err as Error).message);
                                }
                            }
                            console.log(`│    ✅ ${propSuccess}/${propositions.length} propositions stored`);
                            totalSuccess += propSuccess;
                            totalChunks += propSuccess;
                        }
                    } catch (propErr: unknown) {
                        console.error(`│    ⚠️  Proposition extraction skipped: ${(propErr as Error).message}`);
                    }
                }

                // Log ingestion  
                await logIngestion(supabase, sourceName, 'pdf', chunks.length, pdfSuccess, pdfErrors);
            }

            // ════════════════════════════════════════════════════
            // PIPELINE B: Image-heavy PDF (Gemini Vision)
            // ════════════════════════════════════════════════════
            else {
                imagePdfCount++;
                console.log(`│    🤖 Sending to GPT-4o Vision…`);

                const qaEntries = await extractWithGPTVision(pdfBuffer, fileName, openaiVisionClient);
                console.log(`│    📊 GPT-4o returned ${qaEntries.length} Q&A entries`);

                let pdfSuccess = 0;
                let pdfErrors = 0;
                const imageEmbeddingTexts = qaEntries.map((qa) =>
                    buildEmbeddingText(
                        qa.question,
                        qa.answer,
                        'Visual Content',
                        qa.category,
                        qa.keywords,
                        sourceName,
                    ),
                );

                let imageVectors: number[][];
                try {
                    imageVectors = await embedTexts(imageEmbeddingTexts);
                } catch (embErr: unknown) {
                    console.error(`│    ❌ Image batch embedding failed: ${(embErr as Error).message}`);
                    pdfErrors += qaEntries.length;
                    imageVectors = [];
                }

                for (let j = 0; j < qaEntries.length; j++) {
                    const qa = qaEntries[j];
                    const id = `${idPrefix}_img_${String(j).padStart(3, '0')}`;
                    const embText = imageEmbeddingTexts[j];
                    const vector = imageVectors[j];

                    if (!vector) {
                        continue;
                    }

                    try {
                        const { error } = await supabase.from('hms_knowledge').upsert({
                            id,
                            question: qa.question,
                            answer: qa.answer,
                            category: qa.category,
                            subcategory: 'Visual Content',
                            product: 'HMS Panel',
                            tags: qa.keywords,
                            content: embText,
                            embedding: `[${vector.join(',')}]`,
                            source: 'pdf_image',
                            source_name: sourceName,
                        }, { onConflict: 'id' });

                        if (error) {
                            pdfErrors++;
                            console.error(`│    ❌ ${id}: ${error.message}`);
                        } else {
                            pdfSuccess++;
                        }
                    } catch (err: unknown) {
                        pdfErrors++;
                        console.error(`│    ❌ ${id}: ${(err as Error).message}`);
                    }
                }

                totalSuccess += pdfSuccess;
                totalErrors += pdfErrors;
                totalChunks += qaEntries.length;
                console.log(`│    ✅ ${pdfSuccess}/${qaEntries.length} entries uploaded`);
                if (pdfErrors > 0) console.log(`│    ❌ ${pdfErrors} errors`);

                // Log ingestion
                await logIngestion(supabase, sourceName, 'pdf', qaEntries.length, pdfSuccess, pdfErrors);
            }

            console.log(`└─── Done`);

        } catch (err: unknown) {
            console.error(`│    ❌ FATAL: ${(err as Error).message}`);
            console.log(`└─── Failed\n`);
            totalErrors++;
            skippedPdfCount++;
        }

        // Throttle between PDFs
        if (idx < filesToProcess.length - 1) {
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_PDFS));
        }
    }

    // ── Final report ───────────────────────────────────────────
    console.log('\n' + '═'.repeat(65));
    console.log('📊 BATCH SEEDING COMPLETE');
    console.log('═'.repeat(65));
    console.log(`   Total PDFs processed:   ${filesToProcess.length}`);
    console.log(`   📝 Text pipeline:       ${textPdfCount}`);
    console.log(`   🖼️  Image pipeline:      ${imagePdfCount}`);
    if (skippedPdfCount > 0) console.log(`   ⏭️  Skipped:             ${skippedPdfCount}`);

    if (!dryRun) {
        console.log(`\n   Total chunks/entries:    ${totalChunks}`);
        console.log(`   ✅ Successful uploads:   ${totalSuccess}`);
        if (totalErrors > 0) console.log(`   ❌ Errors:               ${totalErrors}`);
        console.log(`\n   💡 Verify in Supabase:`);
        console.log(`      SELECT * FROM kb_sources;`);
        console.log(`      SELECT * FROM ingestion_log ORDER BY created_at DESC LIMIT 10;`);
    } else {
        console.log(`\n   [DRY RUN] No data was uploaded.`);
        console.log(`   Remove --dry-run to seed for real.`);
    }

    // ── Trigger RAPTOR tree rebuild for parent-child linking ──
    if (!dryRun && totalSuccess > 0) {
        console.log(`\n   🌲 RAPTOR tree rebuild recommended after ingestion.`);
        console.log(`   Run: curl -X POST http://localhost:3000/api/admin/raptor/build`);
        console.log(`   Or via admin panel: Admin → RAG Settings → Build RAPTOR Tree`);
    }

    console.log('═'.repeat(65) + '\n');
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
});
