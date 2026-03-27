# Codex Execution Plan: 5 Medium-Priority Fixes

**Date:** 2026-03-27
**Priority:** P1 — Production Hardening
**Source:** Full System Audit (Claude Code, 4-agent parallel audit)
**Previous Plan:** 3 critical security fixes (COMPLETED + VALIDATED)

---

## Overview

| # | Fix | File(s) | Risk | Lines Changed |
|---|-----|---------|------|---------------|
| 1 | Analytics `Promise.allSettled` | `src/app/api/admin/analytics/route.ts` | Low | ~30 |
| 2 | `server-only` guard on `supabase.ts` | `src/lib/supabase.ts` + `package.json` | Low | ~3 |
| 3 | Request ID in response headers | `src/app/api/chat/route.ts` | Low | ~15 |
| 4 | Rate limiter memory cap | `src/lib/rate-limiter.ts` | Low | ~10 |
| 5 | Confidence threshold alignment | `src/lib/confidence.ts` | Low | ~2 |

**NOTE:** "Missing DB indexes" (original issue #5) is **ALREADY DONE** in migration 027. Skipped.

**Total:** 5 files edited, 1 package installed, ~60 lines changed

---

## Fix 1: Analytics Promise.allSettled

### Problem
`src/app/api/admin/analytics/route.ts` line 40 uses `Promise.all()` for 16 parallel Supabase queries. If ANY single query fails (e.g., a table doesn't exist yet, or a transient network error), the entire analytics endpoint crashes with a 500 error. Admin dashboard becomes unusable.

### Solution
Replace `Promise.all` with `Promise.allSettled` and extract values safely. Treat rejected promises as empty results instead of crashing.

### File: `src/app/api/admin/analytics/route.ts`

### Step-by-step changes:

**A) Replace the destructuring + Promise.all block (lines 16–76)**

Remove the entire destructured `const [legacyTotalRes, ...] = await Promise.all([...]);` block.

Replace with:

```typescript
        const results = await Promise.allSettled([
            // Legacy
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'rag'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('answer_mode', 'diagram'),
            supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).in('answer_mode', ['general', 'partial', 'live']),
            supabase
                .from('chat_sessions')
                .select('user_question, answer_mode, top_similarity, created_at')
                .order('created_at', { ascending: false })
                .limit(10),
            // New conversation system
            supabase.from('conversations').select('*', { count: 'exact', head: true }),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'user'),
            // New system answer mode counts (from messages table)
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').eq('answer_mode', 'rag'),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').in('answer_mode', ['general', 'partial', 'live']),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('role', 'assistant').in('answer_mode', ['diagram', 'diagram_stored']),
            // Shared
            supabase.from('unknown_questions').select('*', { count: 'exact', head: true }),
            supabase.from('unknown_questions').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('unknown_questions').select('*', { count: 'exact', head: true }).eq('status', 'reviewed'),
            supabase
                .from('unknown_questions')
                .select('english_text, user_question, frequency, top_similarity')
                .eq('status', 'pending')
                .order('frequency', { ascending: false })
                .limit(10),
            supabase.from('hms_knowledge').select('source, source_name'),
            // Feedback from retrieval_feedback table (same source as FeedbackTab)
            supabase.from('retrieval_feedback').select('id, rating, is_relevant'),
            // Token usage summary
            supabase.from('token_usage').select('tokens_used, request_count').gte(
                'period_start',
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
            ),
        ]);

        // Safe unwrap — rejected promises become null with a warning log
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function unwrap(r: PromiseSettledResult<any>, label: string): any {
            if (r.status === 'fulfilled') return r.value;
            console.warn(`[admin.analytics] ${label} query failed:`, r.reason);
            return null;
        }

        const legacyTotalRes    = unwrap(results[0], 'legacyTotal');
        const legacyRagRes      = unwrap(results[1], 'legacyRag');
        const legacyDiagramRes  = unwrap(results[2], 'legacyDiagram');
        const legacyFallbackRes = unwrap(results[3], 'legacyFallback');
        const legacyRecentRes   = unwrap(results[4], 'legacyRecent');
        const convTotalRes      = unwrap(results[5], 'convTotal');
        const messageTotalRes   = unwrap(results[6], 'messageTotal');
        const msgRagRes         = unwrap(results[7], 'msgRag');
        const msgFallbackRes    = unwrap(results[8], 'msgFallback');
        const msgDiagramRes     = unwrap(results[9], 'msgDiagram');
        const totalUnknownRes   = unwrap(results[10], 'totalUnknown');
        const pendingUnknownRes = unwrap(results[11], 'pendingUnknown');
        const reviewedUnknownRes = unwrap(results[12], 'reviewedUnknown');
        const topUnknownRes     = unwrap(results[13], 'topUnknown');
        const kbCompositionRes  = unwrap(results[14], 'kbComposition');
        const feedbackStatsRes  = unwrap(results[15], 'feedbackStats');
        const tokenStatsRes     = unwrap(results[16], 'tokenStats');
```

**B) Replace the critical errors block (lines 79–86)**

