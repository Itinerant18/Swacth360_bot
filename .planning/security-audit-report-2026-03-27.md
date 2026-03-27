# Security Audit Report

**Project:** `Swacth360_bot` / `tech-support-ai`  
**Repository Path:** `C:\workspace\tech-support-ai`  
**Audit Date:** 2026-03-27  
**Prepared By:** Codex  
**Audit Type:** Targeted production-blocker security audit and remediation report

---

## 1. Executive Summary

This audit focused on three production-blocking security issues in the chatbot system:

1. Admin API routes were publicly accessible with no authentication or authorization enforcement.
2. The chat pipeline could still generate answers in low-confidence `general` mode with negligible retrieval context, creating a hallucination risk.
3. Prompt-injection filtering was weak, easy to bypass, and not applied to the retrieval query before it entered the RAG and LLM pipeline.

All three issues were remediated in the current working tree.

### Overall Status

| Area | Severity Before | Status After | Result |
|---|---|---|---|
| Admin API access control | Critical | Fixed | Route-level admin guard added to all targeted admin handlers |
| Hallucination control in `general` mode | Critical | Fixed | Hard not-found gate added before prompt construction |
| Prompt injection defense | Critical | Fixed | Sanitizer replaced and applied to retrieval query plus history |

---

## 2. Scope

The audit covered:

- `src/app/api/admin/*` route handlers
- `src/app/api/chat/route.ts`
- `src/lib/sanitize.ts`
- server-side authentication support for admin endpoints

This report documents only the security items addressed in the execution plan. It does not claim full application-wide penetration coverage.

---

## 3. Methodology

The audit and remediation work used:

- Static source inspection of route handlers and prompt-building flow
- Verification of existing auth infrastructure before reuse
- Minimal-change remediation aligned with current architecture
- TypeScript validation
- ESLint validation on all touched files

No new npm dependencies were introduced. No middleware-wide auth changes were made.

---

## 4. Findings and Remediation

### Finding 1: Admin API Endpoints Had No Authentication

**Severity:** Critical  
**Impact:** Any unauthenticated or unauthorized caller could reach admin routes and perform privileged operations, including:

- ingestion and knowledge-base poisoning
- feedback manipulation
- graph mutation
- RAPTOR rebuild triggering
- RAG settings changes
- analytics and failure data access

**Root Cause**

Admin routes existed under `/api/admin/*`, but there was no reusable server-side admin guard and no route-level checks at the top of handlers.

**Fix Implemented**

A reusable admin authorization guard was added:

- `src/lib/admin-auth.ts`

This guard:

- uses `createServerSupabaseClient()` from `src/lib/auth-server.ts`
- reads `ALLOWED_ADMIN_EMAILS`
- falls back to `aniket.karmakar@seple.in`
- returns:
  - `401` when authentication is missing or invalid
  - `403` when the user is authenticated but not an allowed admin

**Routes Protected**

The guard was added as the first logic inside all targeted admin handlers:

- `src/app/api/admin/analytics/route.ts`
- `src/app/api/admin/failures/route.ts`
- `src/app/api/admin/feedback/route.ts`
- `src/app/api/admin/graph/route.ts`
- `src/app/api/admin/ingest/route.ts`
- `src/app/api/admin/metrics/route.ts`
- `src/app/api/admin/performance/route.ts`
- `src/app/api/admin/questions/route.ts`
- `src/app/api/admin/rag-settings/route.ts`
- `src/app/api/admin/raptor/route.ts`
- `src/app/api/admin/seed-answer/route.ts`
- `src/app/api/admin/seed-diagram/route.ts`

**Security Outcome**

All audited admin handlers are now explicitly protected at the route level before any business logic executes.

---

### Finding 2: No Hard Hallucination Gate in `general` Mode

**Severity:** Critical  
**Impact:** When retrieval confidence was low and context was empty or negligible, the chat route could still proceed to prompt construction and LLM generation. This created a direct risk of fabricated product/support answers.

**Root Cause**

The route relied on prompt instructions telling the LLM not to guess, but there was no code-level enforcement to stop the model from answering when meaningful context was absent.

**Fix Implemented**

In:

- `src/app/api/chat/route.ts`

A hard gate was inserted:

- after unknown-question upsert logging
- before `selectRoute(...)`
- before any final system prompt is built

**Behavior**

If:

- `answerMode === 'general'`
- and `contextString` is empty or shorter than a meaningful threshold

then the route now:

- logs the hallucination gate trigger
- persists a `not_found` assistant response
- records a `chat_sessions` row with `answer_mode: 'not_found'`
- records a chat log entry with fallback metadata
- returns the localized not-found response immediately

**Security Outcome**

Low-confidence, low-context requests are now blocked from reaching final answer generation, sharply reducing unsupported or fabricated answers.

---

### Finding 3: Prompt Injection Filter Was Weak and Incompletely Applied

**Severity:** Critical  
**Impact:** The prior filter was easy to bypass using:

- synonyms and variant phrasing
- role-hijack instructions
- fake system tags
- zero-width Unicode characters
- prompt extraction attempts

It was also only applied to conversation history, not to the retrieval query that enters the pipeline.

**Root Cause**

The previous `sanitize.ts` used a very small regex set and did not include zero-width normalization or separate detection logic.

**Fix Implemented**

The sanitizer was fully replaced:

