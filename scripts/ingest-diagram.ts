/**
 * scripts/ingest-diagram.ts
 *
 * Ingests manually written ASCII/markdown diagram files into hms_knowledge.
 *
 * Usage:
 *   npx tsx scripts/ingest-diagram.ts --file="data/diagrams/rs485-wiring.md" --name="RS-485 Wiring" --type="wiring"
 *   npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/" --type="auto"
 *   npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/"              # auto-detect is default
 *   npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/" --dry-run    # preview without uploading
 *
 * When --type="auto" (or omitted with --dir), the script infers the diagram type
 * from the filename and content of each .md file.
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
    'protocol', 'cms', 'video', 'mechanical', 'status',
];

// ─── Auto-detect diagram type from filename + content ─────────
// Rules are checked in order — earlier rules get priority via +0.5 bonus on filename matches
const TYPE_DETECTION_RULES: Array<{ type: string; filePatterns: RegExp[]; contentPatterns: RegExp[] }> = [
    // High-priority: check filename first for strong signals
    { type: 'wiring',        filePatterns: [/wiring/i, /wire\b/i, /schematic/i],                      contentPatterns: [/terminal.*connect/i, /tb\d+/i, /cable.*connect/i, /wire.*colour/i, /wire.*color/i] },
    { type: 'power',         filePatterns: [/power/i, /smps/i, /ups\b/i, /psu\b/i],                   contentPatterns: [/power.*supply/i, /battery.*charg/i, /voltage.*regul/i, /switched.*mode/i] },
    { type: 'network',       filePatterns: [/network/i, /webserver/i, /comms/i],                       contentPatterns: [/rs[-]?485/i, /modbus/i, /ethernet/i, /profibus/i, /topology/i, /webserver.*config/i, /ip.*address/i] },
    { type: 'panel',         filePatterns: [/panel.*flow/i, /panel.*layout/i, /zone.*panel/i],         contentPatterns: [/panel.*architecture/i, /zone.*panel/i, /\bpanel\b.*\bdiagram\b/i] },
    { type: 'block',         filePatterns: [/block.*diagram/i, /block\b/i],                            contentPatterns: [/block.*diagram/i, /system.*overview/i, /signal.*flow/i] },
    { type: 'alarm',         filePatterns: [/alarm/i, /intru/i, /fire.*panel/i, /siren/i, /hooter/i],  contentPatterns: [/alarm.*system/i, /intrusion/i, /intruder/i, /sounder/i, /tamper/i, /panic/i, /trigger.*process/i] },
    { type: 'sensor',        filePatterns: [/sensor/i, /detector/i, /pir\b/i, /smoke/i, /flame/i],     contentPatterns: [/smoke.*detect/i, /heat.*detect/i, /glass.*break/i, /\bmcp\b/i, /manual.*call.*point/i, /optical.*chamber/i] },
    { type: 'protocol',      filePatterns: [/protocol/i, /i2c/i, /uart/i, /bitstream/i],               contentPatterns: [/contact.*id/i, /sia\b/i, /handshake/i, /checksum/i, /baud.*rate/i, /timing.*sequence/i] },
    { type: 'communication', filePatterns: [/communication/i, /gsm/i, /dialer/i, /whisper/i],          contentPatterns: [/auto.*dial/i, /pstn/i, /sim\b/i, /gprs/i, /gsm.*module/i, /dtmf/i] },
    { type: 'cms',           filePatterns: [/\bcms\b/i, /ademco/i, /contact.*id/i],                    contentPatterns: [/central.*monitor/i, /contact.*id.*event/i, /receiver/i, /subscriber/i] },
    { type: 'access',        filePatterns: [/access/i, /biometric/i, /bio.*smart/i],                   contentPatterns: [/access.*control/i, /door.*lock/i, /registration.*flow/i, /fingerprint/i] },
    { type: 'zone',          filePatterns: [/zone.*config/i, /zone.*setup/i],                          contentPatterns: [/zone.*config/i, /partition/i, /loop.*circuit/i] },
    { type: 'interface',     filePatterns: [/menu.*tree/i, /keypad/i, /menu.*hierarch/i],              contentPatterns: [/lcd.*menu/i, /tactile/i, /user.*interface/i, /menu.*navigation/i, /programming.*menu/i] },
    { type: 'led',           filePatterns: [/\bled\b.*layout/i, /indicator/i, /front.*panel/i],        contentPatterns: [/led.*diagnostic/i, /status.*light/i, /\bled\b.*indicator/i] },
    { type: 'connector',     filePatterns: [/connector/i, /pinout/i, /pin.*map/i],                     contentPatterns: [/pin.*assign/i, /rj45/i, /db9/i, /usb.*oper/i, /shift.*register/i, /74hc595/i] },
    { type: 'battery',       filePatterns: [/battery/i, /sla\b/i, /backup/i],                          contentPatterns: [/battery.*logic/i, /charging/i, /cut.*off/i] },
    { type: 'dashboard',     filePatterns: [/dashboard/i, /cloud/i, /iot\b/i, /telemetry/i],           contentPatterns: [/mqtt/i, /provisioning/i, /widget/i, /role.*menu/i, /webserver.*dashboard/i] },
    { type: 'video',         filePatterns: [/cctv/i, /nvr\b/i, /dvr\b/i, /camera/i],                  contentPatterns: [/cctv.*system/i, /video.*record/i, /surveillance/i] },
    { type: 'testing',       filePatterns: [/test/i, /diagnostic/i, /calibrat/i],                      contentPatterns: [/walk.*test/i, /lamp.*test/i, /troubleshoot/i] },
    { type: 'firmware',      filePatterns: [/firmware/i, /ota\b/i],                                    contentPatterns: [/factory.*reset/i, /software.*update/i, /firmware.*logic/i] },
    { type: 'mechanical',    filePatterns: [/dimension/i, /mounting/i, /housing/i],                    contentPatterns: [/bracket/i, /enclosure/i] },
    { type: 'status',        filePatterns: [/state.*machine/i],                                        contentPatterns: [/state.*machine/i, /status.*flow/i, /heartbeat/i, /supervisory/i] },
];

function detectDiagramType(fileName: string, markdown: string): string {
    const fileNameLower = fileName.toLowerCase();
    const contentLower = markdown.slice(0, 2000).toLowerCase();

    // Score each type: filename matches get 2 points, content matches get 1 point
    let bestType = 'block'; // default fallback for generic diagrams
    let bestScore = 0;

    for (const rule of TYPE_DETECTION_RULES) {
        let score = 0;
        for (const pattern of rule.filePatterns) {
            if (pattern.test(fileNameLower)) score += 2;
        }
        for (const pattern of rule.contentPatterns) {
            if (pattern.test(contentLower)) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            bestType = rule.type;
        }
    }

    return bestType;
}

// ─── Category mapping per diagram type ───────────────────────
const TYPE_CATEGORY_MAP: Record<string, string> = {
    wiring: 'Installation & Commissioning',
    power: 'Power & Supply',
    network: 'Network & Communication',
    panel: 'Panel Architecture',
    block: 'System Architecture',
    alarm: 'Alarm & Security',
    sensor: 'Sensors & Detection',
    protocol: 'Protocols & Standards',
    communication: 'Communication Systems',
    cms: 'Central Monitoring',
    access: 'Access Control',
    zone: 'Zone Configuration',
    interface: 'User Interface',
    led: 'LED & Indicators',
    connector: 'Connectors & Pinouts',
    battery: 'Battery & Backup',
    dashboard: 'Dashboard & IoT',
    video: 'Video & Surveillance',
    testing: 'Testing & Diagnostics',
    firmware: 'Firmware & Updates',
    mechanical: 'Mechanical & Housing',
    status: 'Status & Monitoring',
    component: 'Components & PCB',
};

// ─── Extract title from markdown ──────────────────────────────
function extractTitle(markdown: string, fallback: string): string {
    const match = markdown.match(/^#{1,3}\s+(.+)$/m);
    if (!match) return fallback;
    return match[1].replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();
}

// ─── Build embedding text ─────────────────────────────────────
function buildEmbeddingText(
    title: string,
    diagramType: string,
    sourceName: string,
    markdown: string
): string {
    // Extract terminal labels and technical values from markdown
    const terminals = [...markdown.matchAll(/`?(TB\d+[+-]?|A[+-]|B[+-]|GND|PE|COM|NO|NC|SIG|EOL|Z\d+)`?/gi)].map(m => m[1]);
    const protocols = [...markdown.matchAll(/`?(RS-?485|Modbus|PROFIBUS|Ethernet|CANbus|I2C|UART|SIA|Contact.?ID|MQTT)`?/gi)].map(m => m[1]);
    const voltages = [...markdown.matchAll(/`?(\d+V\s*DC|\d+V\s*AC|\d+\.\d+V)`?/g)].map(m => m[1]);
    const products = [...markdown.matchAll(/\b(Dexter|HMS|Jarvis|ISIS|ATUM|Pinnacle|Dhwani|Whisper|Hestia|Apollo|Chronos)\b/gi)].map(m => m[1]);

    const entities = [...new Set([...terminals, ...protocols, ...voltages, ...products])].slice(0, 20);
    const category = TYPE_CATEGORY_MAP[diagramType] || 'Technical Diagram';
    const typeLabel = diagramType.charAt(0).toUpperCase() + diagramType.slice(1);

    // Use up to 1500 chars of markdown content for better retrieval
    const contentSlice = markdown.slice(0, 1500);

    return [
        `Source: ${sourceName}`,
        `Diagram Type: ${typeLabel}`,
        `Category: ${category}`,
        `Content Type: Technical Diagram — ASCII/Markdown`,
        entities.length > 0 ? `Key Entities: ${entities.join(', ')}` : '',
        `Title: ${title}`,
        `Description: ${typeLabel} diagram showing ${category.toLowerCase()} details for ${title}`,
        `Full Diagram:\n${contentSlice}`,
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
}): Promise<{ success: boolean; id: string; title: string; detectedType: string; error?: string }> {
    const { filePath, sourceName, supabase, embeddings, dryRun } = params;
    let { diagramType } = params;

    const markdown = fs.readFileSync(filePath, 'utf-8').trim();
    if (markdown.length < 50) {
        return { success: false, id: '', title: filePath, detectedType: diagramType, error: 'File too short (< 50 chars)' };
    }

    const fileName = path.basename(filePath, '.md');
    const title = extractTitle(markdown, sourceName || fileName);

    // Auto-detect type if set to 'auto'
    if (diagramType === 'auto') {
        diagramType = detectDiagramType(fileName, markdown);
    }

    const typeLabel = diagramType.charAt(0).toUpperCase() + diagramType.slice(1);
    const category = TYPE_CATEGORY_MAP[diagramType] || 'Technical Diagram';

    // Generate deterministic ID from file name
    const id = `diagram_manual_${fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;

    const embeddingText = buildEmbeddingText(title, diagramType, sourceName || fileName, markdown);

    if (dryRun) {
        console.log(`   [DRY RUN] "${title}" → type=${diagramType} | ${markdown.length} chars | id=${id}`);
        return { success: true, id, title, detectedType: diagramType };
    }

    const vector = await embeddings.embedQuery(embeddingText);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- standalone script, no generated DB types
    const { error } = await (supabase.from('hms_knowledge') as any).upsert([{
        id,
        question: `${typeLabel} diagram for ${title}`,
        answer: markdown,
        category,
        subcategory: diagramType,
        product: 'HMS Panel',
        tags: [diagramType, 'diagram', category.toLowerCase(), title.toLowerCase()],
        content: embeddingText,
        embedding: vector,
        source: 'manual',
        source_name: sourceName || fileName,
        chunk_type: 'diagram',
        diagram_source: 'manual',
    }], { onConflict: 'id' });

    if (error) {
        console.error('SUPABASE ERROR DETAIL:', JSON.stringify(error, null, 2));
        return { success: false, id, title, detectedType: diagramType, error: error.message };
    }
    return { success: true, id, title, detectedType: diagramType };
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
    const { args, flags } = parseArgs();
    const dryRun = flags.has('dry-run');
    const sourceName = args.name || '';

    // Default to 'auto' for --dir mode, 'wiring' for --file mode (backward compat)
    const diagramType = args.type || (args.dir ? 'auto' : 'wiring');

    if (diagramType !== 'auto' && !VALID_DIAGRAM_TYPES.includes(diagramType)) {
        console.error(`Invalid --type. Must be "auto" or one of: ${VALID_DIAGRAM_TYPES.join(', ')}`);
        process.exit(1);
    }

    // Collect files to process
    const files: string[] = [];
    if (args.file) {
        if (!fs.existsSync(args.file)) {
            console.error(`File not found: ${args.file}`);
            process.exit(1);
        }
        files.push(args.file);
    } else if (args.dir) {
        if (!fs.existsSync(args.dir)) {
            console.error(`Directory not found: ${args.dir}`);
            process.exit(1);
        }
        const dirFiles = fs.readdirSync(args.dir)
            .filter(f => f.toLowerCase().endsWith('.md'))
            .map(f => path.join(args.dir, f));
        files.push(...dirFiles);
    } else {
        console.error('Usage: npx tsx scripts/ingest-diagram.ts --file="path.md" --name="Title" --type="wiring"');
        console.error('   OR: npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/"              # auto-detect type');
        console.error('   OR: npx tsx scripts/ingest-diagram.ts --dir="data/diagrams/" --dry-run    # preview only');
        process.exit(1);
    }

    if (files.length === 0) {
        console.error('No .md files found');
        process.exit(1);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase env vars');
    if (!openaiKey) throw new Error('Missing OPENAI_API_KEY');

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        global: { fetch: customFetch as never },
    });
    const embeddings = new OpenAIEmbeddings({
        modelName: 'text-embedding-3-small',
        openAIApiKey: openaiKey,
    });

    console.log('\n' + '='.repeat(60));
    console.log('Diagram Ingestion Pipeline');
    console.log('='.repeat(60));
    console.log(`Files:       ${files.length}`);
    console.log(`Type:        ${diagramType === 'auto' ? 'AUTO-DETECT' : diagramType}`);
    console.log(`Dry Run:     ${dryRun ? 'YES (no uploads)' : 'NO (live)'}\n`);

    let success = 0;
    let errors = 0;
    const typeCounts: Record<string, number> = {};

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
            console.log(`   OK "${result.title}" -> type=${result.detectedType} | ${result.id}`);
            typeCounts[result.detectedType] = (typeCounts[result.detectedType] || 0) + 1;
            success++;
        } else {
            console.error(`   FAIL ${path.basename(filePath)}: ${result.error}`);
            errors++;
        }

        // Small delay between files to avoid rate limits
        if (files.length > 1) await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Done: ${success}/${files.length} ingested`);
    if (errors > 0) console.log(`Errors: ${errors}`);
    if (Object.keys(typeCounts).length > 0) {
        console.log(`\nType breakdown:`);
        for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
            console.log(`  ${type}: ${count}`);
        }
    }
    console.log(`\nDiagrams are retrievable as chunk_type='diagram' in hms_knowledge`);
    console.log('='.repeat(60) + '\n');
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
