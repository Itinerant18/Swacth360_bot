
/**
 * src/app/api/diagram/route.ts
 *
 * Text-Based Diagram Generation Pipeline
 *
 * Generates markdown + ASCII art diagrams that render beautifully
 * in the chat UI — no SVG, no Gemini required.
 *
 * Sarvam AI (sarvam-m) is a TEXT model — it is excellent at generating
 * structured ASCII/markdown diagrams like:
 *
 *   ┌─────────────┐     A+ (Blue)    ┌──────────────┐
 *   │  HMS Panel  │ ───────────────► │  Slave Dev   │
 *   │  TB1+       │     B- (White)   │              │
 *   └─────────────┘ ◄─────────────── └──────────────┘
 *
 * This approach:
 *   ✅ Works 100% with Sarvam AI (no Gemini needed)
 *   ✅ Renders perfectly via react-markdown + remark-gfm
 *   ✅ Copy-pasteable into any .md file or documentation
 *   ✅ Works in Bengali/Hindi descriptions
 *   ✅ Accurate specs pulled from KB (uploaded PDFs)
 *   ✅ No external dependencies, no SVG rendering issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
import { embedText } from '@/lib/embeddings';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';



// ─── Diagram intent detection ─────────────────────────────────
const DIAGRAM_KEYWORDS = [
    'diagram', 'wiring', 'schematic', 'circuit', 'layout', 'draw', 'show me',
    'display', 'connection diagram', 'wire diagram', 'block diagram', 'pinout',
    'topology', 'how.*connect', 'how.*wire',
    // Bengali
    'ডায়াগ্রাম', 'তার', 'সংযোগ', 'চিত্র', 'ওয়্যারিং', 'দেখাও',
    // Hindi
    'डायग्राम', 'तार', 'कनेक्शन', 'चित्र', 'वायरिंग', 'दिखाएं', 'दिखाओ',
];

const DIAGRAM_TYPE_MAP: Record<string, string[]> = {
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
    access: ['access', 'password', 'code', 'master', 'user', 'manager', 'programmer', 'lock', 'door', 'bacs', 'biometric'],
    dashboard: ['dashboard', 'cloud', 'mqtt', 'server', 'webserver', 'iot', 'telemetry', 'remote', 'provisioning', 'browser', 'widget'],
    testing: ['test', 'walk test', 'lamp test', 'relay test', 'buzzer test', 'diagnostics', 'maintenance', 'troubleshooting', 'calibration', 'simulate'],
    timing: ['time', 'date', 'clock', 'calendar', 'holiday', 'schedule', 'delay', 'duration', 'uptime', 'timestamp', 'tat', 'sla'],
    mechanical: ['dimension', 'weight', 'material', 'housing', 'bracket', 'mounting', 'temperature', 'humidity', 'vibration', 'abs', 'crca', 'size'],
    notification: ['notification', 'email', 'sms', 'message', 'annunciator', 'strobe', 'audio', 'voice', 'announcement', 'playback', 'record'],
    integration: ['integration', 'active integration', 'passive integration', 'gateway', 'node', 'platform', 'api', 'third-party', 'sync'],
    telecom: ['telco', 'pstn', 'telephone', 'dialer', 'dtmf', 'line', 'tip', 'ring', 'hookup', 'modem'],
    cms: ['cms', 'central monitoring', 'contact id', 'sia', 'dc-09', 'receiver', 'report', 'subscriber', 'account', 'format'],
    status: ['status', 'healthy', 'fault', 'inactive', 'online', 'offline', 'heartbeat', 'supervisory', 'restored', 'active'],
    firmware: ['firmware', 'update', 'ota', 'software', 'version', 'upgrade', 'reboot', 'restart', 'default', 'factory reset']
};

export function isDiagramRequest(text: string): { isDiagram: boolean; diagramType: string } {
    const lower = text.toLowerCase();
    const hasDiagramIntent = DIAGRAM_KEYWORDS.some(kw => {
        if (kw.includes('.*')) return new RegExp(kw).test(lower);
        return lower.includes(kw);
    });
    if (!hasDiagramIntent) return { isDiagram: false, diagramType: '' };
    for (const [type, keywords] of Object.entries(DIAGRAM_TYPE_MAP)) {
        if (keywords.some(kw => lower.includes(kw))) return { isDiagram: true, diagramType: type };
    }
    return { isDiagram: true, diagramType: 'wiring' };
}

// ─── Search KB for relevant specs ────────────────────────────
async function searchKBForDiagram(query: string, diagramType: string): Promise<string> {
    try {
        const supabase = getSupabase();
        const vector = await embedText(`${diagramType} diagram wiring connection terminal ${query}`);
        const { data: matches } = await supabase.rpc('search_hms_knowledge', {
            query_embedding: vector,
            similarity_threshold: 0.35,
            match_count: 8,
        });
        if (!matches?.length) return '';

        // Prioritise wiring/visual/connection entries
        const relevant = matches.filter((m: any) => {
            const t = `${m.question} ${m.answer} ${m.content || ''}`.toLowerCase();
            return (
                t.includes('wire') || t.includes('terminal') || t.includes('connect') ||
                t.includes('pin') || t.includes('rs-485') || t.includes('a+') ||
                t.includes('b-') || t.includes('24v') || t.includes('gnd') ||
                t.includes('modbus') || m.subcategory?.toLowerCase().includes('wiring') ||
                m.subcategory?.toLowerCase().includes('visual')
            );
        });

        const toUse = relevant.length > 0 ? relevant.slice(0, 5) : matches.slice(0, 4);
        return toUse.map((m: any) =>
            `### ${m.category}\n**Q:** ${m.question}\n**A:** ${m.answer}`
        ).join('\n\n');
    } catch {
        return '';
    }
}

// ─── Diagram prompt templates per type ───────────────────────
// Each template tells Sarvam exactly what ASCII/markdown structure to produce.

const DIAGRAM_PROMPTS: Record<string, string> = {

    wiring: `You are an HMS industrial panel technical writer.
Generate a complete WIRING DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document with these EXACT sections:

## 🔌 Wiring Diagram — {panelType}

### Connection Overview
\`\`\`
[Use ASCII art boxes and arrows like this:]

  ┌─────────────────┐          ┌─────────────────┐
  │   HMS PANEL     │          │   SLAVE DEVICE  │
  │                 │          │                 │
  │  TB1+ ──────────┼──────────┼── A+ (RS-485)   │
  │  TB1- ──────────┼──────────┼── B- (RS-485)   │
  │  GND  ──────────┼──────────┼── GND           │
  │  24V+ ──────────┼──────────┼── PWR+          │
  └─────────────────┘          └─────────────────┘
\`\`\`

### Terminal Connections Table
| Terminal | Signal     | Wire Color | Connected To    | Specification    |
|----------|------------|------------|-----------------|------------------|
| TB1+     | 24V DC+    | Red        | Power Supply +  | 18–30V DC, 150mA |

### Wire Color Code
| Color  | Signal         | Standard |
|--------|---------------|----------|
| 🔴 Red    | 24V DC (+)  | IEC 60757 |
| ⚫ Black  | GND / 0V    | IEC 60757 |
| 🔵 Blue   | RS-485 A+   | EIA-485   |
| ⚪ White  | RS-485 B-   | EIA-485   |
| 🟡 Yellow | Shield / PE | IEC 60757 |
| 🟢 Green  | Earth       | IEC 60757 |

### Step-by-Step Wiring Instructions
1. **De-energize** all power before wiring
2. List each step clearly

### ⚠️ Important Notes
- List safety warnings
- List spec values
- List common mistakes`,

    power: `You are an HMS industrial panel technical writer.
Generate a complete POWER SUPPLY WIRING DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document:

## ⚡ Power Supply Diagram — {panelType}

### Power Architecture
\`\`\`
[ASCII art showing power flow:]

  230V AC                    24V DC
  ─────────►  ┌──────────┐  ─────────►  ┌─────────────┐
              │   PSU    │              │  HMS Panel  │
  N ─────────►│          │  GND ───────►│             │
              └──────────┘              └─────────────┘
\`\`\`

### Power Requirements Table
| Component | Input Voltage | Current Draw | Fuse Rating |
|-----------|--------------|-------------|-------------|

### Wiring Terminals
| Terminal | Function   | Wire Size | Color |
|----------|-----------|-----------|-------|

### ⚠️ Safety Requirements
- List requirements`,

    network: `You are an HMS industrial panel technical writer.
Generate a complete NETWORK / BUS TOPOLOGY DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document:

## 🌐 Network Topology — {panelType}

### Bus Architecture
\`\`\`
[ASCII art showing network topology:]

  ┌──────────┐    RS-485 Bus (max 1200m)
  │  Master  │────────────────────────────────────┐
  │  (PLC)   │                                    │
  └──────────┘                                    │
       │                                          │
       ├── Node 1: [Device] (Addr: 01)            │
       ├── Node 2: [Device] (Addr: 02)            │
       └── Node N: [Device] (Addr: N)  120Ω ─────┘
                                      terminator
\`\`\`

### Network Parameters
| Parameter      | Value     | Notes              |
|----------------|-----------|--------------------|
| Protocol       | Modbus RTU |                   |
| Baud Rate      | 9600 bps  | Default            |
| Max Nodes      | 32        |                   |
| Max Cable Dist | 1200m     | At 9600 baud       |
| Termination    | 120Ω      | Both ends of bus   |

### Node Address Table
| Node | Device      | Address | Baud Rate |
|------|------------|---------|-----------|

### ⚠️ Wiring Notes
- List notes`,

    panel: `You are an HMS industrial panel technical writer.
Generate a complete PANEL LAYOUT DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document:

## 📋 Panel Layout — {panelType}

### Physical Layout
\`\`\`
[ASCII art showing panel face/layout:]

  ┌────────────────────────────────────────┐
  │              HMS PANEL                 │
  │  ┌──────────┐  ┌──────────────────┐   │
  │  │  DISPLAY │  │   STATUS LEDs    │   │
  │  └──────────┘  └──────────────────┘   │
  │                                        │
  │  ┌────────────────────────────────┐   │
  │  │         DIN RAIL AREA          │   │
  │  │  [MCB] [PSU] [CPU] [I/O]      │   │
  │  └────────────────────────────────┘   │
  │                                        │
  │  TB1  TB2  TB3  TB4  TB5  TB6  TB7   │
  └────────────────────────────────────────┘
\`\`\`

### Component Placement
| Component | Location    | Function              |
|-----------|-------------|-----------------------|

### Terminal Block Map
| TB Block | Terminals | Signals              |
|----------|-----------|----------------------|`,

    block: `You are an HMS industrial panel technical writer.
Generate a complete BLOCK / SYSTEM DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document:

## 🔷 System Block Diagram — {panelType}

### System Architecture
\`\`\`
[ASCII art block diagram:]

  ┌──────────┐     ┌───────────────┐     ┌──────────────┐
  │  FIELD   │     │  HMS PANEL /  │     │   SCADA /    │
  │ DEVICES  │────►│   CONTROLLER  │────►│    HMI       │
  └──────────┘     └───────────────┘     └──────────────┘
       │                   │                     │
  [Sensors]          [Processing]          [Monitoring]
  [Actuators]        [Control Logic]       [Alarms]
\`\`\`

### Signal Flow
| From           | Signal Type | To             | Protocol  |
|----------------|-------------|----------------|-----------|

### I/O Summary
| Type    | Count | Description         |
|---------|-------|---------------------|
| DI      |       | Digital Inputs      |
| DO      |       | Digital Outputs     |
| AI      |       | Analog Inputs       |
| AO      |       | Analog Outputs      |`,

    connector: `You are an HMS industrial panel technical writer.
Generate a complete CONNECTOR / PINOUT DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document:

## 🔗 Connector Pinout — {panelType}

### Connector Layout
\`\`\`
[ASCII art showing connector face view:]

  DB9 Male (Face View)        RJ45 (T568B)
  ┌───────────────┐           ┌─────────────┐
  │ 1  2  3  4  5 │           │ 1 2 3 4 5 6 7 8 │
  │  6  7  8  9   │           └─────────────┘
  └───────────────┘
\`\`\`

### Pin Assignment Table
| Pin | Signal     | Direction | Description          | Wire Color |
|-----|-----------|-----------|----------------------|------------|
| 1   |           | →         |                      |            |
| 2   |           | ←         |                      |            |

### ⚠️ Connection Notes
- List notes`,

    led: `You are an HMS industrial panel technical writer.
Generate a complete LED / INDICATOR STATUS DIAGRAM for: {panelType}

{kbSection}

Produce a markdown document:

## 💡 LED Status Indicators — {panelType}

### LED Panel Layout
\`\`\`
[ASCII art showing LED positions:]

  ┌─────────────────────────────────┐
  │  PWR  COM  ERR  NET  I/O  ALM  │
  │  [🟢] [🟡] [🔴] [🔵] [🟢] [🔴] │
  └─────────────────────────────────┘
\`\`\`

### LED Status Table
| LED Label | Color       | State    | Meaning                    |
|-----------|-------------|----------|----------------------------|
| PWR       | 🟢 Green    | Solid ON  | Power OK                  |
| PWR       | 🔴 Red      | Solid ON  | Power fault               |
| COM       | 🟡 Amber    | Blinking  | Communication active      |
| ERR       | 🔴 Red      | Solid ON  | Error / Fault             |

### Fault Diagnosis by LED Pattern
| LED Pattern          | Probable Cause      | Action               |
|----------------------|--------------------|-----------------------|`,
};

// ─── Generate text diagram via Sarvam ────────────────────────
async function generateTextDiagram(
    panelType: string,
    diagramType: string,
    kbContext: string,
    sarvamKey: string,
    language: string,
    detailLevel: 'basic' | 'context-rich' = 'context-rich'
): Promise<{ markdown: string; title: string; diagramType: string }> {

    const sarvam = new ChatOpenAI({
        modelName: 'sarvam-m',
        apiKey: sarvamKey,
        configuration: { baseURL: 'https://api.sarvam.ai/v1' },
        temperature: 0.1,
        maxTokens: 2048,
    });

    // Build KB context section
    const kbSection = kbContext
        ? `**Knowledge Base (from uploaded manuals — use these exact specs):**\n\n${kbContext}\n\n---\n`
        : `**Note:** No manual uploaded yet. Generate a standard HMS/Dexter panel diagram.\nAdmin can upload manuals via Admin → Train Bot for panel-specific specs.\n\n---\n`;

    // Get the template for this diagram type
    const templateStr = DIAGRAM_PROMPTS[diagramType] || DIAGRAM_PROMPTS.wiring;

    // Build the full prompt
    const fullPrompt = templateStr
        .replace(/{panelType}/g, panelType)
        .replace(/{kbSection}/g, kbSection);

    const systemPrompt = `You are a technical documentation expert for HMS/Dexter industrial panels.
Generate complete, accurate, detailed markdown diagrams.
Use Unicode box-drawing characters (┌┐└┘├┤┬┴┼─│) for ASCII art.
Fill ALL table cells with real data from the knowledge base.
If a spec is unknown, write the typical HMS panel value.
ALWAYS output valid markdown that renders correctly.`;

    try {
        const result = await sarvam.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullPrompt },
        ]);

        let markdown = (result.content as string).trim();

        // Add KB source note if we used real data
        if (kbContext) {
            markdown += `\n\n---\n> 📚 **Source:** Generated from uploaded manual data in knowledge base.\n> Always verify with official documentation before installation.`;
        } else {
            markdown += `\n\n---\n> ℹ️ **Note:** Standard HMS panel diagram. Upload the specific panel manual via **Admin → Train Bot** for exact specifications.`;
        }

        // Add language-specific note
        if (language === 'bn') {
            markdown += `\n> 📋 বিস্তারিত স্পেসিফিকেশনের জন্য অফিসিয়াল ম্যানুয়াল দেখুন।`;
        } else if (language === 'hi') {
            markdown += `\n> 📋 विस्तृत विनिर्देशों के लिए आधिकारिक मैनुअल देखें।`;
        }

        // Extract title from first heading
        const titleMatch = markdown.match(/^#{1,3}\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].replace(/[🔌⚡🌐📋🔷🔗💡]/g, '').trim() : `${diagramType} diagram for ${panelType}`;

        return { markdown, title, diagramType };

    } catch (err: any) {
        console.error('Sarvam diagram generation failed:', err.message);

        // Structured fallback
        const fallback = buildFallbackMarkdown(panelType, diagramType, kbContext);
        return {
            markdown: fallback,
            title: `${diagramType} diagram — ${panelType}`,
            diagramType,
        };
    }
}

// ─── Fallback markdown when Sarvam fails ─────────────────────
function buildFallbackMarkdown(panelType: string, diagramType: string, kbContext: string): string {
    const header = `## 🔌 ${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} Diagram — ${panelType}`;

    if (kbContext) {
        return `${header}

### Available Specifications from Knowledge Base

${kbContext}

---

### Standard HMS Panel Wiring Reference

\`\`\`
  ┌─────────────────────┐          ┌─────────────────────┐
  │     HMS PANEL       │          │    FIELD DEVICE     │
  │                     │          │                     │
  │  TB1+  ─────────────┼──────────┼──  A+  (RS-485)    │
  │  TB1-  ─────────────┼──────────┼──  B-  (RS-485)    │
  │  GND   ─────────────┼──────────┼──  GND             │
  │  24V+  ─────────────┼──────────┼──  PWR+            │
  │                     │          │                     │
  └─────────────────────┘          └─────────────────────┘
\`\`\`

| Terminal | Signal    | Color  | Spec        |
|----------|-----------|--------|-------------|
| TB1+     | RS-485 A+ | 🔵 Blue  | EIA-485   |
| TB1-     | RS-485 B- | ⚪ White | EIA-485   |
| GND      | Ground    | ⚫ Black | 0V        |
| 24V+     | Power     | 🔴 Red   | 18–30V DC |

> 📚 **Source:** From knowledge base. Verify with official manual.`;
    }

    return `${header}

### Standard HMS / Dexter Panel Reference Diagram

\`\`\`
  ┌─────────────────────┐          ┌─────────────────────┐
  │     HMS PANEL       │          │    FIELD DEVICE     │
  │                     │          │                     │
  │  TB1+  ─────────────┼──────────┼──  A+  (RS-485)    │
  │  TB1-  ─────────────┼──────────┼──  B-  (RS-485)    │
  │  GND   ─────────────┼──────────┼──  GND             │
  │  24V+  ─────────────┼──────────┼──  PWR+            │
  └─────────────────────┘          └─────────────────────┘
\`\`\`

### Wire Color Standard (IEC 60757)

| Color         | Signal         |
|---------------|---------------|
| 🔴 Red        | 24V DC (+)    |
| ⚫ Black      | GND / 0V      |
| 🔵 Blue       | RS-485 A+     |
| ⚪ White      | RS-485 B-     |
| 🟡 Yellow     | Shield / PE   |
| 🟢 Green      | Earth Bond    |

> ℹ️ Upload the **${panelType}** manual via **Admin → Train Bot** for panel-specific wiring data.`;
}

// ─── Main Handler ─────────────────────────────────────────────

export interface DiagramResult {
    success: boolean;
    markdown: string;
    title: string;
    diagramType: string;
    panelType: string;
    hasKBContext: boolean;
    generatedBy: string;
    detailLevel?: 'basic' | 'context-rich';
    error?: string;
}

/**
 * Shared internal logic for generating diagrams.
 * Called directly by the chat API (to avoid HTTP fetch in Netlify)
 * and by the /api/diagram POST handler.
 * 
 * ENHANCEMENT: Now accepts optional ragContext for context-aware diagrams.
 * If ragContext is provided, uses it directly instead of doing separate KB search.
 */