- `src/lib/sanitize.ts`

New behavior includes:

- zero-width character stripping
- expanded prompt-injection pattern set
- filtering of role hijack and system prompt extraction attempts
- `sanitizeInput(text)` for defensive rewriting
- `hasInjectionSignals(text)` for detection/logging

In:

- `src/app/api/chat/route.ts`

the retrieval query now:

- is checked with `hasInjectionSignals(...)`
- logs suspicious input with the client IP
- is sanitized before entering cache checks, embeddings, retrieval, and prompt construction

The existing history sanitization path remains in place.

**Security Outcome**

Prompt injection resistance is substantially improved and now covers both:

- memory/history context
- the retrieval question entering the main pipeline

---

## 5. Files Added and Modified

### New File

- `src/lib/admin-auth.ts`

### Modified Files

- `src/app/api/admin/analytics/route.ts`
- `src/app/api/admin/failures/route.ts`
- `src/app/api/admin/feedback/route.ts`
- `src/app/api/admin/graph/route.ts`
- `src/app/api/admin/ingest/route.ts`
- `src/app/api/admin/metrics/route.ts`
- `src/app/api/admin/performance/route.ts`
- `src/app/api/admin/questions/route.ts`
- `src/app/api/admin/rag-settings/route.ts`
- `src/app/api/admin/raptor/route.ts`
- `src/app/api/admin/seed-answer/route.ts`
- `src/app/api/admin/seed-diagram/route.ts`
- `src/app/api/chat/route.ts`
- `src/lib/sanitize.ts`

---

## 6. Validation Performed

### TypeScript

```bash
npx tsc --noEmit
```

**Result:** Passed

### ESLint

```bash
npx eslint src/lib/admin-auth.ts src/lib/sanitize.ts src/app/api/chat/route.ts src/app/api/admin/analytics/route.ts src/app/api/admin/failures/route.ts src/app/api/admin/feedback/route.ts src/app/api/admin/graph/route.ts src/app/api/admin/ingest/route.ts src/app/api/admin/metrics/route.ts src/app/api/admin/performance/route.ts src/app/api/admin/questions/route.ts src/app/api/admin/rag-settings/route.ts src/app/api/admin/raptor/route.ts src/app/api/admin/seed-answer/route.ts src/app/api/admin/seed-diagram/route.ts
```

**Result:** Passed

### Verification Sweep

Confirmed in source:

- `requireAdmin()` exists and uses `createServerSupabaseClient()`
- all targeted admin handlers now call `requireAdmin()` first
- `hasInjectionSignals` is exported and imported into the chat route
- retrieval query sanitization runs before pipeline usage
- hallucination gate is placed before `selectRoute(...)`
- history sanitization remains present

---

## 7. Residual Risks

The critical blockers addressed by this report are fixed, but some residual security and reliability risks remain:

### 7.1 Admin Authorization Is Email-Based

Current admin authorization depends on allowed email matching. This is acceptable for the present architecture, but stronger controls would include:

- Supabase role claims
- dedicated admin table with status flags
- signed role metadata checked server-side

### 7.2 Prompt Filtering Is Defense-in-Depth, Not a Complete Solution

Pattern-based sanitization reduces common attacks, but cannot replace:

- strict prompt role separation
- context grounding rules
- retrieval-only answer constraints
- post-generation validation where required

### 7.3 Route Protection Is Application-Level, Not Database-Level

The admin routes are now guarded, but if service-role access or direct database exposure is misconfigured elsewhere, route auth alone is not a full substitute for:

- stricter RLS posture where feasible
- principle-of-least-privilege secrets usage
- admin action auditing

### 7.4 No Automated Security Regression Tests Yet

The fixes were statically validated, but dedicated regression tests should still be added for:

- admin route `401` and `403` behavior
- low-context `general` not-found behavior
- prompt-injection query sanitization

---

## 8. Recommended Next Actions

### Priority: High

1. Add integration tests for all admin routes:
   - unauthenticated -> `401`
   - authenticated non-admin -> `403`
   - authenticated admin -> success path

2. Add chat-route regression tests for:
   - low-confidence `general` requests with empty context
   - injection-like retrieval queries

3. Add monitoring around:
   - denied admin access attempts
   - hallucination gate trigger frequency
   - prompt-injection detection frequency

### Priority: Medium

1. Move from email allowlist to role-based authorization.
2. Add explicit audit logs for privileged admin mutations.
3. Review other non-admin high-impact routes for similar hard gating.

### Priority: Medium-Low

1. Add a small security test script for CI.
2. Add environment validation to ensure `ALLOWED_ADMIN_EMAILS` is documented and set in production.

---

## 9. Deployment Readiness Statement

Based on the scoped audit items in this report:

- the previously identified P0 security blockers have been remediated in code
- static validation passes
- no architecture-breaking changes were introduced
- no new dependencies were added

The remaining recommended step before production deployment is a live smoke test in a real runtime environment covering:

- authenticated admin route access
- unauthenticated access denial
- low-confidence chat fallback behavior
- injection-signal logging behavior

---

## 10. Conclusion

This audit closed three production-blocking security issues:

- unauthorized admin API access
- low-context hallucination risk
- weak and incomplete prompt-injection filtering

The current working tree is materially safer than the pre-audit state and is aligned with the existing application structure.

