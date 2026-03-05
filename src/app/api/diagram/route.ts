
import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

export const maxDuration = 55;

// ─── Diagram types the bot can generate ───────────────────────
const DIAGRAM_TYPES = {
    wiring: ['wiring', 'wire', 'connection', 'connect', 'cable', 'terminal', 'tb', 'a+', 'b-', 'gnd', 'ground'],
    power: ['power', 'supply', 'voltage', 'psu', '24v', '12v', 'electrical', 'circuit'],
    network: ['network', 'rs485', 'rs-485', 'modbus', 'ethernet', 'profibus', 'topology', 'bus'],
    panel: ['panel', 'layout', 'placement', 'din', 'mount', 'rack', 'enclosure'],
    block: ['block diagram', 'architecture', 'system', 'overview', 'flow', 'signal'],
    connector: ['connector', 'pinout', 'pin', 'socket', 'port', 'plug', 'rj45', 'db9', 'db25'],
    led: ['led', 'indicator', 'status light', 'lamp', 'display'],
    alarm: ['alarm', 'intrusion', 'fire', 'tamper', 'trigger', 'alert', 'siren', 'hooter', 'sounder', 'panic', 'buzzer', 'fault'],
    sensor: ['sensor', 'detector', 'smoke', 'heat', 'pir', 'magnetic switch', 'glass break', 'vibration', 'mcp', 'contact'],
    battery: ['battery', 'sla', 'charging', 'backup', 'low battery', 'cut-off', 'ups', 'smps', 'lithium', 'capacity'],
    communication: ['communication', 'gsm', 'pstn', 'sms', 'dialer', 'sim', 'gprs', 'antenna', 'call', 'message', 'modem'],
    component: ['component', 'pcb', 'resistor', 'capacitor', 'diode', 'transistor', 'ic', 'microcontroller', 'relay', 'smd', 'optocoupler', 'inductor'],
    interface: ['interface', 'lcd', 'keypad', 'tactile', 'menu', 'button', 'switch', 'screen', 'backlight', 'cursor'],
    memory: ['memory', 'log', 'event', 'eeprom', 'rtc', 'storage', 'history', 'record', 'erase', 'flash'],
    protocol: ['protocol', 'i2c', 'uart', 'serial', 'baud rate', 'sda', 'scl', 'rx', 'tx', 'ack', 'start bit'],
    video: ['video', 'camera', 'cctv', 'nvr', 'dvr', 'hdd', 'channel', 'recording', 'resolution', 'lens'],
    zone: ['zone', 'loop', 'circuit', 'day', 'night', 'partition', 'isolate', 'bypass', 'delay', 'wired', 'wireless'],
    access: ['access', 'password', 'code', 'master', 'user', 'manager', 'programmer', 'lock', 'door', 'bacs', 'biometric']
};

// ─── Detect if query is asking for a diagram ──────────────────
export function isDiagramRequest(text: string): { isDiagram: boolean; diagramType: string } {
    const lower = text.toLowerCase();
    const diagramKeywords = [
        // English Enhancements
        'blueprint', 'graph', 'figure', 'sketch', 'representation',
        'architecture', 'cabling', 'terminal', 'routing', 'topology',
        'setup', 'flowchart', 'timing.*diagram', 'panel.*layout',
        'board.*layout', 'interface', 'configuration', 'loop.*wiring',

        // Bengali Enhancements
        'নকশা',               // naksha (design/plan/blueprint)
        'সার্কিট',             // circuit
        'পিনআউট',            // pinout
        'লেআউট',             // layout
        'রূপরেখা',            // outline/blueprint
        'ব্লক ডায়াগ্রাম',        // block diagram
        'কীভাবে.*সংযোগ',     // how to connect
        'ক্যাবলিং',            // cabling

        // Hindi Enhancements
        'नक्शा',              // naksha (map/blueprint)
        'सर्किट',             // circuit
        'पिनआउट',           // pinout
        'लेआउट',            // layout
        'रूपरेखा',            // outline/blueprint
        'ब्लॉक डायग्राम',       // block diagram
        'कैसे.*जोड़ें',          // how to connect (kaise jode)
        'केबलिंग'             // cabling
    ];

    const hasDiagramIntent = diagramKeywords.some(kw => {
        if (kw.includes('.*')) {
            return new RegExp(kw).test(lower);
        }
        return lower.includes(kw);
    });

    if (!hasDiagramIntent) return { isDiagram: false, diagramType: '' };

    // Determine diagram type
    for (const [type, keywords] of Object.entries(DIAGRAM_TYPES)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return { isDiagram: true, diagramType: type };
        }
    }

    return { isDiagram: true, diagramType: 'wiring' };
}