Remove:
```typescript
        const criticalErrors = [
            totalUnknownRes.error,
            kbCompositionRes.error,
        ].filter(Boolean);

        if (criticalErrors.length > 0) {
            throw new Error(criticalErrors.map((error) => error?.message).join('; '));
        }
```

Replace with:
```typescript
        // Log Supabase-level errors from fulfilled results (not rejections — those are already logged by unwrap)
        const criticalErrors = [
            totalUnknownRes?.error,
            kbCompositionRes?.error,
        ].filter(Boolean);

        if (criticalErrors.length > 0) {
            console.error('[admin.analytics] critical query errors:', criticalErrors.map(e => e?.message));
        }
```

**IMPORTANT:** Do NOT `throw` here. The whole point is partial results, not crashes.

**C) Add null-safe access (`?.`) to all downstream references**

Every reference to the unwrapped results needs `?.` since they can now be `null`. Update these patterns:

```
legacyTotalRes.count    →  legacyTotalRes?.count
legacyRagRes.count      →  legacyRagRes?.count
legacyDiagramRes.count  →  legacyDiagramRes?.count
legacyFallbackRes.count →  legacyFallbackRes?.count
legacyRecentRes.data    →  legacyRecentRes?.data
convTotalRes.count      →  convTotalRes?.count
messageTotalRes.count   →  messageTotalRes?.count
msgRagRes.count         →  msgRagRes?.count
msgFallbackRes.count    →  msgFallbackRes?.count
msgDiagramRes.count     →  msgDiagramRes?.count
totalUnknownRes.count   →  totalUnknownRes?.count
pendingUnknownRes.count →  pendingUnknownRes?.count
reviewedUnknownRes.count→  reviewedUnknownRes?.count
topUnknownRes.data      →  topUnknownRes?.data
kbCompositionRes.data   →  kbCompositionRes?.data
feedbackStatsRes.data   →  feedbackStatsRes?.data
tokenStatsRes.data      →  tokenStatsRes?.data
```

The `?? 0`, `|| []` fallbacks already exist on most of these — just add the `?.` before them.

### Verification
- `npx tsc --noEmit` passes
- Analytics endpoint returns partial data when individual queries fail

---

## Fix 2: `server-only` Guard on supabase.ts

### Problem
`src/lib/supabase.ts` exports `getSupabase()` which uses `SUPABASE_SERVICE_ROLE_KEY`. If accidentally imported from a client component, this secret leaks to the browser bundle. No build-time guard exists.

### Step 1: Install package
```bash
npm install server-only
```

### Step 2: Edit `src/lib/supabase.ts`

Add as the VERY FIRST LINE (before all other imports):
```typescript
import 'server-only';
```

The file should start:
```typescript
import 'server-only';
import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
```

