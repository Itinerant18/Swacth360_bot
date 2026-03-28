# 🤖 CLAUDE.md — Dexter Tech Support AI (SAI HMS Bot)
> Auto-read by Claude Code at every session start.
> Last generated: March 2026 | Repo: github.com/Itinerant18/Swacth360_bot

---

## 🎯 Project Identity

| Field | Value |
|---|---|
| **Project Name** | Dexter Tech Support AI (also: SAI HMS Bot, Swatch360 Bot) |
| **Type** | Enterprise-Grade Multilingual RAG Chatbot |
| **Domain** | Industrial IoT & HMS (Hybrid Management System) Control Panels |
| **Developer** | Aniket — Security Engineers Pvt. Ltd. (SEPLe) |
| **Repo** | github.com/Itinerant18/Swacth360_bot |
| **Live URL** | dexter-hms-bot.netlify.app |

---

## 🧠 What This Project Does

Dexter is an AI-powered multilingual support bot for industrial control panels (HMS panels). Operators ask questions in English, Bengali, or Hindi and the system:

1. **Translates** non-English queries to English (via Sarvam AI)
2. **Routes** to documentation search OR live device data query
3. **Retrieves** relevant knowledge using a multi-stage RAG pipeline
4. **Generates** answers (or Mermaid wiring diagrams) via Sarvam LLM
5. **Caches** responses at 2 tiers for fast repeat queries
6. **Stores** conversations in Supabase for history + admin review

---

## 🏗️ Full Tech Stack

### Web App (Next.js)
| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| Runtime | React 19, TypeScript 5 |
| Styling | TailwindCSS v4 |
| Deployment | Netlify + @netlify/plugin-nextjs |
| Node Version | 20+ |

### AI / LLM
| Purpose | Model/Service |
|---|---|
| Primary LLM | GPT-4o (sarvam.ai) — multilingual Indian language model |
| Embeddings | OpenAI text-embedding-3-small (via LangChain) |
| Fallback/Gemini | @langchain/google-genai |
| Local LLM | @langchain/ollama |
| AI SDK | Vercel AI SDK v4 (`ai` package) |

### RAG Pipeline
| Module | File | Purpose |
|---|---|---|
| Core RAG Engine | `src/lib/rag-engine.ts` | HYDE, multi-vector retrieval, reranking |
| Hybrid Search | `src/lib/hybrid-search.ts` | BM25 + vector combined |
| Semantic Cache | `src/lib/cache.ts` | 2-tier cache (exact + semantic) |
| Query Expansion | `src/lib/query-expansion.ts` | Expand queries for better recall |
| Query Decomposer | `src/lib/query-decomposer.ts` | Break complex questions into sub-queries |
| RAPTOR Indexing | `src/lib/raptor-builder.ts` / `raptor-retrieval.ts` | Hierarchical chunk indexing |
| Knowledge Graph | `src/lib/knowledge-graph.ts` | Entity extraction + graph boosting |
| Reranker | `src/lib/reranker.ts` | Cross-encoder style reranking |
| Feedback Reranker | `src/lib/feedback-reranker.ts` | Boost results based on user thumbs up/down |
| Logical Router | `src/lib/logical-router.ts` | Decide vector vs relational route |
| Semantic Router | `src/lib/router.ts` | Select optimal prompt per query type |
| Conversation Retrieval | `src/lib/conversation-retrieval.ts` | Rewrite follow-ups with context |
| Rate Limiter | `src/lib/rate-limiter.ts` | Per-IP rate limiting |
| Sarvam Utils | `src/lib/sarvam.ts` | Strip think tags, chain-of-thought cleanup |
| Embeddings | `src/lib/embeddings.ts` | Text → vector |
| PDF Extract | `src/lib/pdf-extract.ts` | Parse PDFs for ingestion |
| Semantic Chunker | `src/lib/semantic-chunker.ts` | Smart document chunking |
| RAG Evaluator | `src/lib/rag-evaluator.ts` | Auto-evaluate answer quality |
| RAG Settings | `src/lib/rag-settings.ts` | Runtime tuning from DB |

### Database & Storage
| Service | Purpose |
|---|---|
| Supabase (PostgreSQL + pgvector) | Primary DB — knowledge base, auth, conversations, sessions |
| Pinecone | Vector database for embeddings |
| Upstash Redis | Fast semantic cache |

