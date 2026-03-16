/**
 * scripts/ingest-diagram.ts
 *
 * Ingests manually written ASCII/markdown diagram files into hms_knowledge.
 *
 * Usage:
 *   npx tsx scripts/ingest-diagram.ts --file="data/diagrams/rs485-wiring.md" --name="RS-485 Wiring" --type="wiring"
 *   npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/" --type="wiring"
 *
 * Diagram .md file format:
 *   The file should be a complete markdown diagram as produced by DiagramCard.
 *   The first H2 heading (## ...) is used as the question/title.
 *   Example: data/diagrams/rs485-wiring.md
 */

import { loadEnvConfig } from '@next/env';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { createClient } from '@supabase/supabase-js';
import { OpenAIEmbeddings } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';

loadEnvConfig(process.cwd());

// ─── DNS / Fetch fix (same as other scripts) ─────────────────
dns.setDefaultResultOrder('ipv4first');
const googleResolver = new dns.promises.Resolver();
googleResolver.setServers(['8.8.8.8', '8.8.4.4']);
function customLookup(
    hostname: string,
    _opts: unknown,
    cb: (err: Error | null, address?: string, family?: number) => void
) {
    googleResolver.resolve4(hostname)
        .then((addrs: string[]) => cb(null, addrs[0], 4))
        .catch((err: Error) => cb(err));
}
const agent = new Agent({ connect: { family: 4, lookup: customLookup as never } });
const customFetch = (input: unknown, init?: unknown) =>
    undiciFetch(
        input as Parameters<typeof undiciFetch>[0],
        { ...(init as Parameters<typeof undiciFetch>[1]), dispatcher: agent } as Parameters<typeof undiciFetch>[1]
    ) as unknown as Promise<Response>;

// ─── CLI args ─────────────────────────────────────────────────
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

// ─── Valid diagram types (mirrors DIAGRAM_TYPE_MAP in diagram/route.ts) ───
const VALID_DIAGRAM_TYPES = [
    'wiring', 'power', 'network', 'panel', 'block', 'connector',
    'led', 'alarm', 'sensor', 'battery', 'communication', 'component',
    'interface', 'zone', 'access', 'dashboard', 'testing', 'firmware',
];

