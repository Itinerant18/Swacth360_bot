
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
import { stripThinkTags } from '@/lib/sarvam';
import { ChatOpenAI } from '@langchain/openai';



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

// Strong wiring intent keywords — if the user explicitly says "wire" or "wiring"
// alongside a protocol like RS-485, the intent is wiring, not network config.
const STRONG_WIRING_KEYWORDS = ['wiring', 'wire ', 'wire?', 'how to wire', 'how do i wire', 'terminal'];

export function isDiagramRequest(text: string): { isDiagram: boolean; diagramType: string } {
    const lower = text.toLowerCase();
    const hasDiagramIntent = DIAGRAM_KEYWORDS.some(kw => {
        if (kw.includes('.*')) return new RegExp(kw).test(lower);
        return lower.includes(kw);
    });
    if (!hasDiagramIntent) return { isDiagram: false, diagramType: '' };

    // Score-based matching: count how many keywords match per type
    const scores: Record<string, number> = {};
    for (const [type, keywords] of Object.entries(DIAGRAM_TYPE_MAP)) {
        let score = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) score++;
        }
        if (score > 0) scores[type] = score;
    }

    if (Object.keys(scores).length === 0) {
        return { isDiagram: true, diagramType: 'wiring' };
    }

    // Boost wiring score if user explicitly uses wiring-intent words
    if (scores.wiring && STRONG_WIRING_KEYWORDS.some(kw => lower.includes(kw))) {
        scores.wiring += 3;
    }

    // Pick the type with the highest score
    let bestType = 'wiring';
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestType = type;
        }
    }

    return { isDiagram: true, diagramType: bestType };
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
        const relevant = matches.filter((m: { question: string; answer: string; content?: string; subcategory?: string }) => {
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
        return toUse.map((m: { category: string; question: string; answer: string }) =>
            `### ${m.category}\n**Q:** ${m.question}\n**A:** ${m.answer}`
        ).join('\n\n');
    } catch {
        return '';
    }
}

// ─── Diagram prompt templates per type ───────────────────────
// Each template tells Sarvam exactly what ASCII/markdown structure to produce.