### Mobile App (Flutter)
| Field | Value |
|---|---|
| Location | `/mobile/` |
| App Name | SAI — SWATCH Panel AI Support |
| Flutter SDK | >= 3.3.0 |
| Platforms | Android, iOS, Web, Windows, Linux, macOS |
| State Management | Provider |
| Auth | supabase_flutter |
| Diagram Rendering | webview_flutter (Mermaid) |
| Markdown | flutter_markdown |

---

## 📁 Project File Structure (Critical Files)

```
Swacth360_bot/
├── CLAUDE.md                          ← YOU ARE HERE
├── _orchestrator/                     ← AI workflow session files
│   ├── plan.md                        ← Paste Claude.ai plan here
│   ├── output.md                      ← Paste execution output here
│   ├── session.md                     ← Running log of all AI sessions
│   ├── validation.md                  ← Claude Code validation notes
│   └── _template.md                   ← Copy this per feature
│
├── src/
│   ├── app/
│   │   ├── page.tsx                   ← Main chat UI (React 19, client component)
│   │   ├── layout.tsx                 ← Root layout
│   │   ├── login/page.tsx             ← Auth page
│   │   ├── admin/page.tsx             ← Admin dashboard
│   │   └── api/
│   │       ├── chat/route.ts          ← ⭐ CORE: main chat pipeline
│   │       ├── diagram/route.ts       ← Mermaid diagram generation
│   │       ├── admin/
│   │       │   ├── ingest/            ← PDF/JSONL ingestion endpoint
│   │       │   ├── analytics/         ← Usage analytics
│   │       │   ├── feedback/          ← Feedback data
│   │       │   ├── rag-settings/      ← Live RAG tuning
│   │       │   ├── raptor/            ← RAPTOR rebuild trigger
│   │       │   ├── graph/             ← Knowledge graph
│   │       │   └── questions/         ← Unknown questions review
│   │       ├── conversations/         ← Conversation CRUD
│   │       └── users/                 ← User management
│   │
│   ├── components/
│   │   ├── DiagramCard.tsx            ← Mermaid diagram renderer
│   │   ├── MermaidBlock.tsx           ← Raw Mermaid block
│   │   ├── LanguageSelector.tsx       ← EN/BN/HI switcher
│   │   ├── RAGSettingsTab.tsx         ← Admin RAG controls
│   │   ├── FeedbackTab.tsx            ← Admin feedback review
│   │   └── GraphTab.tsx               ← Knowledge graph viewer
│   │
│   ├── lib/                           ← All RAG + AI logic (see table above)
│   └── middleware.ts                  ← Supabase SSR session refresh
│
├── scripts/
│   ├── ingest-pdf.ts                  ← Ingest PDFs into knowledge base
│   ├── ingest-jsonl.ts                ← Ingest Q&A pairs (JSONL format)
│   ├── ingest-diagram.ts              ← Ingest wiring diagrams
│   ├── seed-pdfs.ts                   ← Bulk PDF seeding
│   ├── seed-supabase.ts               ← DB seed script
│   ├── audit-kb.ts                    ← Knowledge base audit
│   ├── langextract-ingest.py          ← Python-based LangChain extraction
│   └── run-rag-benchmark.ts           ← RAG quality benchmarks
│
├── supabase/migrations/               ← 26 migration files (001–026)
├── mobile/                            ← Flutter app (SAI)
├── tests/admin-smoke.test.ts          ← Admin smoke tests
├── netlify.toml                       ← Netlify deployment config
├── next.config.ts                     ← Next.js config
├── tsconfig.json                      ← TypeScript config
└── package.json                       ← name: "dexter-bot"
```

---

## 🔑 Environment Variables

All must be in `.env.local` for local dev and in Netlify environment for production.

```env
# ── Supabase ─────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# ── AI / LLM ──────────────────────────────────────────────────
OPENAI_API_KEY=sk-proj-...          # Embeddings (text-embedding-3-small)
OPENAI_API_KEY=sk_...               # Primary chat LLM (GPT-4o)
GOOGLE_GENERATIVE_AI_API_KEY=...    # Gemini fallback (optional)
HUGGINGFACE_API_KEY=...             # HuggingFace (optional)

# ── Vector Store ──────────────────────────────────────────────
PINECONE_API_KEY=...
PINECONE_INDEX=...

# ── Cache ─────────────────────────────────────────────────────
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# ── Email ─────────────────────────────────────────────────────
RESEND_API_KEY=re_...

# ── App Config ────────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOWED_ADMIN_EMAILS=your@email.com
```

