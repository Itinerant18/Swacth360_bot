# 🧩 Feature Session — [FEATURE NAME]
> Copy this file as `feature-[name].md` for each new task

---

## 📋 Task Summary
**Date:** YYYY-MM-DD  
**Feature:** [Short description]  
**Files to Touch:** [list specific files]  
**Priority:** High / Medium / Low  

---

## 🔵 Phase 1 — Claude.ai Plan
> Paste Claude.ai's plan here before execution

```
[PASTE PLAN FROM CLAUDE.AI HERE]
```

**Key decisions made:**
- 
- 

---

## 🟡 Phase 2 — Execution Output
> Paste output from Codex / Gemini / OpenCode here

**Tool used:** Codex / Gemini CLI / OpenCode  
**Step implemented:** Step X of Y  

```typescript
// [PASTE GENERATED CODE OR OUTPUT HERE]
```

**What was generated:**
- 
- 

**What was skipped / deferred:**
- 

---

## 🟢 Phase 3 — Claude Code Validation
> Run: `claude "Read _orchestrator/plan.md and _orchestrator/output.md, validate"`

**Validation result:** ✅ Pass / ❌ Fail / ⚠️ Partial  

**Issues found:**
1. 
2. 

**Fixes applied:**
- File: `src/...` — [description of fix]
- File: `src/...` — [description of fix]

**TypeScript errors:** 0 / [count]  
**Edge cases covered:** Yes / No  
**Security checked:** Yes / No  

---

## 🔴 Phase 4 — Commit
```bash
git add .
git commit -m "feat: [description] | plan:claude | impl:[tool] | val:claude-code"
```

**Commit hash:** `[hash]`  
**PR/Branch:** `feature/[name]`  

---

## 📝 Notes for Next Session
> Things the next AI agent needs to know

- 
- 

---

## ❓ Open Questions
- [ ] 
- [ ] 