// ─── Search KB for relevant wiring/diagram specs ──────────────
async function searchKBForDiagram(query: string, diagramType: string): Promise<string> {
    const supabase = getSupabase();

    const searchQuery = `${diagramType} diagram wiring connection ${query}`;
    const vector = await embedText(searchQuery);
    const vectorStr = `[${vector.join(',')}]`;

    try {
        const { data: matches } = await supabase.rpc('search_hms_knowledge', {
            query_embedding: vectorStr,
            similarity_threshold: 0.4,
            match_count: 8,
        });

        if (!matches?.length) return '';

        // Filter for diagram-relevant entries
        const relevant = matches.filter((m: any) => {
            const text = `${m.question} ${m.answer} ${m.content}`.toLowerCase();
            return (
                text.includes('wire') || text.includes('connect') || text.includes('terminal') ||
                text.includes('pin') || text.includes('voltage') || text.includes('rs-485') ||
                text.includes('modbus') || text.includes('diagram') || text.includes('schematic') ||
                text.includes('a+') || text.includes('b-') || text.includes('tb1') ||
                text.includes('gnd') || text.includes('24v') || m.subcategory?.toLowerCase().includes('visual')
            );
        });

        if (!relevant.length) {
            // Fall back to top matches
            return matches.slice(0, 4).map((m: any) =>
                `[${m.category}]\nQ: ${m.question}\nA: ${m.answer}`
            ).join('\n\n---\n\n');
        }

        return relevant.map((m: any) =>
            `[${m.category} — ${m.subcategory || ''}]\nQ: ${m.question}\nA: ${m.answer}`
        ).join('\n\n---\n\n');
    } catch {
        return '';
    }
}