const DIAGRAM_PROMPTS: Record<string, string> = {

  wiring: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL wiring diagram document for: {panelType}

{kbSection}

Produce a markdown document with EXACTLY these sections in this order.
Fill every table cell. Use real values from the knowledge base where available.

## 🔌 Wiring Diagram — {panelType}

### Connection Overview
\`\`\`
  ┌──────────────────────┐                    ┌──────────────────────┐
  │     HMS PANEL        │                    │    FIELD DEVICE      │
  │   ({panelType})      │                    │                      │
  │                      │   ── A+ (Blue) ──► │  RS-485 A+           │
  │  TB1+  ──────────────┼───────────────────►│  24V DC In           │
  │  TB1−  ──────────────┼───────────────────►│  GND                 │
  │  GND   ──────────────┼───────────────────►│  GND                 │
  │  A+    ──────────────┼───────────────────►│  RS-485 A+           │
  │  B−    ──────────────┼───────────────────►│  RS-485 B−           │
  └──────────────────────┘                    └──────────────────────┘
\`\`\`

### Terminal Connection Table
| Terminal | Signal Type | Wire Color | Destination | Specification |
|----------|------------|-----------|-------------|---------------|
| \`TB1+\` | 24V DC Power | 🔴 Red | PSU Positive | \`18–30V DC\`, max \`5A\` |
| \`TB1−\` | Ground (0V) | ⚫ Black | PSU Negative | 0V reference |
| \`A+\` | RS-485 Data A | 🔵 Blue | Slave A+ | EIA-485, differential |
| \`B−\` | RS-485 Data B | ⚪ White | Slave B− | EIA-485, differential |
| \`GND\` | Shield / PE | 🟡 Yellow | Earth bond | IEC 60757 |
(Add all terminals specific to {panelType}. Do not leave rows empty.)

### Wire Colour Code (IEC 60757)
| Colour | Signal | AWG / mm² |
|--------|--------|-----------|
| 🔴 Red | DC Positive (+) | 18 AWG / 1.0mm² |
| ⚫ Black | DC Negative / GND | 18 AWG / 1.0mm² |
| 🔵 Blue | RS-485 A+ (Data) | 22 AWG / 0.5mm² |
| ⚪ White | RS-485 B− (Data) | 22 AWG / 0.5mm² |
| 🟡 Yellow | Shield / Protective Earth | 20 AWG / 0.75mm² |
| 🟢 Green | Earth Bond | 18 AWG / 1.0mm² |

### Installation Steps
1. **De-energise** all circuits before starting — verify with multimeter at \`TB1+\`
2. **Connect power** — \`TB1+\` → PSU positive (🔴 Red), \`TB1−\` → PSU negative (⚫ Black)
3. **Connect RS-485** — \`A+\` → slave \`A+\` (🔵 Blue), \`B−\` → slave \`B−\` (⚪ White)
4. **Add termination resistor** — \`120Ω\` between \`A+\` and \`B−\` at both ends of the bus
5. **Connect shield** — single-point earth at panel end only (🟡 Yellow → \`GND\`)
6. **Power on** — verify \`PWR\` LED is solid green within 3 seconds

### ⚠️ Critical Notes
- Never exceed \`30V DC\` on power terminals — device damage is immediate and irreversible
- RS-485 polarity reversal (\`A+\`/\`B−\` swapped) causes silent communication failure
- Always use shielded twisted pair cable for RS-485 runs longer than \`10m\`
- Maximum bus length: \`1200m\` at \`9600 bps\` | \`600m\` at \`19200 bps\``,

  power: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL power supply wiring document for: {panelType}

IMPORTANT: Use ONLY plain ASCII art inside triple-backtick code blocks. Do NOT generate \`\`\`mermaid blocks for power diagrams — use plain \`\`\` with Unicode box-drawing characters only.

{kbSection}

## ⚡ Power Supply Diagram — {panelType}

### Power Architecture
\`\`\`
  230V AC Mains                    24V DC Bus
  ────────────┐                    ┌───────────────────────────
              │  ┌──────────────┐  │
  L ─────────►│  │     PSU      │  ├──► TB1+  HMS Panel
  N ─────────►│  │  24V / 5A    │  ├──► TB2+  I/O Module
  PE ────────►│  │  DIN Rail    │  ├──► TB3+  Comms Module
              │  └──────┬───────┘  │
              │         │ GND ─────┴──► TB1−  (Common GND)
              └─────────┘
\`\`\`

### Power Requirements
| Component | Input Voltage | Current Draw | Fuse Rating |
|-----------|--------------|-------------|-------------|
| HMS Panel (CPU) | \`24V DC ±20%\` | \`80mA typical\` | \`500mA\` |
| I/O Module | \`24V DC ±20%\` | \`40mA per module\` | \`250mA\` |
| RS-485 Bus | Powered from panel | \`20mA\` | — |
| Total system | \`24V DC\` | \`≤ 150mA\` | \`1A\` (PSU output) |

### Power Wiring Terminals
| Terminal | Function | Wire Colour | Min Wire Size |
|----------|----------|------------|--------------|
| \`TB1+\` | 24V DC Input | 🔴 Red | 18 AWG / 1.0mm² |
| \`TB1−\` | GND / 0V | ⚫ Black | 18 AWG / 1.0mm² |
| \`PE\` | Protective Earth | 🟢 Green | 18 AWG / 1.0mm² |

### Power-On Sequence
1. Confirm PSU output: \`24V DC ±1V\` (measure at PSU terminals before connecting)
2. Connect \`TB1−\` (GND) first — always ground before applying positive
3. Connect \`TB1+\` (24V) — panel should power on within 1 second
4. Verify \`PWR\` LED: solid 🟢 Green = healthy | flashing 🔴 Red = fault

### ⚠️ Safety Requirements
- Input mains (\`230V AC\`) must be handled by a qualified electrician only
- PSU must be CE-marked and rated for DIN-rail mounting (EN 60950)
- Always fit an appropriately rated fuse or MCB on the \`230V AC\` supply
- Do not exceed \`30V DC\` on panel power terminals under any circumstances`,

  network: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL network topology diagram for: {panelType}

{kbSection}

## 🌐 Network / Bus Topology — {panelType}

### Bus Architecture
\`\`\`mermaid
flowchart LR
    subgraph Master["HMS Panel / Master"]
        M["{panelType}<br/>Modbus RTU Master"]
    end
    subgraph Bus["RS-485 Bus (Shielded Twisted Pair)<br/>Max 1200m @ 9600 bps"]
        M -->|"A+ / B−"| N1["Node 01<br/>Addr: 1"]
        M -->|"A+ / B−"| N2["Node 02<br/>Addr: 2"]
        M -->|"A+ / B−"| N3["Node 03<br/>Addr: 3"]
        M -->|"A+ / B−"| NN["Node N<br/>Addr: N"]
    end
    T1["120Ω Terminator"] -.-> N1
    T2["120Ω Terminator"] -.-> NN
    PC["Config PC<br/>RS-232 / USB"] -->|"Setup"| M
\`\`\`

Update the node names, addresses, and device types using actual KB data for {panelType}. Add all relevant devices as nodes.

### Network Parameters
| Parameter | Value | Notes |
|-----------|-------|-------|
| Protocol | \`Modbus RTU\` | RS-485 physical layer |
| Baud rate | \`9600 bps\` default | Configurable: 1200–115200 |
| Data bits | \`8\` | Fixed |
| Parity | \`None\` (or \`Even\`) | Must match all devices |
| Stop bits | \`1\` (or \`2\`) | Must match all devices |
| Max nodes | \`32\` (standard RS-485) | Up to 128 with repeaters |
| Max cable | \`1200m @ 9600 bps\` | \`600m @ 19200 bps\` |
| Termination | \`120Ω\` | Both ends of bus only |

### ⚠️ Common Network Faults
| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| All nodes timeout (\`E001\`) | Missing terminator | Add \`120Ω\` at both bus ends |
| One node fails intermittently | Address conflict | Verify all addresses are unique |
| CRC errors on all nodes | A+/B− polarity reversed | Swap blue and white wires |
| Communication drops at high speed | Cable too long | Reduce baud rate or add repeater |`,

  panel: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL panel layout document for: {panelType}

{kbSection}

## 📋 Panel Layout — {panelType}

### Front Panel Layout
\`\`\`
  ┌──────────────────────────────────────────────────────┐
  │                    {panelType}                       │
  │  ┌─────────────────────┐  ┌──────────────────────┐  │
  │  │   STATUS DISPLAY    │  │    STATUS LEDs        │  │
  │  │   [LCD / 7-seg]     │  │  PWR  COM  ERR  NET  │  │
  │  └─────────────────────┘  │  [🟢] [🟡] [🔴] [🔵] │  │
  │                           └──────────────────────┘  │
  │  ┌────────────────────────────────────────────────┐  │
  │  │              DIN RAIL SECTION                  │  │
  │  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐  │  │
  │  │  │ MCB  │  │ PSU  │  │ CPU  │  │ I/O MOD  │  │  │
  │  │  │ 6A   │  │ 24V  │  │      │  │          │  │  │
  │  │  └──────┘  └──────┘  └──────┘  └──────────┘  │  │
  │  └────────────────────────────────────────────────┘  │
  │                                                      │
  │  TB1   TB2   TB3   TB4   TB5   TB6   TB7   TB8      │
  │  [PWR] [GND] [485] [485] [DI1] [DI2] [DO1] [DO2]   │
  └──────────────────────────────────────────────────────┘
\`\`\`

### Component Placement
| Component | DIN Position | Function | Notes |
|-----------|-------------|----------|-------|
| MCB | Leftmost | Mains circuit breaker | \`6A\`, \`230V AC\` |
| PSU | Left of CPU | 24V DC power supply | DIN rail, CE-marked |
| CPU Module | Centre | Main controller | {panelType} |
| I/O Module | Right of CPU | Digital inputs/outputs | Expansion |

### Terminal Block Map
| TB Block | Terminals | Signal Group | Colour Code |
|----------|-----------|-------------|------------|
| TB1 | \`TB1+\` | 24V DC Power | 🔴 Red |
| TB2 | \`TB2−\` | GND / 0V | ⚫ Black |
| TB3 | \`TB3 A+\` | RS-485 Data A | 🔵 Blue |
| TB4 | \`TB4 B−\` | RS-485 Data B | ⚪ White |
| TB5–6 | \`DI1–DI2\` | Digital Inputs | 🟡 Yellow |
| TB7–8 | \`DO1–DO2\` | Digital Outputs (relay) | 🟢 Green |

### ⚠️ Installation Notes
- Maintain \`25mm\` clearance above and below DIN rail for airflow
- Group power and signal wiring in separate cable ducts
- Label all terminal blocks before installation`,

  block: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL system block diagram for: {panelType}

{kbSection}

## 🔷 System Block Diagram — {panelType}

### System Architecture
\`\`\`mermaid
flowchart TD
    subgraph Field["🏭 Field Devices"]
        S["📡 Sensors / Detectors"]
        A["⚙️ Actuators / Relays"]
    end
    subgraph Panel["📋 {panelType}"]
        CPU["🖥️ CPU / Logic<br/>Processing"]
        IO["🔌 I/O Module<br/>DI1-DI8 / DO1-DO4"]
        COM["📶 RS-485 Bus<br/>Modbus RTU"]
        CPU --> IO
        CPU --> COM
    end
    subgraph Power["⚡ Power Supply"]
        PSU["🔋 24V DC / 5A<br/>DIN Rail PSU"]
    end
    subgraph Supervisory["🖥️ Supervisory"]
        SCADA["📊 SCADA / HMI"]
        CFG["💻 Config PC<br/>USB / RS-232"]
    end
    S -->|"24V DC Signals"| IO
    IO -->|"Relay Contacts"| A
    PSU -->|"TB1+ / TB1−"| Panel
    COM -->|"RS-485 A+ B−"| SCADA
    CFG -->|"USB / RS-232"| CPU
\`\`\`

Update all node names, signals, and module names using actual KB data for {panelType}.

### Signal Flow
| Signal Direction | From | Protocol | To | Data |
|-----------------|------|----------|-----|------|
| Input (field → panel) | Sensors / Switches | Digital 24V DC | \`DI1–DI8\` | ON/OFF states |
| Output (panel → field) | \`DO1–DO4\` | Relay contact | Actuators | Commands |
| Upstream (panel → SCADA) | \`RS-485\` | Modbus RTU | SCADA server | All registers |
| Config (PC → panel) | USB / RS-232 | Proprietary | CPU | Parameters |

### I/O Summary
| Type | Count | Signal Level | Terminals |
|------|-------|-------------|-----------|
| Digital Inputs | 8 | \`24V DC\` (NPN/PNP selectable) | \`DI1–DI8\` |
| Digital Outputs | 4 | Relay, \`250V AC / 5A\` | \`DO1–DO4\` |
| RS-485 Port | 1 | EIA-485 | \`A+\`, \`B−\`, \`GND\` |
| Power Input | 1 | \`18–30V DC\` | \`TB1+\`, \`TB1−\` |`,

  connector: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL connector pinout document for: {panelType}

{kbSection}

## 🔗 Connector Pinout — {panelType}

### Connector Face Views
\`\`\`
  RJ45 (Ethernet / RS-485 adapter)    DB9 Male (RS-232 / Config port)
  ┌─────────────────────┐             ┌─────────────────────┐
  │  1  2  3  4  5  6  7  8  │         │  1   2   3   4   5  │
  │  ──────────────────  │             │    6   7   8   9    │
  └─────────────────────┘             └─────────────────────┘
  (Tab faces down — T568B)             (Solder side view)
\`\`\`

### RJ45 Pin Assignment (T568B)
| Pin | Signal | Wire Colour | Direction | Description |
|-----|--------|-----------|-----------|-------------|
| 1 | TX+ | 🟠 Orange/White | Output | Transmit Data + |
| 2 | TX− | 🟠 Orange | Output | Transmit Data − |
| 3 | RX+ | 🟢 Green/White | Input | Receive Data + |
| 4 | — | 🔵 Blue | — | Unused / PoE |
| 5 | — | 🔵 Blue/White | — | Unused / PoE |
| 6 | RX− | 🟢 Green | Input | Receive Data − |
| 7 | — | 🟤 Brown/White | — | Unused |
| 8 | GND | 🟤 Brown | Ground | Cable shield |

### DB9 Pin Assignment (RS-232)
| Pin | Signal | Direction | Description |
|-----|--------|-----------|-------------|
| 2 | RXD | Input | Receive Data |
| 3 | TXD | Output | Transmit Data |
| 5 | GND | — | Signal Ground |
| 7 | RTS | Output | Request to Send |
| 8 | CTS | Input | Clear to Send |
| 1,4,6,9 | — | — | Not connected |

### ⚠️ Connection Notes
- Always use pre-crimped RJ45 connectors — hand-crimped connectors cause intermittent faults
- RS-232 maximum cable length: \`15m\` at \`9600 bps\` (use RS-485 for longer runs)
- Never connect RS-232 and RS-485 simultaneously`,

  led: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL LED status reference for: {panelType}

{kbSection}

## 💡 LED Status Indicators — {panelType}

### LED Panel Layout
\`\`\`
  ┌──────────────────────────────────────────────────────────┐
  │  PWR      COM      ERR      NET      I/O      ALM        │
  │                                                          │
  │  [ 🟢 ]  [ 🟡 ]  [ ⚫ ]  [ 🔵 ]  [ 🟢 ]  [ ⚫ ]      │
  │                                                          │
  │  Power  Comms   Error   Network  I/O OK  Alarm          │
  └──────────────────────────────────────────────────────────┘
\`\`\`

### LED State Reference
| LED | Colour | State | Meaning | Action Required |
|-----|--------|-------|---------|----------------|
| PWR | 🟢 Green | Solid ON | Power OK, system healthy | None |
| PWR | 🔴 Red | Solid ON | Power fault or brownout | Check \`TB1+\` voltage: must be \`18–30V DC\` |
| PWR | ⚫ Off | Off | No power | Check PSU output and \`TB1+\` wiring |
| COM | 🟡 Amber | Blinking | Active communication | None — normal operation |
| COM | 🟡 Amber | Solid ON | Communication stalled | Check RS-485 wiring and baud rate |
| COM | ⚫ Off | Off | No communication | Verify slave address and cable \`A+\`/\`B−\` polarity |
| ERR | 🔴 Red | Solid ON | System error (see error code) | Read error code from display |
| ERR | 🔴 Red | Blinking | Non-critical warning | Check logs |
| ERR | ⚫ Off | Off | No errors | None |
| NET | 🔵 Blue | Solid ON | Network connected | None |
| NET | 🔵 Blue | Blinking | Network activity | None — normal |
| NET | ⚫ Off | Off | No network / not configured | Check Ethernet cable or RS-485 bus |
| I/O | 🟢 Green | Solid ON | All I/O normal | None |
| I/O | 🟡 Amber | Blinking | I/O state changing | None — normal |
| ALM | 🔴 Red | Solid ON | Active alarm | Investigate alarm log immediately |
| ALM | 🔴 Red | Blinking | Alarm acknowledged, not cleared | Resolve alarm condition |

### Fault Diagnosis by LED Pattern
| PWR | COM | ERR | ALM | Diagnosis | First Action |
|-----|-----|-----|-----|-----------|-------------|
| 🟢 | 🟡 blink | ⚫ | ⚫ | Normal operation | None |
| 🟢 | ⚫ | 🔴 | ⚫ | Communication lost | Check \`A+\`/\`B−\` wiring |
| 🔴 | ⚫ | 🔴 | ⚫ | Power fault | Measure \`TB1+\`: should be \`18–30V DC\` |
| 🟢 | 🟡 solid | 🔴 | 🔴 | Bus stall + alarm | Reboot slave devices |
| ⚫ | ⚫ | ⚫ | ⚫ | No power | Check PSU, MCB, and \`TB1+\` fuse |`,

  alarm: `You are a senior technical writer for HMS industrial panels at SEPLe.
Generate a COMPLETE, PROFESSIONAL alarm system diagram for: {panelType}

{kbSection}

## 🚨 Alarm System Architecture — {panelType}

### Alarm Zone Architecture
\`\`\`mermaid
flowchart TD
    subgraph Zones["🔍 Alarm Input Zones"]
        Z1["Zone 1<br/>PIR Motion → DI1"]
        Z2["Zone 2<br/>Magnetic Contact → DI2"]
        Z3["Zone 3<br/>Manual Call Point → DI3"]
        Z4["Zone 4<br/>Smoke Detector → DI4"]
        Z5["Tamper<br/>Panel Tamper → DI5"]
    end
    subgraph Panel["📋 {panelType}<br/>HMS Alarm Panel"]
        PROC["⚙️ Alarm Processing<br/>Zone Logic / EOL Check"]
    end
    subgraph Outputs["🔔 Alarm Outputs"]
        DO1["🔔 DO1 → Siren 24V"]
        DO2["💡 DO2 → Strobe Light"]
        DO3["📡 DO3 → Auto-Dialer"]
        DO4["🔑 DO4 → Access Relay"]
    end
    Z1 -->|"Closed Loop + 4k7Ω EOL"| PROC
    Z2 -->|"Closed Loop + 4k7Ω EOL"| PROC
    Z3 -->|"Closed Loop + 4k7Ω EOL"| PROC
    Z4 -->|"Closed Loop + 4k7Ω EOL"| PROC
    Z5 -->|"Tamper Loop"| PROC
    PROC -->|"On Alarm"| DO1
    PROC -->|"On Alarm"| DO2
    PROC -->|"On Alarm"| DO3
    PROC -->|"On Alarm"| DO4
\`\`\`

Update zone names, detector types, and outputs using actual KB data for {panelType}.

### Zone Wiring Table
| Zone | Detector Type | Terminal | EOL Resistor | Wire | Normal State |
|------|--------------|----------|-------------|------|-------------|
| Zone 1 | PIR Motion | \`DI1\` | \`4k7Ω\` | 🔴🔵 | Closed loop |
| Zone 2 | Magnetic contact | \`DI2\` | \`4k7Ω\` | 🔴🔵 | Closed loop |
| Zone 3 | Manual call point | \`DI3\` | \`4k7Ω\` | 🔴🔵 | Closed loop |
| Zone 4 | Smoke detector | \`DI4\` | \`4k7Ω\` | 🔴🔵 | Closed loop |
| Tamper | Panel tamper switch | \`DI5\` | \`4k7Ω\` | 🔴⚫ | Closed loop |

### Output Wiring Table
| Output | Device | Terminal | Rating | Activation |
|--------|--------|----------|--------|-----------|
| DO1 | Siren / Sounder | \`DO1+\`, \`DO1−\` | \`24V DC\`, \`500mA\` max | On alarm |
| DO2 | Strobe light | \`DO2+\`, \`DO2−\` | \`24V DC\`, \`250mA\` max | On alarm |
| DO3 | Auto-dialer | \`DO3\` (relay N/O) | \`250V AC\`, \`5A\` | On alarm |
| DO4 | Access control relay | \`DO4\` (relay N/C) | \`250V AC\`, \`5A\` | On alarm (lock) |

### ⚠️ Critical Wiring Notes
- All zones MUST use End-of-Line (EOL) resistors for tamper detection — \`4k7Ω\` standard
- Siren loop must be individually fused: \`1A\` fast-blow fuse on \`DO1+\`
- Never share 0V (GND) between alarm output devices and input zones`,
};

