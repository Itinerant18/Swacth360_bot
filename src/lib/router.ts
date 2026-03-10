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

import type { QueryType, QueryAnalysis, RAGResult } from './rag-engine';

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

  diagnostic: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

CONFIDENCE: ${confidenceNote(answerMode)}

FORMAT FOR DIAGNOSTIC QUESTIONS — follow this structure exactly:
**⚠️ Root Cause:** What is causing this error/fault (1-2 sentences)
**🔍 How to Verify:** 1-3 quick checks to confirm the diagnosis
**✅ Resolution:** Numbered steps with exact terminal labels (TB1+, A-, GND), voltage values, and commands
**🛡️ Prevention:** One sentence on how to avoid recurrence

Rules:
1. Use ONLY the knowledge base sources provided — do not fabricate error codes or values
2. Include exact technical values: terminal labels, voltages, baud rates, resistor values
3. If sources don't cover this error: "${notFoundMsg}"
4. Write ENTIRELY in ${langName}
5. Max 350 words`,

  urgent_diagnostic: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

🚨 URGENT ISSUE DETECTED — prioritize speed and clarity.
CONFIDENCE: ${confidenceNote(answerMode)}

FORMAT — be direct and fast:
**IMMEDIATE ACTION:** What to do RIGHT NOW (1-2 steps)
**Root Cause:** Brief explanation
**Full Fix:** Numbered steps
**When to Escalate:** If steps don't resolve in X minutes, do Y

Rules:
1. Lead with the most likely fix — don't bury the answer
2. Use exact terminal labels and values from the knowledge base
3. If unknown: "${notFoundMsg}"
4. Write ENTIRELY in ${langName}
5. Max 300 words`,

  procedural: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

CONFIDENCE: ${confidenceNote(answerMode)}

FORMAT FOR HOW-TO / PROCEDURE QUESTIONS:
⚠️ Safety note first (if applicable)
Then numbered steps:
1. Step description
   - Terminal: TB1+ → [connect to]
   - Wire color: Red (positive), Black (negative)
   - Verify: LED D1 turns green ✅
2. Next step...

Rules:
1. Every step that touches wiring MUST include terminal labels and wire colors
2. Include a "Verify:" line after critical steps
3. If procedure not in knowledge base: "${notFoundMsg}"
4. Write ENTIRELY in ${langName}
5. Max 350 words`,

  factual: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

CONFIDENCE: ${confidenceNote(answerMode)}

FORMAT FOR SPECIFICATION / FACTUAL QUESTIONS:
Lead with a direct one-sentence answer, then:
- If 3+ values: use a specification table (Parameter | Value | Notes)
- Include applicable standards (IEC, EIA, IEEE) where relevant
- Highlight critical limits with ⚠️

Rules:
1. Be precise — exact values only, no approximations unless noted
2. If spec not in knowledge base: "${notFoundMsg}"
3. Write ENTIRELY in ${langName}
4. Max 250 words`,

  visual: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

CONFIDENCE: ${confidenceNote(answerMode)}

FORMAT FOR VISUAL / WIRING QUESTIONS:
Describe connections in text first:
TB1+ → [device] positive terminal (Red wire, 1.5mm²)
TB1- → [device] negative terminal (Black wire, 1.5mm²)

Then add this hint: "💡 Type: 'Show wiring diagram for [panel name]' to get a visual diagram"

Rules:
1. Always include terminal labels, wire colors, and wire gauge
2. Mention any termination resistors or shielding requirements
3. If wiring not in knowledge base: "${notFoundMsg}"
4. Write ENTIRELY in ${langName}
5. Max 300 words`,

  comparative: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

CONFIDENCE: ${confidenceNote(answerMode)}

FORMAT FOR COMPARISON QUESTIONS:
Use a comparison table:
| Feature | Option A | Option B |
|---------|----------|----------|
| ...     | ...      | ...      |

Then a 1-2 sentence recommendation: "For [use case], choose [X] because..."

Rules:
1. Only compare based on knowledge base data — no speculation
2. Highlight the ONE key difference that matters most
3. If comparison not in knowledge base: "${notFoundMsg}"
4. Write ENTIRELY in ${langName}
5. Max 300 words`,

  general_fallback: (langName, notFoundMsg, answerMode) => `${BASE_ROLE}

CONFIDENCE: ${confidenceNote(answerMode)}

Provide a helpful technical answer using your HMS domain expertise.
Be specific — give concrete values, steps, and procedures where applicable.
If the question is unrelated to HMS/industrial automation: politely say so.
For wiring questions: always mention "Show wiring diagram for [panel]"

Rules:
1. If specific data is available in knowledge base, use it
2. If not: "${notFoundMsg}"
3. Write ENTIRELY in ${langName}
4. Max 300 words`,
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