// ─── Generate SVG diagram via Gemini ──────────────────────────
async function generateDiagramWithGemini(
    panelType: string,
    diagramType: string,
    kbContext: string,
    geminiApiKey: string
): Promise<{ svg: string; components: string[]; notes: string[] }> {

    const contextSection = kbContext
        ? `\n\nKNOWLEDGE BASE (use these exact specs):\n${kbContext}`
        : '';

    const prompt = `You are an expert industrial automation engineer specializing in HMS panels.
Generate a clean, accurate SVG ${diagramType} diagram for: ${panelType}
${contextSection}

REQUIREMENTS:
1. Create a professional, readable SVG diagram (800x600 viewBox)
2. Use industry-standard symbols and conventions
3. Include ALL relevant: terminals, labels, wire colors, pin numbers, component IDs
4. Color coding: Red=24V+, Black=GND, Blue=Signal A+, White=Signal B-, Yellow=Shield
5. Add clear text labels for every component and connection
6. Include a title bar and legend

SVG STYLE:
- Background: #1a1a2e (dark navy)
- Wires: bright colored lines with labels
- Components: rounded rectangles with distinct fills
- Text: white, 12-14px, clear and readable
- Grid lines: subtle #2a2a4e
- Use proper electrical symbols where relevant

RESPOND WITH ONLY VALID JSON (no markdown):
{
  "svg": "<svg viewBox='0 0 800 600' xmlns='http://www.w3.org/2000/svg'>...</svg>",
  "components": ["List of main components shown"],
  "notes": ["Important installation notes", "Safety warnings", "Spec values"]
}`;

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const GEMINI_BODY = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    });

    async function callGemini(): Promise<Response> {
        return fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: GEMINI_BODY,
        });
    }

    try {
        let response = await callGemini();

        // Retry once on 429 (rate limit) with 2s backoff
        if (response.status === 429) {
            console.warn(`⏳ Gemini 429 — retrying in 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            response = await callGemini();
        }

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Extract JSON
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in Gemini response');

        const parsed = JSON.parse(jsonMatch[0]);
        return {
            svg: parsed.svg || '',
            components: Array.isArray(parsed.components) ? parsed.components : [],
            notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        };
    } catch (err: any) {
        console.warn(`⚠️  Gemini diagram generation failed: ${err.message}`);
        return { svg: '', components: [], notes: [] };
    }
}

// ─── Fallback: Generate diagram via Sarvam + structured SVG builder ──
async function generateDiagramFallback(
    panelType: string,
    diagramType: string,
    kbContext: string,
    sarvamKey: string
): Promise<{ svg: string; components: string[]; notes: string[]; description: string }> {

    const sarvamLlm = new ChatOpenAI({
        modelName: 'sarvam-m',
        apiKey: sarvamKey,
        configuration: { baseURL: 'https://api.sarvam.ai/v1' },
        temperature: 0.1,
        maxTokens: 2048,
    });

    const contextSection = kbContext
        ? `\nKnowledge Base:\n${kbContext.substring(0, 1500)}`
        : '';

    const prompt = PromptTemplate.fromTemplate(
        `You are an HMS panel expert. Extract wiring/connection details for: {panelType} ({diagramType} diagram).
${contextSection}

List EXACTLY what connections exist. Format as JSON ONLY:
{{
  "title": "diagram title",
  "description": "what this diagram shows",
  "connections": [
    {{"from": "component/terminal", "to": "component/terminal", "signal": "signal name", "color": "wire color", "spec": "voltage/type"}}
  ],
  "components": ["component list"],
  "notes": ["important notes"]
}}`
    );

    try {
        const result = await prompt.pipe(sarvamLlm).pipe(new StringOutputParser()).invoke({
            panelType,
            diagramType,
        });

        const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON');

        const parsed = JSON.parse(jsonMatch[0]);
        const svg = buildSVGFromConnections(parsed);

        return {
            svg,
            components: parsed.components || [],
            notes: parsed.notes || [],
            description: parsed.description || `${diagramType} diagram for ${panelType}`,
        };
    } catch {
        return {
            svg: buildErrorSVG(panelType, diagramType, kbContext),
            components: [],
            notes: ['Diagram generated from available documentation'],
            description: `${diagramType} diagram for ${panelType}`,
        };
    }
}

// ─── Build SVG from structured connection data ─────────────────
function buildSVGFromConnections(data: {
    title?: string;
    connections?: { from: string; to: string; signal: string; color: string; spec: string }[];
    components?: string[];
}): string {
    const title = data.title || 'HMS Panel Wiring Diagram';
    const connections = data.connections || [];
    const components = data.components || [];

    const WIRE_COLORS: Record<string, string> = {
        red: '#FF4444', black: '#333333', blue: '#4488FF', white: '#EEEEEE',
        yellow: '#FFCC00', green: '#44BB44', orange: '#FF8800', gray: '#888888',
        default: '#00FFCC',
    };

    const W = 800, H = 600;
    const compMap = new Map<string, { x: number; y: number }>();

    // Layout: place unique components in a grid
    const uniqueComps = [...new Set([
        ...connections.map(c => c.from),
        ...connections.map(c => c.to),
        ...components,
    ])].slice(0, 12);

    const cols = 3;
    uniqueComps.forEach((comp, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        compMap.set(comp, {
            x: 100 + col * 220,
            y: 120 + row * 130,
        });
    });

    // SVG elements
    const defs = `<defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#00FFCC"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

    // Background
    const bg = `<rect width="${W}" height="${H}" fill="#0f0f1a"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.3"/>`;

    // Grid pattern
    const gridPattern = `<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a3e" stroke-width="1"/>
  </pattern></defs>`;

    // Title bar
    const titleBar = `<rect x="0" y="0" width="${W}" height="50" fill="#1a1a3e"/>
  <text x="${W / 2}" y="32" text-anchor="middle" fill="#FFD700" font-size="18" font-family="monospace" font-weight="bold" letter-spacing="2">${title}</text>`;

    // Component boxes
    const compBoxes = Array.from(compMap.entries()).map(([name, pos]) => {
        const w = 160, h = 50;
        const truncated = name.length > 18 ? name.substring(0, 17) + '…' : name;
        return `<g transform="translate(${pos.x - w / 2},${pos.y - h / 2})">
      <rect width="${w}" height="${h}" rx="8" fill="#1e2a4a" stroke="#4488FF" stroke-width="1.5"/>
      <text x="${w / 2}" y="${h / 2 + 5}" text-anchor="middle" fill="#FFFFFF" font-size="11" font-family="monospace">${truncated}</text>
    </g>`;
    }).join('\n');

    // Connection wires
    const wires = connections.slice(0, 10).map((conn, i) => {
        const from = compMap.get(conn.from);
        const to = compMap.get(conn.to);
        if (!from || !to) return '';

        const color = WIRE_COLORS[conn.color?.toLowerCase()] || WIRE_COLORS.default;
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2 - 20 - (i % 3) * 10;

        return `<g>
      <path d="M${from.x},${from.y} Q${midX},${midY} ${to.x},${to.y}"
        fill="none" stroke="${color}" stroke-width="2.5" opacity="0.85"
        marker-end="url(#arrow)" stroke-dasharray="${conn.spec?.includes('GND') ? '6,3' : 'none'}"/>
      <rect x="${midX - 35}" y="${midY - 10}" width="70" height="18" rx="4" fill="rgba(0,0,0,0.7)"/>
      <text x="${midX}" y="${midY + 4}" text-anchor="middle" fill="${color}" font-size="9" font-family="monospace">${conn.signal || ''}</text>
    </g>`;
    }).join('\n');

    // Legend
    const legendColors = [
        { color: '#FF4444', label: '24V+' },
        { color: '#333333', label: 'GND' },
        { color: '#4488FF', label: 'Signal A+' },
        { color: '#EEEEEE', label: 'Signal B-' },
        { color: '#FFCC00', label: 'Shield' },
    ];
    const legend = `<g transform="translate(20,${H - 90})">
    <rect width="180" height="80" rx="6" fill="rgba(0,0,30,0.8)" stroke="#333"/>
    <text x="90" y="16" text-anchor="middle" fill="#AAA" font-size="9" font-family="monospace">LEGEND</text>
    ${legendColors.map((l, i) => `
      <rect x="10" y="${22 + i * 11}" width="20" height="6" fill="${l.color}" rx="2"/>
      <text x="36" y="${30 + i * 11}" fill="#CCC" font-size="9" font-family="monospace">${l.label}</text>
    `).join('')}
  </g>`;

    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  ${gridPattern}
  ${defs}
  ${bg}
  ${titleBar}
  ${compBoxes}
  ${wires}
  ${legend}
</svg>`;
}

// ─── Error/fallback SVG ───────────────────────────────────────
function buildErrorSVG(panelType: string, diagramType: string, kbContext: string): string {
    const lines = kbContext
        ? kbContext.substring(0, 600).split('\n').slice(0, 15)
        : [`${diagramType} diagram for ${panelType}`, 'Connect to knowledge base for detailed specs'];

    const textLines = lines.map((line, i) =>
        `<text x="400" y="${120 + i * 22}" text-anchor="middle" fill="#CCC" font-size="11" font-family="monospace">${line.substring(0, 70)}</text>`
    ).join('\n');

    return `<svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="600" fill="#0f0f1a"/>
    <rect x="0" y="0" width="800" height="50" fill="#1a1a3e"/>
    <text x="400" y="32" text-anchor="middle" fill="#FFD700" font-size="16" font-family="monospace" font-weight="bold">${diagramType.toUpperCase()} DIAGRAM — ${panelType.toUpperCase()}</text>
    <rect x="40" y="70" width="720" height="${lines.length * 22 + 20}" rx="8" fill="#1a1a2e" stroke="#4488FF" stroke-width="1"/>
    ${textLines}
    <text x="400" y="${120 + lines.length * 22 + 30}" text-anchor="middle" fill="#888" font-size="10" font-family="monospace">Upload panel manual PDF to generate detailed wiring diagram</text>
  </svg>`;
}

// ─── Main Handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const { query, englishQuery, diagramType, language } = await req.json();

        const geminiKey = process.env.GEMINI_API_KEY;
        const sarvamKey = process.env.SARVAM_API_KEY;

        if (!sarvamKey) {
            return NextResponse.json({ error: 'SARVAM_API_KEY not configured' }, { status: 500 });
        }

        // Extract panel type from query
        const panelType = englishQuery || query;

        // Search KB for relevant specs
        const kbContext = await searchKBForDiagram(panelType, diagramType);

        let result: { svg: string; components: string[]; notes: string[]; description?: string };

        if (geminiKey) {
            // Primary: Gemini with KB context
            const geminiResult = await generateDiagramWithGemini(panelType, diagramType, kbContext, geminiKey);
            result = { ...geminiResult, description: `${diagramType} diagram for ${panelType}` };

            // If Gemini returned empty SVG, fall back
            if (!result.svg || result.svg.length < 100) {
                result = await generateDiagramFallback(panelType, diagramType, kbContext, sarvamKey);
            }
        } else {
            result = await generateDiagramFallback(panelType, diagramType, kbContext, sarvamKey);
        }

        // Generate text description in user's language
        const sarvamLlm = new ChatOpenAI({
            modelName: 'sarvam-m',
            apiKey: sarvamKey,
            configuration: { baseURL: 'https://api.sarvam.ai/v1' },
            temperature: 0.1,
            maxTokens: 512,
        });

        const LANGUAGE_NAMES: Record<string, string> = { en: 'English', bn: 'Bengali', hi: 'Hindi' };
        const langName = LANGUAGE_NAMES[language] || 'English';

        let description = result.description || `${diagramType} diagram for ${panelType}`;
        if (result.components.length > 0 || result.notes.length > 0) {
            try {
                const descPrompt = PromptTemplate.fromTemplate(
                    `Explain this HMS panel diagram in {lang}. Be concise (max 100 words).
Panel: {panel}
Type: {type}
Components: {components}
Notes: {notes}
Write ONLY the explanation in {lang}:`
                );
                description = await descPrompt.pipe(sarvamLlm).pipe(new StringOutputParser()).invoke({
                    lang: langName,
                    panel: panelType,
                    type: diagramType,
                    components: result.components.join(', '),
                    notes: result.notes.join('; '),
                });
            } catch {
                // keep default description
            }
        }

        return NextResponse.json({
            success: true,
            svg: result.svg,
            diagramType,
            panelType,
            description,
            components: result.components,
            notes: result.notes,
            hasKBContext: kbContext.length > 0,
        });

    } catch (err: any) {
        console.error('Diagram API error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}