# Codex Task: Fix Critical Bugs in HMS Tech Support Chatbot

## Project Context

This is a Next.js RAG chatbot for HMS industrial panel tech support. The main chat pipeline is at `src/app/api/chat/route.ts`. It uses Sarvam AI (sarvam-m model via LangChain's ChatOpenAI), Supabase for storage, Upstash Redis for caching, and a multi-vector retrieval engine.

You MUST read each file fully before editing it. Do NOT add comments explaining your changes. Do NOT add new dependencies. Do NOT refactor code beyond what each fix requires.

---

## Fix 1 — Confidence weights overflow (HIGH)

**File:** `src/lib/retrievalOptimizer.ts`
**Function:** `deriveConfidence` (around line 145)

**Problem:** The weight coefficients on `ragResult.confidence`, `top`, `averageTop`, and `averageCoverage` sum to 1.55 (0.55 + 0.65 + 0.18 + 0.17), plus up to 0.08 support bonus. With good matches, the raw value exceeds 1.0 before clamping, destroying discrimination between `rag_high` and `rag_medium`.

**Fix:** Replace the weight values so they sum to approximately 1.0:
- `ragResult.confidence * 0.30` (was 0.55)
- `top * 0.35` (was 0.65)
- `averageTop * 0.15` (was 0.18)
- `averageCoverage * 0.15` (was 0.17)
- `supportBonus` max: change `0.08` to `0.05` in the supportBonus calculation

Do NOT change the `clamp`, `ambiguityPenalty`, or any other logic. Only change the 5 numeric coefficients.

---

## Fix 2 — Remove dead code: duplicate empty-answer persistence (HIGH)

**File:** `src/app/api/chat/route.ts`
**Lines:** approximately 797-815

**Problem:** There is a block starting with `if (authUserId && activeConversationId && answer.length === 0)` that saves an assistant message and creates an `authSupabase` client. This block is dead code because:
1. `persistAssistantMessage` at line ~788 already saved the assistant message
2. The condition `answer.length === 0` means it only fires for empty answers, which are already handled

**Fix:** Delete the entire `if (authUserId && activeConversationId && answer.length === 0) { ... }` block (the try/catch inside it too). Do NOT touch `persistAssistantMessage` or anything else.

---

## Fix 3 — Low-confidence answers get cached permanently (HIGH)

**File:** `src/app/api/chat/route.ts`
**Lines:** around 779-786 (the `storeCache` call)

**Problem:** The `storeCache` call uses `dbAnswerMode` which strips `rag_partial` → `rag`. The cache's `storeCache` function skips storing when `answerMode === 'general'` but `'rag'` passes through, so partial/low-confidence answers get cached.

**Fix:** Change the `storeCache` call to use the original `answerMode` variable (not `dbAnswerMode`):
```typescript
void storeCache({
    query: retrievalQuestion,
    queryVector: cachedQueryEmbedding,
    answer,
    answerMode,  // was: dbAnswerMode
    language,
});
```

Also, in `src/lib/cache.ts` function `storeCache`, add a check to skip caching for `rag_partial`:
```typescript
if (answerMode === 'general' || answerMode === 'rag_partial') return;
```

---

## Fix 4 — `isEnglish` broken for mixed-script input (HIGH)

**File:** `src/app/api/chat/route.ts`
**Function:** `isEnglish` (around line 40-44)

**Problem:** The `total` calculation uses `[\s\d\W]` which removes Unicode letters (Bengali, Hindi), making the ratio meaningless for mixed-script text. A Bengali sentence with a few English tech terms gets classified as English.

**Fix:** Replace the function body with:
```typescript
function isEnglish(text: string): boolean {
    const asciiLetters = (text.match(/[a-zA-Z]/g) || []).length;
    const allLetters = (text.match(/\p{L}/gu) || []).length || 1;
    return (asciiLetters / allLetters) > 0.6;
}
```

---

## Fix 5 — Response formatter mangles LLM structured output (MEDIUM)

**File:** `src/lib/responseFormatter.ts`
**Function:** `hasStructuredSections` (around line 41-43)

**Problem:** The LLM is instructed to produce `**Answer**`, `**Root Cause**`, `**Connection Summary**`, etc. But `hasStructuredSections` only checks for "short answer" + "explanation"/"steps", so the LLM's output gets re-structured by `formatResponse`.

**Fix:** Replace the function with:
```typescript
function hasStructuredSections(text: string): boolean {
    const headerPattern = /\*\*(?:Answer|Root Cause|Immediate Action|Connection Summary|Comparison|Short Answer|Steps|Explanation|Technical Detail|Full Resolution|Wiring Notes|Key Difference|Recommendation|Specifications|Context|Next Step|Verify|Escalation Threshold)\*\*/i;
    const matches = text.match(new RegExp(headerPattern.source, 'gi'));
    return (matches?.length ?? 0) >= 2;
}
```

---

## Fix 6 — Casual intent captures technical follow-ups (MEDIUM)

**File:** `src/lib/intentClassifier.ts`
**Function:** `classifyIntent` (around line 89-100)

**Problem:** Queries like "ok so how do I wire TB1?" match the casual acknowledgement pattern and return a canned response instead of going through the RAG pipeline.

**Fix:** After the casual subtype is detected (around line 93), add a gate that checks if the remaining text after the casual prefix contains technical content. Replace the `if (casualSubtype)` block:

```typescript
if (casualSubtype) {
    const casualPattern = CASUAL_PATTERNS.find((c) => c.pattern.test(normalized));
    const remainder = casualPattern
        ? normalized.replace(casualPattern.pattern, '').trim()
        : '';

    const hasTechnicalContent = remainder.length > 15
        && (TROUBLESHOOTING_PATTERNS.some((p) => p.test(remainder))
            || ACTION_PATTERNS.some((p) => p.test(remainder))
            || INFORMATIONAL_PATTERNS.some((p) => p.test(remainder)));

    if (!hasTechnicalContent) {
        return {
            intent: 'casual',
            confidence: 0.96,
            reason: `Matched casual pattern: ${casualSubtype}`,
            responseStyle: responseStyleFor('casual'),
        };
    }
    // Fall through to technical classification
}
```

---

## Fix 7 — HYDE silently ignored in hybrid search path (MEDIUM)

**File:** `src/lib/rag-engine.ts`
**Function:** `enhancedRetrieve` (around line 622)

**Problem:** The `useHYDE` option is accepted but never used. The standard retrieval path generates a HYDE vector and embeds it, but the enhanced path skips it entirely.

**Fix:** Add a log line at the top of `enhancedRetrieve` after the existing console.log, to make the skip explicit:

```typescript
if (options.useHYDE) {
    console.log(`  HYDE: skipped (not implemented in hybrid search path)`);
}
```

This is a documentation fix only. Full HYDE integration into hybrid search is a separate task — do NOT attempt it here.

---

## Fix 8 — Race condition in conversation history recovery (MEDIUM)

**File:** `src/app/api/chat/route.ts`
**Lines:** around 373-379 (the `recoveryInsertError` block)

**Problem:** Two concurrent requests for the same conversation with empty `messages` table both read `chat_sessions`, both try to insert recovered history, causing duplicate rows.

**Fix:** Change the insert to upsert with `ignoreDuplicates`. Replace:
```typescript
const { error: recoveryInsertError } = await authSupabase
    .from('messages')
    .insert(rowsToInsert);
```
With:
```typescript
const { error: recoveryInsertError } = await authSupabase
    .from('messages')
    .upsert(rowsToInsert, { onConflict: 'conversation_id,role,created_at', ignoreDuplicates: true });
```

Note: This requires that the `messages` table has a unique constraint on `(conversation_id, role, created_at)`. If the constraint doesn't exist, use insert with a guard instead:
```typescript
const { count } = await authSupabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', activeConversationId);

if (count === 0 || count === null) {
    const { error: recoveryInsertError } = await authSupabase
        .from('messages')
        .insert(rowsToInsert);
    if (recoveryInsertError) {
        console.warn('Recovered history persistence failed:', recoveryInsertError.message);
    }
}
```

Use the second approach (count guard) — it's safer without knowing the DB schema.

---

## Fix 9 — Double embedding wastes ~100ms per request (MEDIUM)

**File:** `src/app/api/chat/route.ts`
**Lines:** around 508 and 564-569

**Problem:** `embedText(retrievalQuestion)` is called at line 508 for Tier 2 cache. Then `retrieve()` internally calls `embedText(query)` again at `rag-engine.ts:833`.

**Fix in route.ts:** Pass the pre-computed embedding. In the `retrieve` and `retrieveOptions`, this requires updating the retrieve function signature.

**Fix in rag-engine.ts:** Add `precomputedQueryVector?: number[]` to the `options` parameter of the `retrieve` function. Then inside `retrieve`, replace the `embedText(query)` call:

In the `retrieve` function options type (around line 761), add:
```typescript
precomputedQueryVector?: number[];
```

In the `Promise.all` block (around line 833), change:
```typescript
embedText(query),
```
to:
```typescript
options.precomputedQueryVector ? Promise.resolve(options.precomputedQueryVector) : embedText(query),
```

Then in `route.ts`, pass it when calling retrieve (around line 564 and 569):
```typescript
await retrieve(retrievalQuestion, sarvamLlm, { ...retrieveOptions, precomputedQueryVector: cachedQueryEmbedding })
```

Apply to both the decomposed path (line 564) and the direct path (line 569).

---

## Fix 10 — Diagram error exposes internal details to users (MEDIUM)

**File:** `src/app/api/chat/route.ts`
**Lines:** around 670-680 (diagram fallback error payload)

**Problem:** `(err as Error).message` is sent directly to the user, potentially exposing API URLs, keys, or internal paths.

**Fix:** Replace the error message in the fallback payload:
```typescript
markdown: `## Diagram Generation Error\n\nUnable to generate ${diagramType} diagram at this time.\n\nPlease try again or contact technical support if the issue persists.`,
```

Remove the `**Error:** ${(err as Error).message}` line entirely. Keep logging the actual error to console (which already happens at line 668).

---

## Fix 11 — Fire-and-forget DB writes with no error logging (LOW)

**File:** `src/app/api/chat/route.ts`

**Problem:** `void supabase.from('chat_sessions').insert(...)` at lines ~622, ~656, ~769 silently swallow errors.

**Fix:** For each `void supabase.from('chat_sessions').insert({...})` call (there are 3), append `.then(({ error }) => { if (error) console.warn('chat_sessions insert failed:', error.message); })`.

Example — find each occurrence and change from:
```typescript
void supabase.from('chat_sessions').insert({ ... });
```
to:
```typescript
void supabase.from('chat_sessions').insert({ ... })
    .then(({ error }) => { if (error) console.warn('chat_sessions insert failed:', error.message); });
```

---

## Fix 12 — Sequential knowledge access logging (LOW)

**File:** `src/lib/rag-engine.ts`
**Lines:** around 971-974

**Problem:** Three sequential `await supabase.rpc('record_knowledge_access')` calls add ~60-150ms.

**Fix:** Replace:
```typescript
for (const match of reranked.slice(0, 3)) {
    try {
        await supabase.rpc('record_knowledge_access', { p_id: match.id });
    } catch { /* ignore individual access logging failures */ }
}
```
With:
```typescript
await Promise.all(
    reranked.slice(0, 3).map((match) =>
        supabase.rpc('record_knowledge_access', { p_id: match.id }).catch(() => {})
    )
);
```

---

## Execution Order

Apply fixes in this order (dependencies matter):
1. Fix 4 (isEnglish) — standalone, no dependencies
2. Fix 1 (confidence weights) — standalone
3. Fix 5 (response formatter) — standalone
4. Fix 6 (casual intent) — standalone
5. Fix 7 (HYDE log) — standalone
6. Fix 12 (parallel access logging) — standalone
7. Fix 3 (cache gating) — touches both cache.ts and route.ts
8. Fix 9 (double embedding) — touches both rag-engine.ts and route.ts
9. Fix 2 (dead code removal) — route.ts
10. Fix 8 (race condition) — route.ts
11. Fix 10 (error exposure) — route.ts
12. Fix 11 (fire-and-forget logging) — route.ts, do last since it touches multiple lines

## Verification

After all fixes, run:
```bash
npx tsc --noEmit
```
to verify no type errors were introduced. Do NOT run tests or dev server.