> ⚠️ Missing keys cause silent failures in some modules and hard crashes in others.
> Always verify all env vars are set before debugging RAG issues.

---

## 🗄️ Database Schema (Key Tables)

| Table | Purpose |
|---|---|
| `hms_knowledge` | Main knowledge base — questions, answers, embeddings, categories |
| `chat_sessions` | Legacy session storage (pre-conversations) |
| `conversations` | Conversation threads (per user) |
| `messages` | Individual messages in conversations |
| `rag_settings` | Runtime RAG configuration (single row, id=1) |
| `rag_evals` | Auto-evaluated answer quality scores |
| `unknown_questions` | Questions with low confidence (for review) |
| `user_feedback` | Thumbs up/down on answers |
| `raptor_nodes` | RAPTOR hierarchical index nodes |
| `semantic_cache` | Tier-2 semantic cache entries |
| `knowledge_graph` | Entity graph nodes/edges |

---

## 🚀 npm Scripts

```bash
npm run dev              # Start dev server (localhost:3000)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint
npm run test:smoke       # Admin smoke tests
npm run benchmark        # Full RAG benchmark
npm run benchmark:factual    # Factual Q&A benchmark
npm run benchmark:diagnostic # Diagnostic Q&A benchmark
```

---

## 📡 API Endpoints

### Public
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat` | Main chat — body: `{messages, userId, language, searchMode, conversationId}` |
| GET/POST | `/api/diagram` | Generate Mermaid diagram |
| GET/POST | `/api/conversations` | List / create conversations |
| GET/PUT/DELETE | `/api/conversations/[id]` | Conversation CRUD |
| GET/POST | `/api/conversations/[id]/messages` | Get/add messages |

### Admin (protected)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/ingest` | Ingest PDF or JSONL into KB |
| GET | `/api/admin/analytics` | Usage statistics |
| GET/POST | `/api/admin/feedback` | View/process feedback |
| GET/PUT | `/api/admin/rag-settings` | Read/update RAG config live |
| POST | `/api/admin/raptor` | Rebuild RAPTOR index |
| GET | `/api/admin/graph` | Knowledge graph data |
| GET | `/api/admin/questions` | Unknown questions for review |
| POST | `/api/admin/seed-answer` | Seed a single Q&A |
| POST | `/api/admin/seed-diagram` | Seed a diagram |

---

## 🔄 RAG Pipeline Flow (Chat Request)

```
User Message (EN/BN/HI)
    ↓
Rate Limit Check (Upstash Redis)
    ↓
Auth + Conversation Resolution (Supabase)
    ↓
Translation to English (GPT-4o, if needed)
    ↓
Conversation Rewrite (resolve pronouns using history)
    ↓
Diagram Detection? ──YES──► Generate Mermaid diagram (skip cache)
    ↓ NO
Tier 1 Cache Check (exact match, Upstash)
    ↓ MISS
Logical Route (vector / relational / hybrid)
    ↓
Query Embedding (OpenAI text-embedding-3-small)
    ↓
Tier 2 Cache Check (semantic similarity, Upstash)
    ↓ MISS
Query Classification (factual / procedural / diagnostic / visual / comparative)
    ↓
Query Decomposition (complex → sub-queries)
    ↓
Multi-Vector Retrieval:
  ├── Query vector search (Supabase pgvector)
  ├── HYDE vector search (hypothetical answer embedding)
  ├── Expanded query search
  └── RAPTOR hierarchical search
    ↓
Hybrid Search (BM25 + vector if enabled)
    ↓
Feedback Boost (adjust scores from user feedback)
    ↓
Cross-Encoder Reranking
    ↓
Knowledge Graph Boost (entity matching)
    ↓
Prompt Selection (semantic router → template per query type)
    ↓
LLM Generation (GPT-4o)
    ↓
Strip Think Tags / Chain-of-Thought
    ↓
Store Cache (both tiers, fire-and-forget)
    ↓
Persist to DB (chat_sessions + messages)
    ↓
Auto-Evaluate (rag-evaluator, fire-and-forget)
    ↓
Stream Response to Client
```

---

## 🛠️ My AI Workflow (Multi-Tool Orchestration)