// ─── Extract title from markdown ──────────────────────────────
function extractTitle(markdown: string, fallback: string): string {
    const match = markdown.match(/^#{1,3}\s+(.+)$/m);
    if (!match) return fallback;
    // Strip emoji from title for the question field
    return match[1].replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();
}

// ─── Build embedding text ─────────────────────────────────────
function buildEmbeddingText(
    title: string,
    diagramType: string,
    sourceName: string,
    markdown: string
): string {
    // Extract terminal labels and technical values from markdown for better retrieval
    const terminals = [...markdown.matchAll(/`(TB\d+[+-]?|A[+-]|B[+-]|GND|PE)`/g)].map(m => m[1]);
    const protocols = [...markdown.matchAll(/`?(RS-?485|Modbus|PROFIBUS|Ethernet|CANbus)`?/gi)].map(m => m[1]);
    const voltages = [...markdown.matchAll(/`(\d+V\s*DC|\d+V\s*AC)`/g)].map(m => m[1]);

    const entities = [...new Set([...terminals, ...protocols, ...voltages])].slice(0, 10);

    return [
        `Source: ${sourceName}`,
        `Diagram Type: ${diagramType}`,
        `Category: Wiring & Connections`,
        `Content Type: Technical Diagram — ASCII/Markdown`,
        entities.length > 0 ? `Terminals & Entities: ${entities.join(', ')}` : '',
        `Title: ${title}`,
        `Description: ${diagramType} diagram showing connections, terminals, wire colours, and specifications for ${title}`,
        `Full Diagram:\n${[...markdown].slice(0, 600).join('')}`,
    ].filter(Boolean).join('\n');
}

// ─── Ingest a single diagram file ─────────────────────────────
async function ingestDiagramFile(params: {
    filePath: string;
    sourceName: string;
    diagramType: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standalone script, no generated DB types
    supabase: any;
    embeddings: OpenAIEmbeddings;
    dryRun: boolean;
}): Promise<{ success: boolean; id: string; title: string; error?: string }> {
    const { filePath, sourceName, diagramType, supabase, embeddings, dryRun } = params;

    const markdown = fs.readFileSync(filePath, 'utf-8').trim();
    if (markdown.length < 50) {
        return { success: false, id: '', title: filePath, error: 'File too short (< 50 chars)' };
    }

    const fileName = path.basename(filePath, '.md');
    const title = extractTitle(markdown, sourceName || fileName);

    // Generate deterministic ID from file name
    const id = `diagram_manual_${fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

    const embeddingText = buildEmbeddingText(title, diagramType, sourceName || fileName, markdown);

    if (dryRun) {
        console.log(`   [DRY RUN] Would ingest: "${title}" (${markdown.length} chars) as ${id}`);
        return { success: true, id, title };
    }

    const vector = await embeddings.embedQuery(embeddingText);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standalone script, no generated DB types
    const { error } = await (supabase.from('hms_knowledge') as any).upsert([{
        id,
        question: `${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} diagram for ${title}`,
        answer: markdown,
        category: 'Installation & Commissioning',
        subcategory: diagramType,
        product: 'HMS Panel',
        tags: [diagramType, 'diagram', 'wiring', 'ascii', title.toLowerCase()],
        content: embeddingText,
        embedding: vector,
        source: 'manual',
        source_name: sourceName || fileName,
        chunk_type: 'diagram',
        diagram_source: 'manual',
    }], { onConflict: 'id' });

    if (error) {
        console.error('SUPABASE ERROR DETAIL:', JSON.stringify(error, null, 2));
        return { success: false, id, title, error: error.message };
    }
    return { success: true, id, title };
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
    const { args, flags } = parseArgs();
    const dryRun = flags.has('dry-run');
    const diagramType = args.type || 'wiring';
    const sourceName = args.name || '';

    if (!VALID_DIAGRAM_TYPES.includes(diagramType)) {
        console.error(`❌ Invalid --type. Must be one of: ${VALID_DIAGRAM_TYPES.join(', ')}`);
        process.exit(1);
    }

    // Collect files to process
    const files: string[] = [];
    if (args.file) {
        if (!fs.existsSync(args.file)) {
            console.error(`❌ File not found: ${args.file}`);
            process.exit(1);
        }
        files.push(args.file);
    } else if (args.dir) {
        if (!fs.existsSync(args.dir)) {
            console.error(`❌ Directory not found: ${args.dir}`);
            process.exit(1);
        }
        const dirFiles = fs.readdirSync(args.dir)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .map(f => path.join(args.dir, f));
        files.push(...dirFiles);
    } else {
        console.error('❌ Usage: npx tsx scripts/ingest-diagram.ts --file="path.md" --name="Title" --type="wiring"');
        console.error('       OR: npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/" --type="wiring"');
        process.exit(1);
    }

    if (files.length === 0) {
        console.error('❌ No .md files found');
        process.exit(1);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('❌ Missing Supabase env vars');
    if (!openaiKey) throw new Error('❌ Missing OPENAI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });
    const embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small',
        openAIApiKey: openaiKey,
    });

    console.log('\n' + '═'.repeat(60));
    console.log('📐 Diagram Ingestion Pipeline');
    console.log('═'.repeat(60));
    console.log(`📁 Files:       ${files.length}`);
    console.log(`🔷 Type:        ${diagramType}`);
    console.log(`🧪 Dry Run:     ${dryRun ? 'YES (no uploads)' : 'NO (live)'}\n`);

    let success = 0;
    let errors = 0;

    for (const filePath of files) {
        const result = await ingestDiagramFile({
            filePath,
            sourceName,
            diagramType,
            supabase,
            embeddings,
            dryRun,
        });

        if (result.success) {
            console.log(`   ✅ "${result.title}" → ${result.id}`);
            success++;
        } else {
            console.error(`   ❌ ${path.basename(filePath)}: ${result.error}`);
            errors++;
        }

        // Small delay between files
        if (files.length > 1) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`✅ Done: ${success}/${files.length} ingested`);
    if (errors > 0) console.log(`❌ Errors: ${errors}`);
    console.log(`💡 Diagrams are retrievable as chunk_type='diagram' in hms_knowledge`);
    console.log('═'.repeat(60) + '\n');
}

main().catch(err => {
    console.error('❌ Fatal:', err.message);
    process.exit(1);
});