export async function generateDiagramInternal(
    query: string,
    englishQuery: string,
    diagramType: string,
    language: string,
    options: {
        ragContext?: string;
        ragMatches?: Array<{question: string; answer: string; category: string; finalScore: number}>;
        detailLevel?: 'basic' | 'context-rich';
    } = {}
): Promise<DiagramResult> {
    const sarvamKey = process.env.SARVAM_API_KEY;
    if (!sarvamKey) {
        throw new Error('SARVAM_API_KEY not configured');
    }

    const panelType = englishQuery || query;
    const { ragContext, ragMatches, detailLevel = 'context-rich' } = options;
    
    console.log(`📐 Internal diagram gen: "${panelType}" | type: ${diagramType} | lang: ${language} | level: ${detailLevel}`);

    // Use provided RAG context or search KB if not provided
    let kbContext: string;
    let hasKBContext: boolean;
    
    if (ragContext && ragContext.length > 50) {
        // Use pre-fetched RAG context - this makes diagrams context-specific!
        kbContext = formatRAGContextForDiagram(ragMatches, ragContext);
        hasKBContext = true;
        console.log(`📚 Using provided RAG context: ${kbContext.length} chars`);
    } else {
        // Fallback to KB search
        kbContext = await searchKBForDiagram(panelType, diagramType);
        hasKBContext = kbContext.length > 50;
        console.log(`📚 KB: ${hasKBContext ? `${kbContext.length} chars` : 'none'}`);
    }

    // Generate markdown diagram via Sarvam
    const result = await generateTextDiagram(panelType, diagramType, kbContext, sarvamKey, language, detailLevel);

    console.log(`✅ Diagram generated: ${result.markdown.length} chars`);

    return {
        success: true,
        markdown: result.markdown,
        title: result.title,
        diagramType: result.diagramType,
        panelType,
        hasKBContext,
        generatedBy: 'sarvam',
        detailLevel,
    };
}

