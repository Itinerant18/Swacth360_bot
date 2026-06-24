# Plan — Conditional Reasoning for Complex Domain Questions

> Goal: Bot reasons (`<think>` chain-of-thought over chunks) **only** for complex,
> on-domain HMS questions. Simple factual lookups stay fast and reasoning-free.

---

## 1. Problem with current state

Reasoning is **always on**. Two unconditional spots order `<think>`:
- `src/lib/llm.ts` → `SYSTEM_PROMPT` "REASONING PROCESS" block (always injected, `pipeline.ts:508`)
- `src/lib/router.ts` → `BASE_ROLE` "REASONING (required)" (always injected via routed prompt)

Plus `pipeline.ts:1132` adds `+600` token headroom for **every** query.

Consequences:
- A 4-word factual lookup ("what is baud rate") burns reasoning tokens + latency. Blows the `<3s` target on trivial queries.
- Reasoning panel shows on questions that don't need it → noise.

## 2. Target behavior

| Query | Reason? | Why |
|---|---|---|
| "What is the default baud rate?" (factual, 5 words) | ❌ no | atomic fact, direct lookup |
| "E001 keeps coming back after I reset, supply looks fine" (diagnostic, multi-clause) | ✅ yes | needs chunk synthesis + conflict resolution |
| "Difference between Anybus X-gateway and HMS-200 for PROFIBUS" (comparative) | ✅ yes | must weigh two sides |
| "system down right now" (urgent) | ✅ yes | high-stakes, reason before acting |
| "hi" / casual | ❌ no | already short-circuited pre-LLM |

## 3. Gate logic (reuses existing signals — no new classifier)

New pure helper `shouldReason(...)` in `src/lib/router.ts` (next to `shouldUseVerificationPass` precedent):

```ts
export function shouldReason(params: {
  complexity: 'simple' | 'medium' | 'complex';
  type: QueryType;              // baseAnalysis.type
  isDecomposed: boolean;        // decomposition result
  confidence: number;           // retrieval confidence
}): boolean {
  const { complexity, type, isDecomposed, confidence } = params;
  // Off-domain / no grounding → don't reason aloud, fall through to NOT_FOUND.
  if (confidence < 0.30) return false;
  // Routes that inherently benefit from step reasoning.
  if (type === 'diagnostic' || type === 'urgent_diagnostic' || type === 'comparative') return true;
  // Multi-part questions the decomposer split.
  if (isDecomposed) return true;
  // Otherwise only the genuinely complex ones.
  return complexity === 'complex';
}
```

Rationale:
- `diagnostic / urgent / comparative` → always reason (domain-complex by nature).
- `factual / visual / procedural-simple` → reason only if `complexity === 'complex'` or decomposed.
- `confidence < 0.30` → skip (off-domain or no chunks; NOT_FOUND path handles it).

> Tuning knob: thresholds (`0.30`) and the route set are the calibration points.
> Start here, adjust from `rag_evals` after a day of traffic.

## 4. Mechanism — make the `<think>` instruction conditional

Reasoning order must move OUT of the two always-on prompts INTO a toggled block.

### 4a. `src/lib/llm.ts`
- Split `SYSTEM_PROMPT`: keep language + core rules always; **extract** the
  "REASONING PROCESS" lines into an exported `REASONING_INSTRUCTION` constant.

### 4b. `src/lib/router.ts`
- `BASE_ROLE`: drop the "REASONING (required)" block. Keep the FINAL ANSWER RULES
  but reword so they apply whether or not a `<think>` block precedes them
  (e.g. "If you reason in `<think>` tags, the first word after `</think>`…; otherwise
  your first word…").

### 4c. `src/lib/pipeline.ts`
- Compute `const reasoningOn = shouldReason({complexity, type, isDecomposed, confidence})`
  at the `buildFinalSystemPrompt` call site (~line 1088, all inputs already in scope).
- Pass `reasoningOn` into `buildFinalSystemPrompt`; append `REASONING_INSTRUCTION`
  only when true.
- Token budget: `llmMaxTokens: route.maxTokens + (reasoningOn ? 600 : 0)`
  (replaces the unconditional `+600` from the prior change).
- Thread `reasoningOn` onto the returned `PipelineResult` (for logging/metrics).

## 5. No change needed (verified)

- **Frontend** `MessageBubble.tsx` — `parseThinkingAndResponse` returns
  `isThinking:false, thought:''` when no `<think>` tag → renders plain answer, no
  empty panel. Handles both modes already.
- **Cache / persist** — stores raw answer; reasoning-off answers store clean, no tag.
- **responseFormatter / verification pass** — already no-op when no `<think>` present.

## 6. Edge cases

- Streaming mid-`<think>` (closing tag not yet arrived) → already handled
  (`responseFormatter.ts:162-165`, `MessageBubble.tsx:56-60`).
- Reasoning-off route should NOT leak `<think>` — verified by gate test below.
- `rag-evaluator` receives the `<think>` block (`route.ts:634`) — pre-existing skew.
  **IN SCOPE (decided):** strip `<think>` before eval so scores reflect only the
  final answer. Reuse `responseFormatter`'s tag-split or a 1-line slice on `answer`
  before `evaluateAndStore` in `finalizeAnswer`.

## 7. Verification

1. `npx tsc --noEmit` — clean.
2. Live gate test (scratchpad tsx, like this session's `reasoning-check`): run 4
   sample queries (factual-simple, diagnostic, comparative, casual) through
   `classifyQuery` + `shouldReason`; assert reason on/off matches the table in §2.
3. One live LLM call per mode: complex → response contains `<think>`; simple →
   response contains NO `<think>`.
4. `npm run dev`, eyeball: simple Q = no panel + fast; complex Q = panel streams.

## 8. Rollback

Single revert: `shouldReason` returns `true` always → restores current always-on
behavior. No schema/migration, no frontend change, fully reversible.

## 9. Files touched

| File | Change | Lines (approx) |
|---|---|---|
| `src/lib/router.ts` | add `shouldReason`; reword `BASE_ROLE` | +12 / ~6 edited |
| `src/lib/llm.ts` | extract `REASONING_INSTRUCTION` | ~8 edited |
| `src/lib/pipeline.ts` | gate compute + conditional inject + token budget | ~6 edited |
| `src/app/api/chat/route.ts` | strip `<think>` before `evaluateAndStore` | ~2 edited |

~4 files, no new deps, no migration. Est. effort: small.

---

## Decisions (locked)

- **Gate breadth:** diagnostic + urgent + comparative + decomposed + `complexity==='complex'`. Factual/visual/simple stay fast.
- **Eval:** strip `<think>` before scoring.
