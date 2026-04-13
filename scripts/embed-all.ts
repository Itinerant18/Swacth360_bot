/**
 * scripts/embed-all.ts
 *
 * Unified embedding script — ingests ALL knowledge base JSON files into
 * Supabase `hms_knowledge` with OpenAI embeddings.
 *
 * Supported formats:
 *   - QA format:  { id, question, answer, category, subcategory, product, tags }
 *   - RAG docs:   { id, text, source, section, page_start, page_end, word_count, pdf_file }
 *
 * Usage:
 *   npx tsx scripts/embed-all.ts
 *   CLEAR_EMBEDDINGS=true npx tsx scripts/embed-all.ts   # wipe + re-embed
 */

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    embedTexts,
} from '../src/lib/embeddings';

loadEnvConfig(process.cwd());

// ── DNS fix (IPv4 first via Google DNS) ───────────────────────────────
dns.setDefaultResultOrder('ipv4first');
const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);

function customLookup(
    hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address?: string, family?: number) => void,
): void {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}

const agent = new Agent({ connect: { family: 4, lookup: customLookup as never } });
const customFetch = (input: unknown, init?: unknown) =>
    undiciFetch(
        input as Parameters<typeof undiciFetch>[0],
        { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: agent } as Parameters<typeof undiciFetch>[1],
    ) as unknown as Promise<Response>;

// ── Configuration ─────────────────────────────────────────────────────

/** Files to embed — order matters (QA first, then RAG docs) */
const DATA_FILES = [
    'data/hms-dexter-qa.json',
    'data/hms-dexter-qa2.json',
    'data/hms_rag_docs1.json',
];

// ── Type definitions ──────────────────────────────────────────────────

interface QAEntry {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory: string;
    product: string;
    tags: string[];
    last_reviewed?: string;
}

interface RAGDocEntry {
    id: string;
    text: string;
    source: string;
    section: string;
    page_start: number;
    page_end: number;
    word_count: number;
    chars?: number;
    pdf_file: string;
}

interface NormalizedEntry {
    id: string;
    question: string;
    answer: string;
    category: string;
    subcategory: string;
    product: string;
    tags: string[];
    content: string;
    source: string;
    source_name: string;
    chunk_type: string;
}

// ── Format detection ──────────────────────────────────────────────────

type DetectedFormat = 'qa' | 'rag-doc' | 'unknown';

function detectFormat(sample: Record<string, unknown>): DetectedFormat {
    if ('question' in sample && 'answer' in sample && 'category' in sample) {
        return 'qa';
    }
    if ('text' in sample && 'source' in sample && 'section' in sample) {
        return 'rag-doc';
    }
    return 'unknown';
}

// ── Normalizers ───────────────────────────────────────────────────────

function normalizeQA(item: QAEntry, sourceFile: string): NormalizedEntry {
    const tagPhrases = item.tags.map((t) => t.toLowerCase()).join(', ');
    const altPhrasings = [
        `How to handle ${item.subcategory.toLowerCase()} issues`,
        `${item.subcategory} troubleshooting for ${item.product}`,
        `${item.category} - ${item.subcategory}`,
    ].join('. ');

    const content = [
        `Product: ${item.product}`,
        `Category: ${item.category}`,
        `Subcategory: ${item.subcategory}`,
        `Keywords: ${tagPhrases}`,
        `Related topics: ${altPhrasings}`,
        `Question: ${item.question}`,
        `Answer: ${item.answer}`,
        `Summary: ${item.subcategory} - ${item.question}`,
    ].join('\n');

    return {
        id: item.id,
        question: item.question,
        answer: item.answer,
        category: item.category,
        subcategory: item.subcategory,
        product: item.product,
        tags: item.tags,
        content,
        source: 'json',
        source_name: sourceFile,
        chunk_type: 'qa',
    };
}