/**
 * Formats RAG context specifically for diagram generation.
 * Extracts relevant specs (terminals, wire colors, voltages) from retrieved content.
 */
function formatRAGContextForDiagram(
    matches: Array<{question: string; answer: string; category: string; finalScore: number}> | undefined,
    contextString: string
): string {
    if (!matches || matches.length === 0) {
        return contextString;
    }

    // Extract specific technical specs from RAG matches for diagram use
    const specs: string[] = [];
    
    for (const match of matches) {
        const content = `${match.question} ${match.answer}`;
        
        // Extract terminal references
        const terminals = content.match(/TB\d*[+-]?/gi);
        if (terminals) specs.push(`Terminals: ${[...new Set(terminals)].join(', ')}`);
        
        // Extract wire colors
        const colors = content.match(/\b(red|blue|white|black|yellow|green|orange|brown|gray|violet)\b/gi);
        if (colors) specs.push(`Wire Colors: ${[...new Set(colors)].join(', ')}`);
        
        // Extract voltages
        const voltages = content.match(/\b\d+[Vv]\s*(?:DC|AC)?\b/g);
        if (voltages) specs.push(`Voltages: ${[...new Set(voltages)].join(', ')}`);
        
        // Extract protocols
        const protocols = content.match(/\b(RS-?485|Modbus|PROFIBUS|Ethernet|CAN)\b/gi);
        if (protocols) specs.push(`Protocols: ${[...new Set(protocols)].join(', ')}`);
    }

    // Build enhanced context
    const specSection = specs.length > 0 
        ? `\n**SPECIFIC VALUES FROM KNOWLEDGE BASE:**\n${specs.map(s => `- ${s}`).join('\n')}\n\n---\n`
        : '';

    return `${specSection}${contextString}`;
}

export async function POST(req: NextRequest) {
    try {
        const { query, englishQuery, diagramType, language } = await req.json();
        const result = await generateDiagramInternal(query, englishQuery, diagramType, language);
        return NextResponse.json(result);
    } catch (err: any) {
        console.error('❌ Diagram error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}