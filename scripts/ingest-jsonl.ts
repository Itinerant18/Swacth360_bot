/**
 * scripts/ingest-jsonl.ts
 *
 * Seeds LangExtract JSONL output into hms_knowledge with OpenAI embeddings.
 *
 * This is the Node.js counterpart to langextract-ingest.py.
 * LangExtract extracts structured entities → this script embeds + seeds them.
 *
 * Usage:
 *   npx tsx scripts/ingest-jsonl.ts --file="data/langextract/manual_extracted.jsonl" --name="Anybus Manual v2.3"
 *   npx tsx scripts/ingest-jsonl.ts --file="data/langextract/guide_extracted.jsonl"
 *
 * Pipeline position:
 *   langextract-ingest.py → [JSONL file] → THIS SCRIPT → Supabase hms_knowledge
 */

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

loadEnvConfig(process.cwd());

// ─── DNS / Fetch fix (same as other scripts) ─────────────────
dns.setDefaultResultOrder('ipv4first');
const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);
function customLookup(hostname: string, _opts: any, cb: Function) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}
const agent = new Agent({ connect: { family: 4, lookup: customLookup as any } });
const customFetch = (input: any, init?: any) =>
    undiciFetch(input, { ...init, dispatcher: agent }) as unknown as Promise<Response>;

// ─── CLI Args ────────────────────────────────────────────────
function parseArgs() {
    const args: Record<string, string> = {};
    for (const a of process.argv.slice(2)) {
        const kv = a.match(/^--(\w+)=(.+)$/);
        if (kv) args[kv[1]] = kv[2];
    }
    return args;
}

// ─── JSONL Entry Type ─────────────────────────────────────────
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

// ─── Main ─────────────────────────────────────────────────────
async function ingestJsonl() {
    const args = parseArgs();
    const filePath = args.file;
    const sourceName = args.name || '';
    const BATCH_SIZE = 20; // OpenAI embedding batch size

    if (!filePath) {
        console.error('❌ Usage: npx tsx scripts/ingest-jsonl.ts --file="path.jsonl" [--name="Source Name"]');
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

    // Read JSONL
    const entries: LangExtractEntry[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    for await (const line of rl) {
        const trimmed = line.trim();
        if (trimmed) {
            try { entries.push(JSON.parse(trimmed)); } catch { /* skip malformed */ }
        }
    }

    if (entries.length === 0) {
        console.error('❌ No valid entries found in JSONL file');
        process.exit(1);
    }

    const finalSourceName = sourceName || entries[0]?.source_name || path.basename(filePath, '.jsonl');

    // Count by entity class
    const classCounts: Record<string, number> = {};
    entries.forEach(e => { classCounts[e.entity_class] = (classCounts[e.entity_class] || 0) + 1; });

    console.log('\n' + '═'.repeat(60));
    console.log('🌱 LangExtract JSONL Seeder (OpenAI Embeddings)');
    console.log('═'.repeat(60));
    console.log(`📄 File:       ${filePath}`);
    console.log(`📝 Source:     ${finalSourceName}`);
    console.log(`📦 Entries:    ${entries.length}`);
    console.log(`🔠 Embedding:  OpenAI text-embedding-3-small (1536-dim)`);
    console.log(`\n   Entity type breakdown:`);
    Object.entries(classCounts).forEach(([cls, count]) => {
        const icon = { ErrorCode: '⚠️ ', WiringSpec: '🔌', TechnicalParam: '📐', Procedure: '📋', ComponentSpec: '⚙️ ' }[cls] || '📄';
        console.log(`     ${icon}  ${cls.padEnd(20)} ${count}`);
    });
    console.log('');

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as any },
    });

    const embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small',
        openAIApiKey: openaiKey,
    });

    let success = 0;
    let errors = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const total = Math.ceil(entries.length / BATCH_SIZE);

        console.log(`\n⏳ Batch ${String(batchNum).padStart(3)}/${total}  (entries ${i + 1}–${Math.min(i + BATCH_SIZE, entries.length)})`);

        // Embed entire batch in one call
        let vectors: number[][];
        try {
            vectors = await embeddings.embedDocuments(batch.map(e => e.content));
        } catch (err: any) {
            console.error(`   ❌ Batch embedding failed: ${err.message}`);
            errors += batch.length;
            continue;
        }

        for (let j = 0; j < batch.length; j++) {
            const entry = batch[j];
            // Override source_name if provided via CLI
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
                    embedding: vectors[j],
                    source: 'langextract',
                    source_name: finalEntry.source_name,
                }, { onConflict: 'id' });

                if (error) {
                    console.error(`   ❌ ${finalEntry.id}: ${error.message}`);
                    errors++;
                } else {
                    const icon = { ErrorCode: '⚠️ ', WiringSpec: '🔌', TechnicalParam: '📐', Procedure: '📋', ComponentSpec: '⚙️ ' }[entry.entity_class] || '📄';
                    console.log(`   ✅ ${icon} [${entry.entity_class}] ${finalEntry.question.substring(0, 60)}…`);
                    success++;
                }
            } catch (err: any) {
                console.error(`   ❌ ${finalEntry.id}: ${err.message}`);
                errors++;
            }
        }

        if (i + BATCH_SIZE < entries.length) await new Promise(r => setTimeout(r, 300));
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log('✅ Seeding complete!');
    console.log(`   Success:  ${success}/${entries.length}`);
    if (errors > 0) console.log(`   Errors:   ${errors}`);
    console.log(`   Source:   ${finalSourceName} (source='langextract' in Supabase)`);
    console.log(`\n💡 Check admin → Analytics → Knowledge Base`);
    console.log(`   LangExtract entries show as source='langextract' with entity type labels`);
    console.log('═'.repeat(60) + '\n');
}

ingestJsonl().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});