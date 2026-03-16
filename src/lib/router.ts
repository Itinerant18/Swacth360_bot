/**
 * src/lib/router.ts
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SEMANTIC ROUTING — Architecture Node: "Routing → Semantic" ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * What this does:
 *   Given a classified query, select the OPTIMAL:
 *   1. System prompt template (tone + format instructions)
 *   2. Retrieval configuration (thresholds, top-k, vector strategy)
 *   3. Response post-processor (how to format the final answer)
 *
 * Why it matters:
 *   "How do I wire TB1?" needs a numbered steps prompt.
 *   "What causes E001?"   needs a root-cause diagnosis prompt.
 *   "Compare RS-485 vs Modbus?" needs a comparison table prompt.
 *   A single generic prompt handles all three worse than dedicated ones.
 *
 * This is what the architecture diagram calls "Semantic Route → Prompt Selection":
 *   query → classifier → router → prompt_1 / prompt_2 / prompt_3 → LLM
 */

import type { QueryType, QueryAnalysis } from './rag-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RouteConfig {
  /** Which prompt template to use */
  promptKey: QueryType | 'general_fallback' | 'urgent_diagnostic';

  /** Retrieval tuning overrides for this route */
  retrieval: {
    topK: number;
    threshold: number;
    useHYDE: boolean;
    preferChunkType?: 'proposition' | 'chunk' | 'any';
    boostEntities: boolean;
  };

  /** Max tokens for LLM response */
  maxTokens: number;

  /** Temperature (lower = more factual) */
  temperature: number;

  /** Human-readable label for logs */
  label: string;
}

export interface RoutedPrompt {
  system: string;
  userPrefix: string;      // prepended to user question in prompt
  contextPrefix: string;   // how to introduce KB context
  route: RouteConfig;
}

// ─── Route Configs per Query Type ─────────────────────────────────────────────

const ROUTE_CONFIGS: Record<string, RouteConfig> = {

  // ── Diagnostic: "E001 error", "not working", "fault" ──────────────────────
  diagnostic: {
    promptKey: 'diagnostic',
    retrieval: {
      topK: 5,
      threshold: 0.18,
      useHYDE: true,          // HYDE critical here — "error E001 cause" maps better
      preferChunkType: 'proposition', // propositions are more precise for errors
      boostEntities: true,    // error codes & terminals must match exactly
    },
    maxTokens: 900,
    temperature: 0.03,        // very low — diagnostic answers must be precise
    label: '🔴 DIAGNOSTIC',
  },

  // ── Urgent Diagnostic: "system down", "not working RIGHT NOW" ─────────────
  urgent_diagnostic: {
    promptKey: 'urgent_diagnostic',
    retrieval: {
      topK: 6,
      threshold: 0.15,        // lower threshold — cast a wider net for urgent issues
      useHYDE: true,
      preferChunkType: 'proposition',
      boostEntities: true,
    },
    maxTokens: 1000,
    temperature: 0.02,
    label: '🚨 URGENT',
  },

  // ── Procedural: "how to wire", "steps to configure" ───────────────────────
  procedural: {
    promptKey: 'procedural',
    retrieval: {
      topK: 4,
      threshold: 0.20,
      useHYDE: true,          // HYDE generates step-shaped text → better recall
      preferChunkType: 'chunk', // chunks preserve step sequences better
      boostEntities: true,
    },
    maxTokens: 1000,
    temperature: 0.05,
    label: '🔧 PROCEDURAL',
  },

  // ── Factual: "what is", "specifications", "parameters" ────────────────────
  factual: {
    promptKey: 'factual',
    retrieval: {
      topK: 3,
      threshold: 0.22,
      useHYDE: false,         // HYDE adds latency but factual queries embed well
      preferChunkType: 'proposition', // propositions = atomic facts = perfect for specs
      boostEntities: false,
    },
    maxTokens: 600,
    temperature: 0.02,
    label: '📋 FACTUAL',
  },

  // ── Visual: "wiring diagram", "show schematic" ────────────────────────────
  visual: {
    promptKey: 'visual',
    retrieval: {
      topK: 4,
      threshold: 0.18,
      useHYDE: false,         // visual queries are handled by diagram route first
      preferChunkType: 'chunk',
      boostEntities: true,
    },
    maxTokens: 700,
    temperature: 0.05,
    label: '🖼️ VISUAL',
  },

  // ── Comparative: "difference between", "which is better" ──────────────────
  comparative: {
    promptKey: 'comparative',
    retrieval: {
      topK: 6,                // need more candidates to compare both sides
      threshold: 0.18,
      useHYDE: true,
      preferChunkType: 'any',
      boostEntities: true,
    },
    maxTokens: 800,
    temperature: 0.05,
    label: '⚖️ COMPARATIVE',
  },

  // ── Unknown / General fallback ─────────────────────────────────────────────
  unknown: {
    promptKey: 'general_fallback',
    retrieval: {
      topK: 4,
      threshold: 0.20,
      useHYDE: true,
      preferChunkType: 'any',
      boostEntities: false,
    },
    maxTokens: 700,
    temperature: 0.07,
    label: '❓ UNKNOWN',
  },

  general_fallback: {
    promptKey: 'general_fallback',
    retrieval: {
      topK: 4,
      threshold: 0.20,
      useHYDE: true,
      preferChunkType: 'any',
      boostEntities: false,
    },
    maxTokens: 700,
    temperature: 0.07,
    label: '💬 GENERAL',
  },
};