function normalizeRAGDoc(item: RAGDocEntry, sourceFile: string): NormalizedEntry {
    // Skip near-empty chunks (< 10 words are usually headers/noise)
    const trimmedText = item.text.trim();

    // Build a descriptive question from the section context
    const question = item.section
        ? `${item.source} — ${item.section} (Page ${item.page_start})`
        : `${item.source} (Page ${item.page_start})`;

    const content = [
        `Source: ${item.source}`,
        `Section: ${item.section}`,
        `Pages: ${item.page_start}–${item.page_end}`,
        `Content: ${trimmedText}`,
    ].join('\n');

    // Extract meaningful tags from source, section, and pdf_file
    const tags: string[] = [];
    if (item.section) tags.push(item.section);
    if (item.pdf_file) tags.push(item.pdf_file.replace('.pdf', ''));

    return {
        id: `rag1-${item.id}`,  // prefix to avoid collision with other chunk IDs
        question,
        answer: trimmedText,
        category: item.source || 'HMS Manual',
        subcategory: item.section || 'General',
        product: 'HMS Panel',
        tags,
        content,
        source: 'pdf',
        source_name: sourceFile,
        chunk_type: 'chunk',
    };
}

// ── Supabase helpers ──────────────────────────────────────────────────

async function countExistingEmbeddings(supabase: any): Promise<number> {
    const { count, error } = await supabase
        .from('hms_knowledge')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    if (error) {
        console.warn('[embed-all] failed to count existing embeddings:', error.message);
        return 0;
    }

    return count ?? 0;
}

async function clearAllEmbeddings(supabase: any): Promise<void> {
    console.warn('[embed-all] CLEAR_EMBEDDINGS=true — removing all hms_knowledge rows...');
    const { error } = await supabase
        .from('hms_knowledge')
        .delete()
        .neq('id', '');

    if (error) {
        throw new Error(`[embed-all] clear failed: ${error.message}`);
    }

    console.log('[embed-all] ✓ All existing rows cleared.');
}

// ── Main ──────────────────────────────────────────────────────────────

