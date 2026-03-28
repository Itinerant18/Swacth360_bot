/**
 * Usage:
 *   npx tsx scripts/ingest-pdf.ts --file="data/pdf/manual.pdf" --name="Manual v2.3"
 *   npx tsx scripts/ingest-pdf.ts --file="data/pdf/guide.pdf"  --name="Guide" --quick
 */

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import { ChatOpenAI } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import {
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    embedTexts,
} from '../src/lib/embeddings';

loadEnvConfig(process.cwd());

// ─── DNS / Fetch fix ─────────────────────────────────────────
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

// ─── CLI Args ────────────────────────────────────────────────
function parseArgs() {
    const args: Record<string, string> = {};
    const flags = new Set<string>();
    for (const a of process.argv.slice(2)) {
        const kv = a.match(/^--(\w+)=(.+)$/);
        if (kv) args[kv[1]] = kv[2];
        else if (a.startsWith('--')) flags.add(a.slice(2));
    }
    return { args, flags };
}

// ─── Text Cleaning ────────────────────────────────────────────
function cleanText(raw: string): string {
    return raw
        .replace(/\r\n/g, '\n')
        .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '')
        .replace(/^\s*\d{1,3}\s*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{3,}/g, '  ')
        .trim();
}

// ─── Section-Aware Chunking ───────────────────────────────────
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

function buildChunks(text: string, chunkSize: number, overlap: number): Chunk[] {
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
            let end = start + chunkSize;
            if (end < body.length) {
                const pb = body.lastIndexOf('\n\n', end);
                const sb = body.lastIndexOf('. ', end);
                if (pb > start + chunkSize * 0.5) end = pb + 2;
                else if (sb > start + chunkSize * 0.5) end = sb + 2;
            }
            const chunk = body.slice(start, end).trim();
            if (chunk.length >= 80) chunks.push({ section: title, content: chunk });
            start = Math.max(start + 1, end - overlap);
        }
    }
    return chunks;
}

// ─── Q&A Generation via OpenAI GPT-4o ────────────────────────
// Uses OpenAI GPT-4o for Q&A generation — consistent with LLM migration
interface QAPair { question: string; answer: string; keywords: string[]; category: string; }

const VALID_CATEGORIES = [
    'General Knowledge', 'Installation & Commissioning',
    'Communication Protocols & Networking', 'Troubleshooting & Diagnostics',
    'Maintenance & Preventive Care', 'Safety & Compliance',
    'Software Configuration & Programming', 'Power Supply & Electrical',
    'Advanced Diagnostics & Integration',
];

async function generateQA(chunk: Chunk, sourceName: string, llm: ChatOpenAI): Promise<QAPair> {
    const prompt = `You are a technical documentation analyst for HMS industrial control panels.
Given this chunk from "${sourceName}" (section: "${chunk.section}"), generate:
1. A natural question a field engineer would ask that this chunk answers
2. A concise, complete answer based on the chunk  
3. 3-5 specific technical keywords
4. Best category from: ${VALID_CATEGORIES.join(' | ')}

Chunk:
"""
${chunk.content.substring(0, 1200)}
"""

Respond with ONLY valid JSON, no markdown:
{"question":"...","answer":"...","keywords":["kw1","kw2","kw3"],"category":"..."}`;

    try {
        const result = await llm.invoke(prompt);
        const text = (result.content as string).trim();
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            question: parsed.question || `What does "${chunk.section}" cover?`,
            answer: parsed.answer || chunk.content.substring(0, 400),
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
            category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'General Knowledge',
        };
    } catch {
        return {
            question: `What information does the "${chunk.section}" section provide in ${sourceName}?`,
            answer: chunk.content.substring(0, 400),
            keywords: chunk.section.toLowerCase().split(/\s+/).filter(w => w.length > 3),
            category: 'General Knowledge',
        };
    }
}

// ─── Build embedding text ─────────────────────────────────────
function buildEmbeddingText(qa: QAPair, chunk: Chunk, sourceName: string): string {
    return [
        `Source: ${sourceName}`,
        `Section: ${chunk.section}`,
        `Category: ${qa.category}`,
        `Keywords: ${qa.keywords.join(', ')}`,
        `Question: ${qa.question}`,
        `Answer: ${qa.answer}`,
        `Details: ${chunk.content.substring(0, 400)}`,
    ].join('\n');
}

async function warnOrClearExistingEmbeddings(
    supabase: ReturnType<typeof createClient>,
): Promise<void> {
    const { count, error: countError } = await supabase
        .from('hms_knowledge')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    if (countError) {
        console.warn('[ingest-pdf] failed to count existing embeddings:', countError.message);
        return;
    }

    if ((count ?? 0) > 0) {
        console.warn(
            `[ingest-pdf] detected ${count} existing embedded rows. Re-ingest all content after embedding model changes to avoid mixed vectors.`,
        );
    }

    if (process.env.CLEAR_EMBEDDINGS !== 'true') {
        return;
    }

    console.warn('[ingest-pdf] CLEAR_EMBEDDINGS=true - removing existing hms_knowledge rows before import');
    const { error: deleteError } = await supabase
        .from('hms_knowledge')
        .delete()
        .neq('id', '');

    if (deleteError) {
        throw new Error(`[ingest-pdf] failed to clear existing embeddings: ${deleteError.message}`);
    }
}

type PreparedChunk = {
    id: string;
    chunk: Chunk;
    qa: QAPair;
    embText: string;
};