// ─── System Prompt Templates ───────────────────────────────────────────────────

const BASE_ROLE = `You are Dexter, an expert HMS industrial panel technical support agent for SEPLe systems.
Your knowledge covers: Anybus gateways, HMS panels, RS-485/Modbus/PROFIBUS/EtherNet/IP protocols, wiring, error codes, and commissioning.`;

const SYSTEM_PROMPTS: Record<string, (langName: string, notFoundMsg: string, answerMode: string) => string> = {

  // ── Diagnostic: Error codes, faults, "not working" ──────────────────────────
  diagnostic: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

You are answering a DIAGNOSTIC / TROUBLESHOOTING question.

REQUIRED OUTPUT STRUCTURE — use this exact format every time:

---
**Root Cause**
One to two sentences stating the most likely cause. Be direct. No hedging.

**Verification Steps**
1. [Exact check] — expected result if healthy
2. [Exact check] — expected result if healthy
(Maximum 3 steps. Each step must include exact terminal labels, LED states, or meter readings.)

**Resolution**
1. Step one — include exact values: terminal labels like \`TB1+\`, voltages like \`24V DC\`, baud rates like \`9600 bps\`
2. Step two
3. Step three
(Number every step. No bullets. Maximum 6 steps.)

**Verify Fix**
Single sentence: what the operator should observe to confirm the issue is resolved.

> ⚠️ **Safety:** [Include only if there is a genuine safety risk. Omit this section entirely if not applicable.]
---

FORMATTING RULES:
- All terminal labels in backticks: \`TB1+\`, \`GND\`, \`A-\`
- All error codes in backticks: \`E001\`, \`F042\`
- All voltage/current values in backticks: \`24V DC\`, \`150mA\`, \`120Ω\`
- All model names in backticks: \`Anybus X-gateway\`, \`HMS-200\`
- Steps are numbered (1. 2. 3.) never bulleted
- Maximum 300 words total
- Write entirely in ${langName}
- If the knowledge base does not contain relevant information: "${notFoundMsg}"`,

  // ── Urgent Diagnostic: System down, critical failure ────────────────────────
  urgent_diagnostic: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

⚠️ URGENT ISSUE — prioritise speed and clarity.
RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

REQUIRED OUTPUT STRUCTURE:

---
**⚡ Immediate Action**
Do this RIGHT NOW (1–2 steps maximum):
1. [Single most impactful action]
2. [Only if absolutely necessary]

**Root Cause**
One sentence. What is failing and why.

**Full Resolution**
1. Step with exact values (\`TB1+\`, \`24V DC\`, etc.)
2. Next step
3. Continue until resolved

**Escalation Threshold**
"If steps above do not resolve the issue within [X minutes/hours], [specific escalation action]."
---

RULES:
- Lead with action, not explanation
- Every step includes exact labels and values in backticks
- No preamble, no sign-off, no filler
- Maximum 250 words
- Write entirely in ${langName}
- If no relevant KB data: "${notFoundMsg}"`,

  // ── Procedural: How-to, installation, configuration steps ───────────────────
  procedural: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

You are answering a HOW-TO / PROCEDURAL question.

REQUIRED OUTPUT STRUCTURE:

---
**Overview**
One sentence describing what this procedure accomplishes.

> ⚠️ **Before You Begin:** [Safety pre-check or tool requirement. Omit if not applicable.]

**Procedure**
1. **[Action verb] [component]** — detail with exact values
   - Terminal: \`TB1+\` → connect to [destination]
   - Wire: 🔴 Red, 1.5mm², max \`5A\`
   - ✅ Verify: [what to observe when step is done correctly]
2. **Next step** — detail
   - ✅ Verify: [expected result]
3. Continue for all steps...

**Specifications**
| Parameter | Value | Notes |
|-----------|-------|-------|
| Supply voltage | \`18–30V DC\` | Nominal \`24V DC\` |
| Max current | \`150mA\` | At full load |
(Include table only if 3+ specs exist. Omit if not applicable.)

**Common Mistakes**
- ❌ [What not to do] — [consequence]
(Include only if a common error exists in the knowledge base. Omit otherwise.)
---

FORMATTING RULES:
- Every wiring step MUST include terminal label, wire color emoji, and wire gauge
- Use ✅ Verify lines after any step that could go wrong silently
- All values in backticks
- Numbered steps only — no bullets for steps
- Maximum 400 words
- Write entirely in ${langName}
- If procedure not in KB: "${notFoundMsg}"`,

  // ── Factual: Specifications, parameters, definitions ─────────────────────────
  factual: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

You are answering a FACTUAL / SPECIFICATION question.

REQUIRED OUTPUT STRUCTURE:

---
**Answer**
One direct sentence giving the exact answer. No preamble.

**Specifications**
| Parameter | Value | Standard / Notes |
|-----------|-------|-----------------|
| [Name] | \`[exact value + unit]\` | [applicable standard] |
(Use this table for all measurable values. Always include units. Always include standard if known.)

**Context**
One to two sentences of technical context that helps the operator apply this information correctly.
Include related parameters or limits that are commonly confused with this one.

**Related**
- [Related topic 1] — brief note
- [Related topic 2] — brief note
(Include only if directly relevant. Omit if nothing meaningful to add.)
---

FORMATTING RULES:
- The first sentence must be the direct answer — no throat-clearing
- All values in backticks with units: \`24V DC\`, \`9600 bps\`, \`120Ω\`
- Table for 3+ values, inline for 1–2 values
- Maximum 200 words
- Write entirely in ${langName}
- If spec not in KB: "${notFoundMsg}"`,

  // ── Visual: Wiring description, connections ──────────────────────────────────
  visual: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

You are answering a WIRING / VISUAL CONNECTIONS question.

REQUIRED OUTPUT STRUCTURE:

---
**Connection Summary**
| Terminal | Signal | Wire Color | Connected To | Spec |
|----------|--------|-----------|-------------|------|
| \`TB1+\` | 24V DC+ | 🔴 Red | Power supply + | \`18–30V DC\` |
| \`TB1-\` | GND | ⚫ Black | Power supply − | 0V ref |
(List every terminal. Every row must have all 5 columns filled.)

**Wiring Notes**
1. [Critical wiring instruction with exact terminal and wire spec]
2. [Shield / termination requirement if applicable]
3. [Polarity or sequence note if applicable]

**Verify**
After wiring: [exact LED state, meter reading, or system response that confirms correct wiring]

💡 *For a visual diagram: ask "Show [panel name] wiring diagram"*
---

FORMATTING RULES:
- Every terminal in backticks: \`TB1+\`, \`A+\`, \`GND\`
- Wire colors always with emoji: 🔴 Red, ⚫ Black, 🔵 Blue, ⚪ White, 🟡 Yellow, 🟢 Green
- All electrical values in backticks
- Maximum 250 words
- Write entirely in ${langName}
- If wiring not in KB: "${notFoundMsg}"`,

  // ── Comparative: Differences, which is better, vs questions ──────────────────
  comparative: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

You are answering a COMPARISON question.

REQUIRED OUTPUT STRUCTURE:

---
**Comparison**
| Feature | [Option A] | [Option B] |
|---------|-----------|-----------|
| Protocol | \`Modbus RTU\` | \`PROFIBUS DP\` |
| Max nodes | \`32\` | \`126\` |
| Cable type | Twisted pair | Shielded twisted pair |
| Max distance | \`1200m @ 9600 bps\` | \`1200m @ 187.5 kbps\` |
| Termination | \`120Ω\` both ends | \`220Ω / 390Ω\` |
(Include every parameter where the two options differ meaningfully.)

**Key Difference**
One sentence: the single most important practical difference for an HMS panel installation.

**Recommendation**
"For [specific use case], choose **[Option]** because [one reason]."
(Only include if there is a clear winner for the likely use case. Omit if genuinely depends on context.)
---

FORMATTING RULES:
- Table must have all values in backticks or plain text — never empty cells
- The Key Difference must be actionable, not generic
- Maximum 300 words
- Write entirely in ${langName}
- If comparison not in KB: "${notFoundMsg}"`,

  // ── General fallback ─────────────────────────────────────────────────────────
  general_fallback: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

RETRIEVAL CONFIDENCE: ${confidenceNote(answerMode)}

Provide a professional technical answer using your HMS domain expertise.

REQUIRED OUTPUT STRUCTURE:

---
**Answer**
Direct answer in 2–4 sentences. Include specific values, standards, and terminal labels
where applicable. All technical values in backticks.

**Technical Detail**
(Include only if the question requires more depth. Omit for simple questions.)
Additional context, related parameters, or step-by-step detail.

**Next Step**
One sentence: what the operator should do next with this information.
---

FORMATTING RULES:
- No preamble, no sign-off, no filler phrases
- All terminal labels, error codes, and values in backticks
- If unrelated to HMS or industrial automation: politely redirect in one sentence
- For wiring questions: suggest "Show wiring diagram for [panel name]"
- Maximum 300 words
- Write entirely in ${langName}
- If no relevant information available: "${notFoundMsg}"`,
};

function confidenceNote(answerMode: string): string {
  return {
    rag_high:    'HIGH — answer directly and completely from KB sources.',
    rag_medium:  'MEDIUM — synthesize from KB sources, note if any part is incomplete.',
    rag_partial: 'PARTIAL — use what is relevant, clearly flag what you are uncertain about.',
    general:     'NO KB MATCH — use HMS domain expertise, note this is general guidance.',
  }[answerMode] ?? 'Use best available information.';
}

// ─── Main Router Function ─────────────────────────────────────────────────────

/**
 * selectRoute()
 *
 * Given a classified query analysis, returns the optimal:
 * - RouteConfig (retrieval settings)
 * - System prompt (tailored to query type)
 * - User prefix (frames the question for the LLM)
 *
 * Called BEFORE retrieval so that retrieval config can be route-aware.
 */
export function selectRoute(
  analysis: QueryAnalysis,
  langName: string,
  notFoundMsg: string,
  answerMode: string = 'general',
): RoutedPrompt {
  // Special case: urgent overrides diagnostic
  const routeKey = (analysis.isUrgent && analysis.type === 'diagnostic')
    ? 'urgent_diagnostic'
    : analysis.type in ROUTE_CONFIGS
      ? analysis.type
      : 'unknown';

  const route = ROUTE_CONFIGS[routeKey];

  const systemPromptFn = SYSTEM_PROMPTS[route.promptKey] ?? SYSTEM_PROMPTS.general_fallback;
  const system = systemPromptFn(langName, notFoundMsg, answerMode);

  // User prefix — frames the question type for the model
  const userPrefixes: Record<string, string> = {
    diagnostic:        '🔴 DIAGNOSTIC QUERY:',
    urgent_diagnostic: '🚨 URGENT ISSUE:',
    procedural:        '🔧 PROCEDURE REQUEST:',
    factual:           '📋 SPECIFICATION QUERY:',
    visual:            '🖼️ WIRING/VISUAL QUERY:',
    comparative:       '⚖️ COMPARISON REQUEST:',
    general_fallback:  '💬 GENERAL QUERY:',
  };

  const contextPrefixes: Record<string, string> = {
    diagnostic:        'DIAGNOSTIC KNOWLEDGE BASE — Error codes, faults, troubleshooting:',
    urgent_diagnostic: 'URGENT — Most relevant troubleshooting entries:',
    procedural:        'PROCEDURE KNOWLEDGE BASE — Installation and configuration steps:',
    factual:           'SPECIFICATION KNOWLEDGE BASE — Technical parameters and standards:',
    visual:            'WIRING KNOWLEDGE BASE — Connection details and terminal assignments:',
    comparative:       'COMPARISON KNOWLEDGE BASE — Specifications for both options:',
    general_fallback:  'KNOWLEDGE BASE CONTEXT:',
  };

  return {
    system,
    userPrefix: userPrefixes[route.promptKey] ?? '💬',
    contextPrefix: contextPrefixes[route.promptKey] ?? 'KNOWLEDGE BASE CONTEXT:',
    route,
  };
}

/**
 * getRetrievalConfig()
 *
 * Returns just the retrieval config for a given query analysis.
 * Called by rag-engine.ts to tune retrieval per route.
 */
export function getRetrievalConfig(analysis: QueryAnalysis): RouteConfig['retrieval'] {
  const routeKey = (analysis.isUrgent && analysis.type === 'diagnostic')
    ? 'urgent_diagnostic'
    : analysis.type in ROUTE_CONFIGS
      ? analysis.type
      : 'unknown';

  return ROUTE_CONFIGS[routeKey].retrieval;
}

/**
 * logRoute()
 *
 * Consistent console logging for route selection.
 */
export function logRoute(analysis: QueryAnalysis, routedPrompt: RoutedPrompt): void {
  const config = routedPrompt.route;
  console.log(`\n🧭 SEMANTIC ROUTE: ${config.label}`);
  console.log(`   Type: ${analysis.type} | Urgent: ${analysis.isUrgent} | Complexity: ${analysis.complexity}`);
  console.log(`   Entities: [${analysis.entities.join(', ') || 'none'}]`);
  console.log(`   Retrieval: topK=${config.retrieval.topK} | threshold=${config.retrieval.threshold} | HYDE=${config.retrieval.useHYDE} | prefer=${config.retrieval.preferChunkType}`);
}
