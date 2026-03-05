# Dexter HMS RAG Chatbot — Migration & Training Guide
### Switching from Ollama → OpenAI + Sarvam AI

| Version | Date | Audience | Status |
|---------|------|----------|--------|
| 1.0 | February 2026 | Dev Team | Production Ready |

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Files to Update](#3-files-to-update)
4. [Step-by-Step Migration](#4-step-by-step-migration)
5. [How the System Works](#5-how-the-system-works)
6. [Admin Panel: Train Bot Tab](#6-admin-panel-train-bot-tab)
7. [Seeding and Scripts](#7-seeding-and-scripts)
8. [Troubleshooting](#8-troubleshooting)
9. [Cost Reference](#9-cost-reference)
10. [Migration Checklist](#10-migration-checklist)
11. [Complete .env.local Reference](#11-complete-envlocal-reference)

---

## 1. Overview

This guide covers the migration of the Dexter HMS RAG chatbot from using Ollama (local LLM) to a fully cloud-based stack using **OpenAI for embeddings** and **Sarvam AI for Bengali translation and answer generation**.

### Why we are migrating

| Problem | Why it matters |
|---------|----------------|
| Ollama requires a local server | Cannot deploy to Vercel — must run own server 24/7 |
| nomic-embed-text (768 dims) | Lower quality embeddings — less accurate RAG matching |
| Two separate services to run | Complex local setup for every developer |
| Breaks on Vercel deployment | Can't use serverless functions with Ollama dependency |

### What changes and what stays

| Component | Before | After | Notes |
|-----------|--------|-------|-------|
| Embeddings | Ollama nomic-embed-text | OpenAI text-embedding-3-small | 768 → 1536 dims |
| Translation | Sarvam AI sarvam-m | Sarvam AI sarvam-m | ✅ No change |
| Answer generation | Sarvam AI sarvam-m | Sarvam AI sarvam-m | ✅ No change |
| Bengali output | Sarvam AI sarvam-m | Sarvam AI sarvam-m | ✅ No change |
| Q&A gen (PDF ingest) | Gemini Flash | Sarvam AI sarvam-m | Unified stack |
| Local install required | Ollama + nomic model | Nothing | ✅ Simpler |
| Vector dimensions | 768 | 1536 | Re-seed required |

> ⚠️ **IMPORTANT:** The vector column in Supabase must be migrated from `vector(768)` to `vector(1536)` BEFORE switching. After migration, all existing embeddings must be re-seeded.

---

## 2. System Architecture

### Request flow — after migration (OpenAI)

```
User Bengali message
  → Sarvam AI: translate to English
  → OpenAI API: embed query (text-embedding-3-small)   ← simple API call
  → Supabase: vector similarity search
  → Sarvam AI: generate Bengali answer
  → Stream to user
```

✅ **Result:** Every step is now a simple API call. No local services. Fully works on Vercel, any cloud, any developer machine.

### API keys required

| Key | Used for |
|-----|----------|
| `OPENAI_API_KEY` | `text-embedding-3-small` — converting questions and knowledge into vectors |
| `SARVAM_API_KEY` | Bengali translation + answer generation + PDF Q&A extraction |

> **Note:** Sarvam AI's API is OpenAI-compatible, so we use `@langchain/openai` with a custom `baseURL: https://api.sarvam.ai/v1`. No separate SDK needed.

---

## 3. Files to Update

| File | Destination | Action |
|------|-------------|--------|
| `embeddings.ts` | `src/lib/embeddings.ts` | Replace |
| `chat route` | `src/app/api/chat/route.ts` | Replace |
| `admin ingest` | `src/app/api/admin/ingest/route.ts` | Replace |
| `seed-answer` | `src/app/api/admin/seed-answer/route.ts` | Replace |
| `seed-supabase` | `scripts/seed-supabase.ts` | Replace |
| `ingest-pdf` | `scripts/ingest-pdf.ts` | Replace |
| `admin page` | `src/app/admin/page.tsx` | Replace |
| SQL migration | `supabase/migrations/005_openai_migration.sql` | Run in Supabase |

---

## 4. Step-by-Step Migration

### Step 1 — Run SQL migration
Run `005_openai_migration.sql` in Supabase SQL Editor.

### Step 2 — Update .env.local
```env
OPENAI_API_KEY=sk-proj-...
SARVAM_API_KEY=your-sarvam-key
# Remove OLLAMA_BASE_URL
```

### Step 3 — Install packages
```bash
npm install @langchain/openai pdf-parse
```

### Step 4 — Re-seed
```bash
npx tsx scripts/clear.ts
npx tsx scripts/seed-supabase.ts
```

### Step 5 — Test
```bash
npm run dev
```

---

## 5. How the System Works

### The three-layer answer strategy

| Similarity score | Mode | Behaviour |
|------------------|------|-----------|
| > 0.75 (high confidence) | Full RAG | Answers directly from knowledge base |
| 0.55 – 0.75 (medium) | RAG with caveat | Uses KB but notes partial confidence |
| < 0.55 (low confidence) | General expertise | Uses industrial knowledge, warns user |

Unknown questions below **0.60 similarity** are logged to `unknown_questions` for admin review.

---

## 6. Admin Panel: Train Bot Tab

### Method A — Upload a PDF
1. Go to `/admin` → **Train Bot** tab
2. Select **PDF Upload** mode
3. Enter a source name
4. Drag and drop a PDF (max 10 MB)
5. Click **Process & Train Bot**

### Method B — Paste text
1. Go to `/admin` → **Train Bot** tab
2. Select **Paste Text** mode
3. Enter source name + paste text
4. Click **Process & Train Bot**

---

## 7. Seeding and Scripts

```bash
# Re-seed from JSON
npx tsx scripts/seed-supabase.ts

# Expanded dataset
DATA_FILE=data/hms-dexter-qa-expanded.json npx tsx scripts/seed-supabase.ts

# PDF ingestion (CLI — deep mode)
npx tsx scripts/ingest-pdf.ts --file="data/pdf/manual.pdf" --name="Manual v2.3"

# PDF ingestion (CLI — quick mode)
npx tsx scripts/ingest-pdf.ts --file="data/pdf/manual.pdf" --name="Manual" --quick
```

---

## 8. Troubleshooting

| Error | Fix |
|-------|-----|
| `OPENAI_API_KEY not configured` | Add to `.env.local` |
| Dimension mismatch | Run `005_openai_migration.sql` first, then re-seed |
| PDF parsing failed | PDF is image-only — needs OCR first |
| Vercel timeout on Train Bot | Use CLI script for large PDFs |
| Empty answers | Check `hms_knowledge` row count |

---

## 9. Cost Reference

| Activity | Cost (USD) |
|----------|------------|
| 1 user question embedding | < $0.0001 |
| Seeding 200 entries | ~$0.001 |
| Seeding 800 entries | ~$0.004 |
| 50-page PDF ingestion | ~$0.0006 |
| 1,000 questions/day | ~$0.05/day |

---

## 10. Migration Checklist

- [x] Run `005_openai_migration.sql` in Supabase
- [x] Add `OPENAI_API_KEY` to `.env.local`
- [x] Remove `OLLAMA_BASE_URL`
- [x] Install `@langchain/openai`
- [x] Replace all source files
- [x] Run `npx tsx scripts/clear.ts`
- [ ] Run `npx tsx scripts/seed-supabase.ts`
- [ ] Test locally
- [ ] Deploy to Vercel

---

## 11. Complete .env.local Reference

```env
# ── Supabase ──────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── OpenAI (embeddings only) ───────────────────────────────────
OPENAI_API_KEY=sk-proj-...

# ── Sarvam AI (translation + generation) ──────────────────────
SARVAM_API_KEY=your-sarvam-key

# ── Admin ─────────────────────────────────────────────────────
NEXT_PUBLIC_ADMIN_PASSWORD=your-admin-password
```
