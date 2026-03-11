

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';

// ─── DNS / Fetch fix (Windows / IPv6) ───────────────────────
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

loadEnvConfig(process.cwd());

// ─── Build rich embedding text ────────────────────────────────
function buildEmbeddingText(item: { tags: string[]; subcategory: string; product: string; category: string; question: string; answer: string }): string {
    const tagPhrases = item.tags.map((t: string) => t.toLowerCase()).join(', ');

    const altPhrasings = [
        `How to handle ${item.subcategory.toLowerCase()} issues`,
        `${item.subcategory} troubleshooting for ${item.product}`,
        `${item.category} — ${item.subcategory}`,
    ].join('. ');

    return [
        `Product: ${item.product}`,
        `Category: ${item.category}`,
        `Subcategory: ${item.subcategory}`,
        `Keywords: ${tagPhrases}`,
        `Related topics: ${altPhrasings}`,
        `Question: ${item.question}`,
        `Answer: ${item.answer}`,
        `Summary: ${item.subcategory} — ${item.question}`,
    ].join('\n');
}

async function seed() {
    console.log('\n' + '═'.repeat(60));
    console.log('🌱 Dexter HMS — Supabase Seeder (OpenAI Embeddings)');
    console.log('═'.repeat(60) + '\n');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    if (!openaiKey) {
        throw new Error('❌ Missing OPENAI_API_KEY in .env');
    }

    const dataFile = process.env.DATA_FILE || 'data/hms-dexter-qa.json';
    const dataPath = path.join(process.cwd(), dataFile);

    if (!fs.existsSync(dataPath)) {
        throw new Error(`❌ Dataset not found: ${dataPath}`);
    }

    const qaData: { id: string; question: string; answer: string; category: string; subcategory: string; product: string; tags: string[] }[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    console.log(`📚 Dataset:   ${dataFile}`);
    console.log(`📦 Entries:   ${qaData.length}`);
    console.log(`🔠 Embedding: OpenAI text-embedding-3-small (1536-dim)`);
    console.log(`🗄️  Supabase:  ${supabaseUrl}\n`);

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });

    // OpenAI embedding client — supports batching natively
    const embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small',
        openAIApiKey: openaiKey,
    });

    // Process in batches of 20 (OpenAI allows large batches efficiently)
    const BATCH = 20;
    let success = 0;
    let errors = 0;

    for (let i = 0; i < qaData.length; i += BATCH) {
        const batch = qaData.slice(i, i + BATCH);
        const batchNum = Math.floor(i / BATCH) + 1;
        const total = Math.ceil(qaData.length / BATCH);

        console.log(`\n⏳ Batch ${String(batchNum).padStart(3)}/${total}  (items ${i + 1}–${Math.min(i + BATCH, qaData.length)})`);

        // Build all embedding texts for this batch
        const embeddingTexts = batch.map(item => buildEmbeddingText(item));

        // Embed entire batch in ONE OpenAI API call (much faster than one-by-one)
        let vectors: number[][];
        try {
            vectors = await embeddings.embedDocuments(embeddingTexts);
        } catch (batchErr: unknown) {
            console.error(`   ❌ Batch embedding failed: ${(batchErr as Error).message}`);
            errors += batch.length;
            continue;
        }

        // Upsert each item with its vector
        for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            try {
                const { error } = await supabase.from('hms_knowledge').upsert({
                    id: item.id,
                    question: item.question,
                    answer: item.answer,
                    category: item.category,
                    subcategory: item.subcategory,
                    product: item.product,
                    tags: item.tags,
                    content: embeddingTexts[j],
                    embedding: vectors[j],
                    source: 'json',
                    source_name: dataFile,
                }, { onConflict: 'id' });

                if (error) {
                    console.error(`   ❌ ${item.id}: ${error.message}`);
                    errors++;
                } else {
                    console.log(`   ✅ ${item.id}: "${item.question.substring(0, 60)}…"`);
                    success++;
                }
            } catch (err: unknown) {
                console.error(`   ❌ ${item.id}: ${(err as Error).message}`);
                errors++;
            }
        }

        // Small delay between batches (be polite to the API)
        if (i + BATCH < qaData.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('✅ Seeding complete!');
    console.log(`   Success: ${success}/${qaData.length}`);
    if (errors > 0) console.log(`   Errors:  ${errors}`);
    console.log(`\n💡 Re-run if you change ${dataFile}`);
    console.log('═'.repeat(60) + '\n');
}

seed().catch(err => {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
});