### Rules
- Do NOT modify anything else in this file
- Do NOT touch the custom DNS resolver, IPv4 settings, customFetch, or singleton pattern
- `import 'server-only'` must be the first import

### Verification
- `npx tsc --noEmit` passes
- `server-only` appears in `package.json` dependencies

---

## Fix 3: Request ID in Response Headers

### Problem
`src/app/api/chat/route.ts` generates `requestId` at line 535 and logs it internally, but never returns it in the HTTP response. Production debugging requires correlating client requests with server logs, which is impossible without this header.

### Solution
Add `'x-request-id': requestId` to the `extraHeaders` at every `buildChatResponse()` call site inside the POST handler.

### File: `src/app/api/chat/route.ts`

### How to find call sites
Search for `buildChatResponse(` inside the `export async function POST` function. There are approximately 7 call sites.

### For calls with existing extraHeaders object
Add `'x-request-id': requestId` to the object:
```typescript
// BEFORE:
return buildChatResponse(answer, activeConversationId, rateLimitResult, {
    'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
});

// AFTER:
return buildChatResponse(answer, activeConversationId, rateLimitResult, {
    'x-request-id': requestId,
    'x-pipeline-latency': `${(performance.now() - requestStart).toFixed(0)}ms`,
});
```

### For calls WITHOUT extraHeaders (only 3 arguments)
Add a 4th argument:
```typescript
// BEFORE:
return buildChatResponse(casualAnswer, activeConversationId, rateLimitResult);

// AFTER:
return buildChatResponse(casualAnswer, activeConversationId, rateLimitResult, {
    'x-request-id': requestId,
});
```

### ALL call sites to update (approximate line numbers — search to confirm):
1. ~line 820 — casual/chitchat answer
2. ~line 884 — tier1 exact cache hit (already has extraHeaders with `x-cache`)
3. ~line 912 — relational answer
4. ~line 973 — tier2 semantic cache hit from DB (already has extraHeaders)
5. ~line 1035 — tier2 semantic cache hit from local (already has extraHeaders)
6. ~line 1398 — hallucination gate NOT_FOUND return
7. ~line 1590 — main RAG answer final return (already has extraHeaders)

**Update ALL 7.** Do not miss any.

### Error catch blocks
Also search for `NextResponse.json(` inside the POST handler's catch blocks. Add the header:
```typescript
// BEFORE:
return NextResponse.json({ error: '...' }, { status: 500 });

// AFTER:
return NextResponse.json(
    { error: '...' },
    { status: 500, headers: { 'x-request-id': requestId } },
);
```

### Rules
- Do NOT rename `requestId` or change how it's generated
- Do NOT add `requestId` as a new parameter to `buildChatResponse()`
- Do NOT modify any logic — only add the header to existing call sites
- Use the `extraHeaders` pattern (4th argument) which already exists

### Verification
- `npx tsc --noEmit` passes
- Every `buildChatResponse()` call includes `'x-request-id': requestId`

---

## Fix 4: Rate Limiter Memory Cap

### Problem
`src/lib/rate-limiter.ts` line 61: `memoryStore` is an unbounded `Map`. Under DDoS or scraping with unique IPs, entries accumulate without limit. The cleanup interval (every 5 min) removes stale entries but doesn't cap total size, risking OOM.

### Solution
Add a `MAX_MEMORY_ENTRIES` constant. When the map is full and a new key is needed, evict the oldest 10% (Map preserves insertion order in JS).

### File: `src/lib/rate-limiter.ts`

### Add constant after line 61

After:
```typescript
const memoryStore = new Map<string, WindowEntry>();
```

Add:
```typescript
const MAX_MEMORY_ENTRIES = 10_000;
```

### Edit `checkMemoryRateLimit` — replace lines 95–99

Current:
```typescript
    let entry = memoryStore.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        memoryStore.set(key, entry);
    }
```