// ─── Generate text diagram via Sarvam ────────────────────────
async function generateTextDiagram(
    panelType: string,
    diagramType: string,
    kbContext: string,
    sarvamKey: string,
    language: string
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
        : `**Note:** No manual uploaded yet. Generate a standard HMS panel diagram.\nAdmin can upload manuals via Admin → Train Bot for panel-specific specs.\n\n---\n`;

    // Get the template for this diagram type
    const templateStr = DIAGRAM_PROMPTS[diagramType] || DIAGRAM_PROMPTS.wiring;

    // Build the full prompt
    const fullPrompt = templateStr
        .replace(/{panelType}/g, panelType)
        .replace(/{kbSection}/g, kbSection);

    const systemPrompt = `You are SAI, a SENIOR industrial documentation specialist for HMS panels at SEPLe.

Your output standards:
1. ACCURACY — Use KB data verbatim when available. Never invent terminal names or voltages.
2. PROFESSIONALISM — Every diagram must look like it came from an official technical manual.
3. COMPLETENESS — Fill ALL table cells. Use standard HMS reference values when KB data is unavailable.
4. STRUCTURE — Follow the exact section order from the template. Do not add extra sections.
5. DIAGRAM FORMAT — If the template uses \`\`\`mermaid, generate valid Mermaid flowchart/sequence syntax. If the template uses plain \`\`\`, generate ASCII art with Unicode box-drawing characters (┌┐└┘├┤─│►◄). Do NOT mix the two formats.
6. MERMAID RULES — When generating Mermaid: use quoted labels "like this" for special chars, use <br/> for line breaks in nodes, keep node IDs simple (A, B, C...), use subgraph for grouping. NEVER use backticks inside edge labels or node labels — use double quotes instead. Wrong: -->|\`18 AWG Red\`| Correct: -->|"18 AWG Red"| CRITICAL: Never use emoji inside Mermaid node labels or edge labels — they cause parser failures. Plain ASCII text only inside [""] and |""| labels.
7. FORMATTING — Terminal names, voltages, error codes, and measurements must be in backtick \`inline code\`.
8. WIRE COLOURS — Use emoji circles: 🔴 Red, ⚫ Black, 🔵 Blue, ⚪ White, 🟡 Yellow, 🟢 Green, 🟠 Orange, 🟤 Brown.
9. ACTIONABLE — Every diagram must include numbered installation/verification steps.
10. NO THINKING — Do NOT use <think> tags. Output ONLY the markdown diagram document directly. No preamble, no reasoning, no closing remarks.

Output valid markdown that renders correctly. Start immediately with the diagram content.`;

    try {
        const result = await sarvam.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fullPrompt },
        ]);

        let markdown = stripThinkTags((result.content as string)).trim();

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

    } catch (err: unknown) {
        console.error('Sarvam diagram generation failed:', (err as Error).message);

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
    const typeLabel = diagramType.charAt(0).toUpperCase() + diagramType.slice(1);
    const emoji: Record<string, string> = { wiring: '🔌', power: '⚡', network: '🌐', panel: '📋', block: '🔷', connector: '🔗', led: '💡', alarm: '🚨' };
    const icon = emoji[diagramType] || '🔌';
    const header = `## ${icon} ${typeLabel} Diagram — ${panelType}`;

    const kbBlock = kbContext
        ? `### Knowledge Base Specifications\n\n${kbContext}\n\n---\n`
        : '';

    const sourceNote = kbContext
        ? `> 📚 **Source:** Generated from uploaded manual data. Always verify with the official ${panelType} installation manual before making physical connections.`
        : `> ℹ️ **Note:** Standard HMS reference diagram. Upload the **${panelType}** manual via **Admin → Train Bot** for panel-specific wiring data and specifications.`;

    return `${header}

${kbBlock}### Standard HMS Panel Reference

\`\`\`
  ┌──────────────────────┐                    ┌──────────────────────┐
  │     HMS PANEL        │                    │    FIELD DEVICE      │
  │   (${panelType})     │                    │                      │
  │                      │                    │                      │
  │  TB1+  ──────────────┼───────────────────►│  24V DC In           │
  │  TB1−  ──────────────┼───────────────────►│  GND                 │
  │  A+    ──────────────┼───────────────────►│  RS-485 A+           │
  │  B−    ──────────────┼───────────────────►│  RS-485 B−           │
  │  GND   ──────────────┼───────────────────►│  Shield / PE         │
  └──────────────────────┘                    └──────────────────────┘
\`\`\`

### Terminal Connection Table
| Terminal | Signal Type | Wire Colour | Destination | Specification |
|----------|------------|------------|-------------|---------------|
| \`TB1+\` | 24V DC Power | 🔴 Red | PSU Positive | \`18–30V DC\`, max \`5A\` |
| \`TB1−\` | Ground (0V) | ⚫ Black | PSU Negative | 0V reference |
| \`A+\` | RS-485 Data A | 🔵 Blue | Slave A+ | EIA-485, differential |
| \`B−\` | RS-485 Data B | ⚪ White | Slave B− | EIA-485, differential |
| \`GND\` | Shield / PE | 🟡 Yellow | Earth bond | IEC 60757 |

### Wire Colour Code (IEC 60757)
| Colour | Signal | AWG / mm² |
|--------|--------|-----------|
| 🔴 Red | DC Positive (+) | 18 AWG / 1.0mm² |
| ⚫ Black | DC Negative / GND | 18 AWG / 1.0mm² |
| 🔵 Blue | RS-485 A+ (Data) | 22 AWG / 0.5mm² |
| ⚪ White | RS-485 B− (Data) | 22 AWG / 0.5mm² |
| 🟡 Yellow | Shield / Protective Earth | 20 AWG / 0.75mm² |
| 🟢 Green | Earth Bond | 18 AWG / 1.0mm² |

### ⚠️ Critical Notes
- Never exceed \`30V DC\` on power terminals
- Always use \`120Ω\` termination resistors at both ends of RS-485 bus
- RS-485 maximum cable length: \`1200m\` at \`9600 bps\`

${sourceNote}`;
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
    const result = await generateTextDiagram(panelType, diagramType, kbContext, sarvamKey, language);

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
    } catch (err: unknown) {
        console.error('❌ Diagram error:', err);
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
}
