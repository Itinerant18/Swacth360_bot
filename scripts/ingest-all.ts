/**
 * scripts/ingest-all.ts
 *
 * Unified knowledge base orchestrator.
 * Clears database, seeds JSON datasets, seeds PDFs, seeds diagrams, and builds the RAPTOR tree.
 *
 * Usage:
 *   npx tsx scripts/ingest-all.ts
 */

import { loadEnvConfig } from '@next/env';
import { execSync } from 'child_process';
import { getLLM } from '../src/lib/llm';
import { buildRaptorTree } from '../src/lib/raptor-builder';
import dns from 'node:dns';

loadEnvConfig(process.cwd());

// DNS / Fetch fix for Windows IPv6
dns.setDefaultResultOrder('ipv4first');

async function run() {
    console.log('============================================================');
    console.log('🚀 HMS KNOWLEDGE BASE - COMPLETE INGESTION PIPELINE');
    console.log('============================================================\n');

    const steps = [
        { name: '🧹 CLEAR DATABASE', cmd: 'npx tsx scripts/clear.ts' },
        { name: '📚 SEED JSON DATASETS (hms-dexter-qa & hms_rag_docs)', cmd: 'npx tsx scripts/embed-all.ts' },
        { name: '📄 SEED PDF MANUALS (Option C + GPT-4o)', cmd: 'npx tsx scripts/seed-pdfs.ts' },
        { name: '🖼️  SEED DIAGRAMS v2', cmd: 'npx tsx scripts/ingest-diagram.ts --dir="data/SAI-TECH-SUPPORT DEXTER HMS PANNEL RELATED QUESTION v2"' },
    ];

    for (const step of steps) {
        console.log(`\n🔹 [STEP] Running ${step.name}...`);
        try {
            execSync(step.cmd, { stdio: 'inherit' });
            console.log(`✅ [SUCCESS] ${step.name} completed successfully.`);
        } catch (err) {
            console.error(`❌ [ERROR] ${step.name} failed!`);
            console.error((err as Error).message);
            process.exit(1);
        }
    }

    console.log('\n🔹 [STEP] Building RAPTOR Hierarchical Tree...');
    try {
        const llm = getLLM('complex', { temperature: 0.1 });
        const stats = await buildRaptorTree(llm, { triggeredBy: 'manual' });
        console.log('✅ [SUCCESS] RAPTOR Tree built successfully!');
        console.log('📈 RAPTOR Stats:', stats);
    } catch (err) {
        console.error('❌ [ERROR] RAPTOR Tree build failed!');
        console.error((err as Error).message);
    }

    console.log('\n============================================================');
    console.log('🎉 ALL INGESTION STEPS COMPLETED SUCCESSFULLY!');
    console.log('============================================================');
}

run().catch(console.error);