Replace with:
```typescript
    let entry = memoryStore.get(key);
    if (!entry) {
        if (memoryStore.size >= MAX_MEMORY_ENTRIES) {
            // Evict oldest 10% — Map iteration is insertion-order
            const deleteCount = Math.floor(MAX_MEMORY_ENTRIES * 0.1);
            const iter = memoryStore.keys();
            for (let i = 0; i < deleteCount; i++) {
                const oldest = iter.next();
                if (oldest.done) break;
                memoryStore.delete(oldest.value);
            }
        }
        entry = { timestamps: [] };
        memoryStore.set(key, entry);
    }
```

### Rules
- Do NOT change the cleanup interval logic (lines 66–82)
- Do NOT change the Redis rate limiter
- Do NOT change exports or function signatures
- Do NOT add logging to the eviction (it's a hot path)

### Verification
- `npx tsc --noEmit` passes
- Map can never exceed ~10,000 entries

---

## Fix 5: Confidence Threshold Alignment

### Problem
Two different thresholds define the "unknown/general" boundary:
- `src/app/api/chat/route.ts` line 44: `UNKNOWN_THRESHOLD = 0.45`
- `src/lib/confidence.ts` line 27: `score >= 0.4` → `rag_partial`

Queries with confidence 0.40–0.44 get `answerMode = 'rag_partial'` but are ALSO logged as unknown questions. The CLAUDE.md canonical threshold is 0.45.

### Solution
Change `confidence.ts` line 27 from `0.4` to `0.45`.

### File: `src/lib/confidence.ts`

### Edit line 27

**Before:**
```typescript
    if (score >= 0.4) {
```

**After:**
```typescript
    if (score >= 0.45) {
```

### Rules
- Do NOT change `UNKNOWN_THRESHOLD` in `chat/route.ts` — it is already correct
- Do NOT change other thresholds (0.75, 0.58) in this file
- Do NOT touch `scoreConfidence()` or any other function

### Verification
- `npx tsc --noEmit` passes
- `answerModeFromConfidence(0.42)` now returns `'general'` (was `'rag_partial'`)
- `answerModeFromConfidence(0.45)` returns `'rag_partial'` (unchanged)

---

## Execution Order

Run in this order (independent but ordered by risk):

1. **Fix 5** — confidence threshold (1 line, zero risk)
2. **Fix 4** — rate limiter memory cap (isolated module)
3. **Fix 2** — server-only guard (`npm install` first, then 1 line)
4. **Fix 3** — request ID headers (multiple call sites, needs care)
5. **Fix 1** — Promise.allSettled (largest change)

Run `npx tsc --noEmit` after EACH fix.

---

## Final Verification Checklist

After ALL fixes:

```bash
# 1. TypeScript compilation
npx tsc --noEmit
# Expected: 0 errors

# 2. Lint
npm run lint
# Expected: 0 new errors

# 3. Smoke tests
npm run test:smoke
# Expected: all pass

# 4. Verify server-only installed
grep "server-only" package.json
# Expected: appears in dependencies
```

---

## Commit Message

```
fix: address 5 medium-priority production audit issues

- analytics: Promise.allSettled for partial failure resilience
- supabase: server-only guard prevents client-side import of service key
- chat: x-request-id response header for production log correlation
- rate-limiter: cap in-memory store at 10k entries to prevent OOM
- confidence: align rag_partial threshold to 0.45 (matches UNKNOWN_THRESHOLD)
```

---

## Rules for Codex

1. **Do NOT create new files** — all changes are edits to existing files
2. **Do NOT modify** any file not listed in this plan
3. **Do NOT change** the DNS resolver, IPv4 settings, or custom fetch in `supabase.ts`
4. **Do NOT touch** migration files or database schema
5. **Do NOT refactor** surrounding code — only make the exact changes specified
6. **Do NOT add comments** to code you didn't change
7. **Preserve** all existing imports, exports, and function signatures
8. Run `npx tsc --noEmit` after EACH fix to catch issues early
9. The `server-only` package is the ONLY new dependency — do not install anything else
