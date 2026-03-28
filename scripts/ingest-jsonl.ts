/**
 * scripts/ingest-jsonl.ts
 *
 * Seeds LangExtract JSONL output into hms_knowledge with OpenAI embeddings.
 *
 * Usage:
 *   npx tsx scripts/ingest-jsonl.ts --file="data/langextract/manual_extracted.jsonl" --name="Anybus Manual v2.3"
 *   npx tsx scripts/ingest-jsonl.ts --file="data/langextract/guide_extracted.jsonl"
 */

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
    EMBEDDING_BATCH_SIZE,
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    embedTexts,
} from '../src/lib/embeddings';

loadEnvConfig(process.cwd());

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

function parseArgs(): Record<string, string> {
    const args: Record<string, string> = {};
    for (const arg of process.argv.slice(2)) {
        const kv = arg.match(/^--(\w+)=(.+)$/);
        if (kv) {
            args[kv[1]] = kv[2];
        }
    }
    return args;
}

interface LangExtractEntry {
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
    entity_class: string;
    source_text: string;
    attributes: Record<string, string>;
}

async function warnOrClearExistingEmbeddings(
    supabase: ReturnType<typeof createClient>,
): Promise<void> {
    const { count, error: countError } = await supabase
        .from('hms_knowledge')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    if (countError) {
        console.warn('[ingest-jsonl] failed to count existing embeddings:', countError.message);
        return;
    }

    if ((count ?? 0) > 0) {
        console.warn(
            `[ingest-jsonl] detected ${count} existing embedded rows. Re-ingest all content after embedding model changes to avoid mixed vectors.`,
        );
    }

    if (process.env.CLEAR_EMBEDDINGS !== 'true') {
        return;
    }

    console.warn('[ingest-jsonl] CLEAR_EMBEDDINGS=true - removing existing hms_knowledge rows before import');
    const { error: deleteError } = await supabase
        .from('hms_knowledge')
        .delete()
        .neq('id', '');

    if (deleteError) {
        throw new Error(`[ingest-jsonl] failed to clear existing embeddings: ${deleteError.message}`);
    }
}

async function ingestJsonl(): Promise<void> {
    const args = parseArgs();
    const filePath = args.file;
    const sourceName = args.name || '';
    const batchSize = EMBEDDING_BATCH_SIZE;

    if (!filePath) {
        console.error('Usage: npx tsx scripts/ingest-jsonl.ts --file="path.jsonl" [--name="Source Name"]');
        process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase env vars');
    }

    if (!openaiKey) {
        throw new Error('Missing OPENAI_API_KEY');
    }

    const entries: LangExtractEntry[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        try {
            entries.push(JSON.parse(trimmed));
        } catch (err) {
            console.warn('[ingest-jsonl] skipping malformed line:', err instanceof Error ? err.message : String(err));
        }
    }

    if (entries.length === 0) {
        console.error('No valid entries found in JSONL file');
        process.exit(1);
    }

    const finalSourceName = sourceName || entries[0]?.source_name || path.basename(filePath, '.jsonl');
    const classCounts: Record<string, number> = {};
    entries.forEach((entry) => {
        classCounts[entry.entity_class] = (classCounts[entry.entity_class] || 0) + 1;
    });

    console.log(`\n${'='.repeat(60)}`);
    console.log('LangExtract JSONL Seeder');
    console.log('='.repeat(60));
    console.log(`File:       ${filePath}`);
    console.log(`Source:     ${finalSourceName}`);
    console.log(`Entries:    ${entries.length}`);
    console.log(`Embedding:  ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
    console.log('\nEntity type breakdown:');
    Object.entries(classCounts).forEach(([entityClass, count]) => {
        console.log(`  ${entityClass.padEnd(20)} ${count}`);
    });
    console.log('');

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });

    await warnOrClearExistingEmbeddings(supabase);

    let success = 0;
    let errors = 0;

    for (let index = 0; index < entries.length; index += batchSize) {
        const batch = entries.slice(index, index + batchSize);
        const batchNumber = Math.floor(index / batchSize) + 1;
        const totalBatches = Math.ceil(entries.length / batchSize);

        console.log(
            `\nBatch ${String(batchNumber).padStart(3)}/${totalBatches} (entries ${index + 1}-${Math.min(index + batchSize, entries.length)})`,
        );

        let vectors: number[][];
        try {
            vectors = await embedTexts(batch.map((entry) => entry.content));
        } catch (err) {
            console.error(`  Batch embedding failed: ${err instanceof Error ? err.message : String(err)}`);
            errors += batch.length;
            continue;
        }

        for (let offset = 0; offset < batch.length; offset++) {
            const entry = batch[offset];
            const finalEntry = { ...entry, source_name: finalSourceName };

            try {
                const { error } = await supabase.from('hms_knowledge').upsert({
                    id: finalEntry.id,
                    question: finalEntry.question,
                    answer: finalEntry.answer,
                    category: finalEntry.category,
                    subcategory: finalEntry.subcategory,
                    product: finalEntry.product || 'HMS Panel',
                    tags: finalEntry.tags,
                    content: finalEntry.content,
                    embedding: vectors[offset],
                    source: 'langextract',
                    source_name: finalEntry.source_name,
                }, { onConflict: 'id' });

                if (error) {
                    console.error(`  ${finalEntry.id}: ${error.message}`);
                    errors++;
                    continue;
                }

                console.log(`  OK [${entry.entity_class}] ${finalEntry.question.substring(0, 60)}...`);
                success++;
            } catch (err) {
                console.error(`  ${finalEntry.id}: ${err instanceof Error ? err.message : String(err)}`);
                errors++;
            }
        }

        if (index + batchSize < entries.length) {
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Seeding complete');
    console.log(`Success:  ${success}/${entries.length}`);
    if (errors > 0) {
        console.log(`Errors:   ${errors}`);
    }
    console.log(`Source:   ${finalSourceName} (source='langextract')`);
    console.log('='.repeat(60));
}

ingestJsonl().catch((err) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
