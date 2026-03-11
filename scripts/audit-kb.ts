/**
 * audit-kb.ts — Knowledge Base Audit Tool
 *
 * Reports:
 *  1. Category coverage + gaps
 *  2. Short/empty answers
 *  3. Unknown questions from Supabase (gaps users actually hit)
 *
 * Usage: npx tsx scripts/audit-kb.ts
 */

import { createClient } from '@supabase/supabase-js';
import qaData from '../data/hms-dexter-qa.json';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env manually (no dotenv dependency needed)
try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && !key.startsWith('#')) process.env[key.trim()] = val.join('=').trim();
    });
} catch { /* .env not found, rely on existing env */ }

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 KNOWLEDGE BASE AUDIT');
    console.log('═══════════════════════════════════════════════════\n');

    // ─── 1. JSON QA Analysis ──────────────────────────────────
    const entries = qaData as { id: string; question: string; answer: string; category: string }[];
    console.log(`📚 Total JSON QA entries: ${entries.length}\n`);

    // Category breakdown
    const categories: Record<string, number> = {};
    entries.forEach(q => { categories[q.category] = (categories[q.category] || 0) + 1; });
    console.log('📂 Category Distribution:');
    Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .forEach(([cat, count]) => {
            const bar = '█'.repeat(Math.round(count / 2));
            const warning = count < 15 ? ' ⚠️ LOW' : '';
            console.log(`   ${cat.padEnd(45)} ${count.toString().padStart(3)} ${bar}${warning}`);
        });

    // Short answers
    const shortAnswers = entries.filter(q => q.answer.length < 50);
    if (shortAnswers.length > 0) {
        console.log(`\n⚠️  ${shortAnswers.length} entries have VERY SHORT answers (<50 chars):`);
        shortAnswers.slice(0, 5).forEach(q => {
            console.log(`   • [${q.id}] "${q.question.substring(0, 60)}..." → ${q.answer.length} chars`);
        });
    }

    // Empty answers
    const emptyAnswers = entries.filter(q => !q.answer || q.answer.trim() === '');
    if (emptyAnswers.length > 0) {
        console.log(`\n🚨 ${emptyAnswers.length} entries have EMPTY answers!`);
    }

    // ─── 2. Supabase Knowledge Base Stats ─────────────────────
    console.log('\n─── Supabase Vector Store ───');
    try {
        const { count, error } = await supabase
            .from('hms_knowledge')
            .select('*', { count: 'exact', head: true });

        if (error) console.warn('   ⚠️  Could not query hms_knowledge:', error.message);
        else console.log(`   Total embeddings: ${count}`);
    } catch (e: unknown) {
        console.warn('   ⚠️  Supabase connection failed:', (e as Error).message);
    }

    // ─── 3. Unknown Questions (user gaps) ─────────────────────
    console.log('\n─── Unknown Questions (User Gaps) ───');
    try {
        const { data: unknown, error } = await supabase
            .from('unknown_questions')
            .select('english_text, user_question, frequency, top_similarity, status')
            .eq('status', 'pending')
            .order('frequency', { ascending: false })
            .limit(20);

        if (error) {
            console.warn('   ⚠️  Could not query unknown_questions:', error.message);
        } else if (!unknown || unknown.length === 0) {
            console.log('   ✅ No pending unknown questions!');
        } else {
            console.log(`   📝 ${unknown.length} pending unknown questions:\n`);
            unknown.forEach((q, i) => {
                console.log(`   ${(i + 1).toString().padStart(2)}. [${q.frequency}× asked, ${(q.top_similarity * 100).toFixed(0)}% sim]`);
                console.log(`       EN: ${q.english_text}`);
                console.log(`       BN: ${q.user_question}\n`);
            });
        }
    } catch (e: unknown) {
        console.warn('   ⚠️  unknown_questions query failed:', (e as Error).message);
    }

    // ─── 4. Recommendations ───────────────────────────────────
    console.log('\n─── Recommendations ───');
    const thinCategories = Object.entries(categories).filter(([, count]) => count < 15);
    if (thinCategories.length > 0) {
        console.log(`   ⚠️  Add more QA to thin categories: ${thinCategories.map(([c]) => c).join(', ')}`);
    }
    if (shortAnswers.length > 0) {
        console.log(`   ⚠️  Expand ${shortAnswers.length} short answers for better retrieval`);
    }
    console.log('   💡 Run unknown questions through admin → "Save & Train" to fill gaps');
    console.log('   💡 Re-ingest PDFs with --overlap=200 for better chunk coverage\n');

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Audit complete');
}

main().catch(console.error);
