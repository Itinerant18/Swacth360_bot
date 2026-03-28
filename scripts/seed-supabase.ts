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

function buildEmbeddingText(item: {
    tags: string[];
    subcategory: string;
    product: string;
    category: string;
    question: string;
    answer: string;
}): string {
    const tagPhrases = item.tags.map((tag: string) => tag.toLowerCase()).join(', ');
    const altPhrasings = [
        `How to handle ${item.subcategory.toLowerCase()} issues`,
        `${item.subcategory} troubleshooting for ${item.product}`,
        `${item.category} - ${item.subcategory}`,
    ].join('. ');

    return [
        `Product: ${item.product}`,
        `Category: ${item.category}`,
        `Subcategory: ${item.subcategory}`,
        `Keywords: ${tagPhrases}`,
        `Related topics: ${altPhrasings}`,
        `Question: ${item.question}`,
        `Answer: ${item.answer}`,
        `Summary: ${item.subcategory} - ${item.question}`,
    ].join('\n');
}

async function warnOrClearExistingEmbeddings(
    supabase: any,
): Promise<void> {
    const { count, error: countError } = await supabase
        .from('hms_knowledge')
        .select('id', { count: 'exact', head: true })
        .not('embedding', 'is', null);

    if (countError) {
        console.warn('[seed-supabase] failed to count existing embeddings:', countError.message);
        return;
    }

    if ((count ?? 0) > 0) {
        console.warn(
            `[seed-supabase] detected ${count} existing embedded rows. Re-ingest all content after embedding model changes to avoid mixed vectors.`,
        );
    }

    if (process.env.CLEAR_EMBEDDINGS !== 'true') {
        return;
    }

    console.warn('[seed-supabase] CLEAR_EMBEDDINGS=true - removing existing hms_knowledge rows before import');
    const { error: deleteError } = await supabase
        .from('hms_knowledge')
        .delete()
        .neq('id', '');

    if (deleteError) {
        throw new Error(`[seed-supabase] failed to clear existing embeddings: ${deleteError.message}`);
    }
}

async function seed(): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log('SAI - Supabase Seeder');
    console.log('='.repeat(60));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    if (!openaiKey) {
        throw new Error('Missing OPENAI_API_KEY in environment');
    }

    const dataFilesEnv = process.env.DATA_FILE || 'data/hms-dexter-qa.json';
    const dataFiles = dataFilesEnv.split(',').map((f) => f.trim());

    type QAItem = {
        id: string;
        question: string;
        answer: string;
        category: string;
        subcategory: string;
        product: string;
        tags: string[];
        _source_file?: string;
    };

    const qaData: QAItem[] = [];

    for (const file of dataFiles) {
        const targetPath = path.join(process.cwd(), file);
        if (!fs.existsSync(targetPath)) {
            console.warn(`[warning] Dataset file or folder not found: ${targetPath}`);
            continue;
        }

        let filesToProcess: string[] = [];
        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) {
            const dirFiles = fs.readdirSync(targetPath);
            filesToProcess = dirFiles
                .filter((f) => f.endsWith('.json'))
                .map((f) => path.join(targetPath, f));
        } else {
            filesToProcess.push(targetPath);
        }

        for (const filePath of filesToProcess) {
            console.log(`Loading dataset from: ${filePath}`);
            const fileBaseName = path.basename(filePath);
            const data: QAItem[] | QAItem = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            
            if (Array.isArray(data)) {
                data.forEach((item) => {
                    item._source_file = fileBaseName;
                    qaData.push(item);
                });
            } else if (data && typeof data === 'object') {
                data._source_file = fileBaseName;
                qaData.push(data);
            }
        }
    }

    if (qaData.length === 0) {
        throw new Error('No valid dataset found in provided DATA_FILE path(s).');
    }

    console.log(`Datasets:  ${dataFiles.join(', ')}`);
    console.log(`Entries:   ${qaData.length}`);
    console.log(`Embedding: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS} dims)`);
    console.log(`Supabase:  ${supabaseUrl}\n`);

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });

    await warnOrClearExistingEmbeddings(supabase);

    const batchSize = EMBEDDING_BATCH_SIZE;
    let success = 0;
    let errors = 0;

    for (let index = 0; index < qaData.length; index += batchSize) {
        const batch = qaData.slice(index, index + batchSize);
        const batchNumber = Math.floor(index / batchSize) + 1;
        const totalBatches = Math.ceil(qaData.length / batchSize);

        console.log(
            `\nBatch ${String(batchNumber).padStart(3)}/${totalBatches} (items ${index + 1}-${Math.min(index + batchSize, qaData.length)})`,
        );

        const embeddingTexts = batch.map((item) => buildEmbeddingText(item));

        let vectors: number[][];
        try {
            vectors = await embedTexts(embeddingTexts);
        } catch (batchErr) {
            console.error(`  Batch embedding failed: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
            errors += batch.length;
            continue;
        }

        for (let offset = 0; offset < batch.length; offset++) {
            const item = batch[offset];

            try {
                const { error } = await supabase.from('hms_knowledge').upsert({
                    id: item.id,
                    question: item.question,
                    answer: item.answer,
                    category: item.category,
                    subcategory: item.subcategory,
                    product: item.product,
                    tags: item.tags,
                    content: embeddingTexts[offset],
                    embedding: `[${vectors[offset].join(',')}]`,
                    source: 'json',
                    source_name: item._source_file || 'json',
                }, { onConflict: 'id' });

                if (error) {
                    console.error(`  ${item.id}: ${error.message}`);
                    errors++;
                } else {
                    console.log(`  OK ${item.id}: "${item.question.substring(0, 60)}..."`);
                    success++;
                }
            } catch (err) {
                console.error(`  ${item.id}: ${err instanceof Error ? err.message : String(err)}`);
                errors++;
            }
        }

        if (index + batchSize < qaData.length) {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('Seeding complete');
    console.log(`Success: ${success}/${qaData.length}`);
    if (errors > 0) {
        console.log(`Errors:  ${errors}`);
    }
    console.log(`\nRe-run if you change ${dataFiles.join(', ')}`);
    console.log('='.repeat(60));
}

seed().catch((err) => {
    console.error('\nFatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
});