async function embedAll(): Promise<void> {
    const startTime = Date.now();

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  SAI — Unified Knowledge Base Embedder');
    console.log(`${'═'.repeat(60)}`);

    // ── Validate env ──────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    if (!openaiKey) {
        throw new Error('Missing OPENAI_API_KEY');
    }

    console.log(`\n  Embedding model:  ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
    console.log(`  Batch size:       ${EMBEDDING_BATCH_SIZE}`);
    console.log(`  Supabase:         ${supabaseUrl}`);
    console.log(`  Mode:             Upsert (preserves existing data)`);

    // ── Connect Supabase ──────────────────────────────────────────────
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });

    const existingCount = await countExistingEmbeddings(supabase);
    console.log(`  Existing rows:    ${existingCount}`);

    if (process.env.CLEAR_EMBEDDINGS === 'true') {
        await clearAllEmbeddings(supabase);
    }

    // ── Load & normalize all files ────────────────────────────────────
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  Phase 1: Loading data files');
    console.log(`${'─'.repeat(60)}`);

    const allEntries: NormalizedEntry[] = [];
    const fileSummaries: { file: string; format: string; count: number; skipped: number }[] = [];

    for (const relPath of DATA_FILES) {
        const fullPath = path.join(process.cwd(), relPath);
        const fileName = path.basename(relPath);

        if (!fs.existsSync(fullPath)) {
            console.warn(`  ⚠ File not found: ${relPath} — skipping`);
            continue;
        }

        const rawData = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        const items: Record<string, unknown>[] = Array.isArray(rawData) ? rawData : [rawData];

        if (items.length === 0) {
            console.warn(`  ⚠ No entries in ${fileName} — skipping`);
            continue;
        }

        const format = detectFormat(items[0]);
        let added = 0;
        let skipped = 0;

        for (const item of items) {
            try {
                if (format === 'qa') {
                    allEntries.push(normalizeQA(item as unknown as QAEntry, fileName));
                    added++;
                } else if (format === 'rag-doc') {
                    const doc = item as unknown as RAGDocEntry;
                    // Skip chunks that are too short (< 10 words = noise)
                    if (doc.word_count < 10) {
                        skipped++;
                        continue;
                    }
                    allEntries.push(normalizeRAGDoc(doc, fileName));
                    added++;
                } else {
                    skipped++;
                }
            } catch {
                skipped++;
            }
        }

        fileSummaries.push({ file: fileName, format, count: added, skipped });
        console.log(`  ✓ ${fileName.padEnd(25)} ${format.padEnd(10)} ${added} entries${skipped > 0 ? ` (${skipped} skipped)` : ''}`);
    }

    if (allEntries.length === 0) {
        throw new Error('[embed-all] No entries to embed after loading all files.');
    }

    console.log(`\n  Total entries to embed: ${allEntries.length}`);

    // ── Phase 2: Embed & upsert ───────────────────────────────────────
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  Phase 2: Generating embeddings & upserting');
    console.log(`${'─'.repeat(60)}\n`);

    const batchSize = EMBEDDING_BATCH_SIZE;
    let totalSuccess = 0;
    let totalErrors = 0;
    const totalBatches = Math.ceil(allEntries.length / batchSize);

    for (let i = 0; i < allEntries.length; i += batchSize) {
        const batch = allEntries.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const pct = Math.round((i / allEntries.length) * 100);

        process.stdout.write(
            `  Batch ${String(batchNum).padStart(3)}/${totalBatches}  [${pct}%]  items ${i + 1}–${Math.min(i + batchSize, allEntries.length)}  `,
        );

        // Generate embeddings
        let vectors: number[][];
        try {
            vectors = await embedTexts(batch.map((e) => e.content));
        } catch (err) {
            console.log(`✗ embedding failed: ${err instanceof Error ? err.message : String(err)}`);
            totalErrors += batch.length;
            continue;
        }

        // Upsert to Supabase
        let batchSuccess = 0;
        let batchErrors = 0;

        for (let j = 0; j < batch.length; j++) {
            const entry = batch[j];
            try {
                const { error } = await supabase.from('hms_knowledge').upsert({
                    id: entry.id,
                    question: entry.question,
                    answer: entry.answer,
                    category: entry.category,
                    subcategory: entry.subcategory,
                    product: entry.product,
                    tags: entry.tags,
                    content: entry.content,
                    embedding: `[${vectors[j].join(',')}]`,
                    source: entry.source,
                    source_name: entry.source_name,
                    chunk_type: entry.chunk_type,
                }, { onConflict: 'id' });

                if (error) {
                    batchErrors++;
                    if (batchErrors <= 2) {
                        console.error(`\n    ✗ ${entry.id}: ${error.message}`);
                    }
                } else {
                    batchSuccess++;
                }
            } catch (err) {
                batchErrors++;
                if (batchErrors <= 2) {
                    console.error(`\n    ✗ ${entry.id}: ${err instanceof Error ? err.message : String(err)}`);
                }
            }
        }

        totalSuccess += batchSuccess;
        totalErrors += batchErrors;

        console.log(`✓ ${batchSuccess}/${batch.length}${batchErrors > 0 ? ` (${batchErrors} errs)` : ''}`);

        // Rate-limit delay between batches
        if (i + batchSize < allEntries.length) {
            await new Promise((resolve) => setTimeout(resolve, 400));
        }
    }

    // ── Summary ───────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n${'═'.repeat(60)}`);
    console.log('  Embedding Complete');
    console.log(`${'═'.repeat(60)}`);
    console.log(`  Success:    ${totalSuccess}/${allEntries.length}`);
    if (totalErrors > 0) {
        console.log(`  Errors:     ${totalErrors}`);
    }
    console.log(`  Duration:   ${elapsed}s`);
    console.log('');
    console.log('  Files processed:');
    for (const summary of fileSummaries) {
        console.log(`    ${summary.file.padEnd(25)} ${summary.format.padEnd(10)} ${summary.count} entries`);
    }
    console.log(`${'═'.repeat(60)}\n`);
}

embedAll().catch((err) => {
    console.error('\n  ✗ Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
