/**
 * Quick diagnostic: tests whether query-time embeddings match stored embeddings.
 * Run: npx tsx scripts/test-embedding-match.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 1536;

async function main() {
    console.log(`\n=== Embedding Match Diagnostic ===`);
    console.log(`Model: ${EMBEDDING_MODEL}`);
    console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}`);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const testQuery = 'What is Modbus RTU and how is it used with HMS panels?';
    console.log(`\nTest query: "${testQuery}"`);

    console.log(`Generating query embedding with ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}d)...`);
    const embResponse = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: testQuery,
        dimensions: EMBEDDING_DIMENSIONS,
    });
    const queryVector = embResponse.data[0].embedding;
    console.log(`Query vector dimensions: ${queryVector.length}`);

    // Test: RPC search with very low threshold
    console.log(`\n--- search_hms_knowledge RPC (threshold=0.0) ---`);
    const { data, error } = await supabase.rpc('search_hms_knowledge', {
        query_embedding: queryVector,
        similarity_threshold: 0.0,
        match_count: 5,
    });

    if (error) {
        console.error(`RPC error: ${error.message}`);
        return;
    }

    if (!data || data.length === 0) {
        console.log(`❌ NO MATCHES AT ALL — something fundamentally broken`);
        return;
    }

    console.log(`${data.length} matches:`);
    for (const row of data as { similarity: number; question: string }[]) {
        console.log(`  [${row.similarity.toFixed(4)}] ${row.question?.slice(0, 90)}`);
    }

    const topSim = (data[0] as { similarity: number }).similarity;
    if (topSim < 0.15) {
        console.log(`\n❌ DIAGNOSIS: Top similarity ${topSim.toFixed(4)} is near-zero.`);
        console.log(`   Stored embeddings are from a DIFFERENT model than ${EMBEDDING_MODEL}.`);
        console.log(`   FIX: NULL all embeddings and re-ingest with ${EMBEDDING_MODEL}.`);
    } else if (topSim < 0.30) {
        console.log(`\n⚠️  Top similarity ${topSim.toFixed(4)} is low — partial mismatch or weak coverage.`);
    } else {
        console.log(`\n✅ Top similarity ${topSim.toFixed(4)} — embeddings match. Issue is in pipeline logic.`);
    }

    console.log(`\n=== Done ===\n`);
}

main().catch(console.error);