### Tool Roles
| Tool | Role in This Project |
|---|---|
| **Claude.ai (web)** | Architecture planning, RAG logic design, complex debugging strategy |
| **Gemini CLI** | Long-context tasks — reading multiple files, cross-file analysis |
| **Codex / OpenCode** | Boilerplate generation, utility functions, TypeScript types |
| **Antigravity IDE** | Visual editing, in-editor refactoring |
| **Claude Code (YOU)** | Validation, file-level edits, running scripts, TypeScript type checks |

### Your Job as Claude Code
When I call you, always:
1. **Read** `_orchestrator/plan.md` to understand the task
2. **Read** `_orchestrator/output.md` to see what was already generated
3. **Validate** correctness, TypeScript types, edge cases, security
4. **Fix** directly in the source files
5. **Write** notes to `_orchestrator/validation.md`

---

## ⚠️ Critical Rules & Known Issues

### Code Rules
- All new files must be **TypeScript** (`.ts` or `.tsx`)
- Use `'use client'` directive for React components with hooks
- API routes go in `src/app/api/*/route.ts` (Next.js App Router)
- **Never** expose `SUPABASE_SERVICE_ROLE_KEY` to client-side code
- Always use `getSupabase()` (singleton) not `createClient()` directly
- Supabase uses **Google DNS (8.8.8.8)** — custom DNS resolver is intentional (SEPLe network restriction)
- The `dns.setDefaultResultOrder('ipv4first')` calls throughout are **intentional** — do not remove

### Known Tech Debt
1. **Silent env failures** — some modules fail silently if API keys are missing
2. **RAPTOR rebuild** is slow — avoid triggering in dev unless needed
3. **Mobile app** (`/mobile`) is Flutter — do not touch with TypeScript tools
4. **Migration 012** is missing (gap between 011 and 013) — this is intentional
5. The `conversation_id` foreign key in `chat_sessions` was added in migration 019

### Multilingual Notes
- Supported: `en` (English), `bn` (Bengali), `hi` (Hindi)
- Translation handled by GPT-4o
- NOT_FOUND messages must exist for all 3 languages
- Language param comes from UI LanguageSelector component

---

## 🐛 Debugging Checklist

When something breaks, check in this order:

```bash
# 1. Check env vars
cat .env.local | grep -v "^#" | grep "="

# 2. Run dev server and watch logs
npm run dev
# Look for: [chat] Cache hit / miss, RAG Engine completed, route selected

# 3. Type check
npx tsc --noEmit

# 4. Lint
npm run lint

# 5. Smoke test admin endpoints
npm run test:smoke

# 6. Check Supabase connection
# The custom DNS/IPv4 resolver in supabase.ts handles SEPLe network DNS issues

# 7. Benchmark RAG quality
npm run benchmark
```

---

## 🔧 Flutter Mobile App (SAI)

Location: `/mobile/`

```bash
cd mobile
flutter pub get        # Install dependencies
flutter run            # Run on connected device/emulator
flutter build apk      # Build Android APK
flutter build ios      # Build iOS
```

Key features:
- Connects to same Supabase backend
- Renders Mermaid diagrams via WebView
- Language selector (EN/BN/HI)
- Shared preferences for persistent language setting
- Provider for state management

---

## 📊 Performance Targets

| Metric | Target |
|---|---|
| Cache hit response | < 200ms |
| RAG pipeline (no cache) | < 3s |
| Diagram generation | < 5s |
| RAG confidence threshold | > 0.45 (UNKNOWN_THRESHOLD) |
| Stored diagram confidence | > 0.55 |

---

## 🗺️ Active Development Areas (March 2026)

Check `_orchestrator/session.md` for the current active task.

Recent migrations (latest work):
- `026_rate_limiting.sql` — per-IP rate limiting
- `025_feedback_reranking.sql` — boost results based on thumbs up/down
- `022_semantic_cache.sql` — 2-tier semantic cache
- `016_raptor_hierarchical_index.sql` — RAPTOR indexing

---

## 📞 Quick Reference

```bash
# Start everything
npm run dev

# Add to knowledge base
npx tsx scripts/ingest-pdf.ts --file ./docs/manual.pdf
npx tsx scripts/ingest-jsonl.ts --file ./data/qa.jsonl

# Rebuild RAPTOR index
curl -X POST http://localhost:3000/api/admin/raptor

# Check RAG quality
npm run benchmark

# Deploy
git push origin main  # Auto-deploys to Netlify
```