async function flushPreparedChunks(
    supabase: ReturnType<typeof createClient>,
    sourceName: string,
    prepared: PreparedChunk[],
): Promise<{ success: number; errors: number }> {
    if (prepared.length === 0) {
        return { success: 0, errors: 0 };
    }

    let vectors: number[][];
    try {
        vectors = await embedTexts(prepared.map((item) => item.embText));
    } catch (err) {
        console.error(`   Batch embedding failed: ${err instanceof Error ? err.message : String(err)}`);
        return { success: 0, errors: prepared.length };
    }

    let success = 0;
    let errors = 0;

    for (let index = 0; index < prepared.length; index++) {
        const item = prepared[index];
        try {
            const { error } = await supabase.from('hms_knowledge').upsert({
                id: item.id,
                question: item.qa.question,
                answer: item.qa.answer,
                category: item.qa.category,
                subcategory: item.chunk.section,
                product: 'HMS Panel',
                tags: item.qa.keywords,
                content: item.embText,
                embedding: vectors[index],
                source: 'pdf',
                source_name: sourceName,
            }, { onConflict: 'id' });

            if (error) {
                console.error(`   ${item.id}: ${error.message}`);
                errors++;
            } else {
                console.log(`   OK "${item.qa.question.substring(0, 65)}..."`);
                success++;
            }
        } catch (err) {
            console.error(`   ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
            errors++;
        }
    }

    return { success, errors };
}

// ─── Main Pipeline ────────────────────────────────────────────
async function ingestPdf() {
    const { args, flags } = parseArgs();
    const filePath = args.file;
    const sourceName = args.name || (filePath ? path.basename(filePath, '.pdf') : '');
    const chunkSize = parseInt(args.chunkSize || '800');
    const chunkOverlap = parseInt(args.chunkOverlap || '150');
    const quickMode = flags.has('quick');

    if (!filePath) {
        console.error('❌ Usage: npx tsx scripts/ingest-pdf.ts --file="path.pdf" --name="Name" [--quick]');
        process.exit(1);
    }
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) throw new Error('❌ Missing Supabase env vars');
    if (!openaiKey) throw new Error('❌ Missing OPENAI_API_KEY');

    console.log('\n' + '═'.repeat(60));
    console.log('📄 PDF Ingestion Pipeline');
    console.log(`   Embedding: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
    console.log('   Q&A:       OpenAI GPT-4o');
    console.log('═'.repeat(60));
    console.log(`📁 File:    ${filePath}`);
    console.log(`📝 Source:  ${sourceName}`);
    console.log(`🧠 Mode:    ${quickMode ? 'QUICK (no Q&A)' : 'DEEP (GPT-4o Q&A per chunk)'}\n`);

    // Read PDF
    console.log('📖 Reading PDF…');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const pdfData = await pdfParse(fs.readFileSync(filePath));
    console.log(`   ${pdfData.numpages} pages · ${pdfData.text.length.toLocaleString()} chars`);

    // Clean + chunk
    console.log('🧹 Cleaning…');
    const cleaned = cleanText(pdfData.text);
    const chunks = buildChunks(cleaned, chunkSize, chunkOverlap);
    const sections = [...new Set(chunks.map(c => c.section))];
    console.log(`✂️  ${chunks.length} chunks across ${sections.length} sections`);
    sections.forEach(s => console.log(`   📂 ${s}`));
    console.log('');

    // Init clients
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }, global: { fetch: customFetch as never },
    });
    await warnOrClearExistingEmbeddings(supabase);

    // OpenAI for Q&A generation (optional, only in deep mode)
    const openAILlm = !quickMode ? new ChatOpenAI({
        modelName: 'gpt-4o',
        apiKey: openaiKey,
        temperature: 0.2,
        maxTokens: 512,
    }) : null;

    let success = 0;
    let errors = 0;

    console.log(`🚀 Processing ${chunks.length} chunks…\n`);

    const preparedBatch: PreparedChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const id = `pdf_${sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${String(i).padStart(4, '0')}`;
        const prog = `[${i + 1}/${chunks.length}]`;

        try {
            let qa: QAPair;

            if (!quickMode && openAILlm) {
                process.stdout.write(`   🧠 ${prog} "${chunk.section}"…`);
                qa = await generateQA(chunk, sourceName, openAILlm);
                process.stdout.write(' ✓\n');
            } else {
                qa = {
                    question: `[${chunk.section}] ${sourceName} — part ${i + 1}`,
                    answer: chunk.content.substring(0, 400),
                    keywords: chunk.section.toLowerCase().split(/\s+/).filter(w => w.length > 3),
                    category: 'General Knowledge',
                };
            }

            preparedBatch.push({
                id,
                chunk,
                qa,
                embText: buildEmbeddingText(qa, chunk, sourceName),
            });

            const shouldFlush = preparedBatch.length >= EMBEDDING_BATCH_SIZE || i === chunks.length - 1;
            if (shouldFlush) {
                const result = await flushPreparedChunks(supabase, sourceName, preparedBatch);
                success += result.success;
                errors += result.errors;
                preparedBatch.length = 0;
            }

            // Throttle between chunks
            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 200));

        } catch (err: unknown) {
            console.error(`   ❌ ${prog} ${(err as Error).message}`);
            errors++;
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('✅ Ingestion complete!');
    console.log(`   Mode:     ${quickMode ? 'QUICK' : 'DEEP'}`);
    console.log(`   Success:  ${success}/${chunks.length}`);
    if (errors > 0) console.log(`   Errors:   ${errors}`);
    console.log(`   Source:   ${sourceName}`);
    console.log('═'.repeat(60) + '\n');
}

ingestPdf().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});
