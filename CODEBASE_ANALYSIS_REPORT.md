# Codebase Analysis Report

**Project**: Dexter Bot (tech-support-ai)
**Analysis Date**: Auto-generated
**Last Commit**: Auto-detected
**Report Version**: 1.0

---

## 1. Project Summary

**Project Name**: Dexter Bot
**Project Type**: Industrial IoT AI Support Chatbot
**Core Functionality**: A multilingual RAG-powered chatbot for HMS (Harsh Management System) / Industrial IoT control panels — providing technical support, wiring diagrams, troubleshooting, and configuration guidance in English, Bengali, and Hindi.
**Target Users**: Factory floor technicians, maintenance engineers, and support staff working with SWATCH industrial control panels and SEPLe networking infrastructure.
**Deployment**: Dual-platform — Netlify (primary) and Vercel
**Mobile Companion**: Flutter app (SAI — SWATCH Panel AI Support) in `/mobile/`

---

## 2. Tech Stack

### Framework & Runtime
| Layer | Technology | Version |
|-------|------------|---------|
| Frontend Framework | Next.js (App Router) | 16.1.6 |
| UI Library | React | 19.2.3 |
| Language | TypeScript | 5.x (strict mode) |
| Styling | Tailwind CSS v4 | 4.x |
| Build Tool | Turbopack / Webpack | — |
| Runtime | Node.js | — |

### AI / LLM Orchestration
| Component | Technology |
|-----------|------------|
| LLM Orchestration | LangChain (`@langchain/openai`, `@langchain/core`, `@langchain/community`) |
| AI SDK | Vercel AI SDK v4 (`ai` package) |
| LLM Provider (Primary) | OpenAI GPT-4o via Sarvam.ai |
| LLM Provider (Fallback) | Google Gemini |
| Embeddings | OpenAI `text-embedding-3-small` |
| Reranker | HuggingFace Cross-Encoder |

### Database & Search
| Component | Technology |
|-----------|------------|
| Primary Database | Supabase (PostgreSQL) |
| Vector Search | pgvector extension |
| Index Types | HNSW, IVFFlat |
| ORM / Client | @supabase/supabase-js |

### Caching (2-Tier)
| Tier | Technology | Purpose |
|------|------------|---------|
| Tier 1 (Exact) | Upstash Redis | Key-value cache with SHA-256 hashing |
| Tier 2 (Semantic) | Supabase pgvector | Vector similarity at 0.90 threshold |
| Local | In-memory LRU | Process-level exact match cache |

### Infrastructure & Deployment
| Component | Technology |
|-----------|------------|
| Primary Host | Netlify |
| Secondary Host | Vercel |
| Plugin | @netlify/plugin-nextjs |
| Rate Limiting | Upstash (per-IP, 30 req/60s) |
| Email | Resend |
| Audio Processing | ffmpeg,Whisper |

### UI Components
| Component | Library |
|-----------|---------|
| Icons | FontAwesome (`@fortawesome/*`), Lucide React |
| Diagrams | Mermaid.js (`mermaid`) |
| Charts | Recharts |
| Markdown | react-markdown, react-syntax-highlighter |
| State Management | React hooks (no Redux) |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │   Chat UI       │  │  Admin UI       │  │   Auth Pages               │   │
│  │  page.tsx       │  │  admin/page.tsx │  │  login/, reset-password/   │   │
│  │  (938 lines)    │  │  (1428 lines)   │  │                            │   │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────────┘   │
│           │                    │                                             │
│  ┌────────▼────────────────────▼───────────────────────────────────────┐   │
│  │                        React Components                              │   │
│  │  ChatInputBar | ConversationSidebar | MessageBubble | LanguageSelector│   │
│  │  DiagramCard | MermaidBlock | FeedbackTab | GraphTab | RAGSettingsTab│   │
│  └─────────────────────────────┬─────────────────────────────────────────┘   │
│                                │                                            │
│  ┌─────────────────────────────▼─────────────────────────────────────────┐ │
│  │                         Custom Hooks                                   │ │
│  │               useChatStream.ts (SSE streaming)                        │ │
│  │               useAudioRecorder.ts (voice input)                       │ │
│  └─────────────────────────────┬─────────────────────────────────────────┘ │
└────────────────────────────────┼─────────────────────────────────────────────┘
                                 │ HTTPS
┌────────────────────────────────▼─────────────────────────────────────────────┐
│                           NEXT.JS API ROUTER                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │  /api/chat      │  │  /api/diagram    │  │  /api/admin/*              │   │
│  │  route.ts       │  │  route.ts        │  │  (15+ admin endpoints)     │   │
│  │  (895 lines)    │  │  (773 lines)     │  │                           │   │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────────────────┘   │
│           │                    │                                             │
│  ┌────────▼────────────────────▼───────────────────────────────────────┐   │
│  │                    Pipeline Orchestrator                              │   │
│  │                     src/lib/pipeline.ts (1148 lines)                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │   │
│  │  │ Translation│ │Cache    │ │Retrieval │ │Generation│ │Streaming│      │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │   │
│  └─────────────────────────────┬─────────────────────────────────────────┘   │
└────────────────────────────────┼─────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌───────────────────┐  ┌───────────────────┐  ┌─────────────────────────┐
│   DATA LAYER      │  │   RAG ENGINE      │  │   LLM LAYER             │
│                   │  │                   │  │                         │
│ ┌───────────────┐ │  │ ┌───────────────┐  │  │ ┌───────────────────┐   │
│ │ Supabase      │ │  │ │ RAG Engine    │  │  │ │ OpenAI GPT-4o     │   │
│ │ (pgvector)    │ │  │ │ (986 lines)   │  │  │ │ via Sarvam.ai     │   │
│ │               │ │  │ │               │  │  │ └───────────────────┘   │
│ │ • knowledge_base│  │ │ • HYDE        │  │  │ ┌───────────────────┐   │
│ │ • conversations │  │ │ • MMR         │  │  │ │ Google Gemini     │   │
│ │ • messages      │  │ │ • BM25        │  │  │ │ (fallback)        │   │
│ │ • diagrams      │  │ │ • Reranking   │  │  │ └───────────────────┘   │
│ │ • knowledge_graph│  │ │ • Compression │  │  │                         │
│ │ • RAPTOR_index  │  │ │               │  │  │ ┌───────────────────┐   │
│ └───────────────┘ │  │ └───────────────┘  │  │ │ HuggingFace       │   │
│                   │  │                   │  │ │ Cross-Encoder     │   │
│ ┌───────────────┐ │  │ ┌───────────────┐  │  │ │ (reranker)        │   │
│ │ Upstash Redis │ │  │ │ RAPTOR        │  │  │ └───────────────────┘   │
│ │ (Tier 1)      │ │  │ │ retrieval.ts  │  │  │                         │
│ │               │ │  │ │ (204 lines)  │  │  │                         │
│ │ • Exact cache │ │  │ └───────────────┘  │  │                         │
│ │ • Rate limits │ │  │                   │  │                         │
│ │ • Semantic ch. │ │  │ ┌───────────────┐  │  │                         │
│ └───────────────┘ │  │ │ Knowledge     │  │  │                         │
│                   │  ││ Graph.ts     │  │  │                         │
│ ┌───────────────┐ │  │ │ (331 lines)   │  │  │                         │
│ │ Local LRU     │ │  │ └───────────────┐  │  │                         │
│ │ (In-memory)   │ │  │                   │  │                         │
│ │ • Process-cach│ │  │ ┌───────────────┐  │  │                         │
│ └───────────────┘ │  │ │ Conv.         │  │  │                         │
│                   │  │ │ Retrieval.ts  │  │  │                         │
│                   │  │ │ (145 lines)   │  │  │                         │
│                   │  │ └───────────────┘  │  │                         │
│                   │  │                   │  │                         │
│                   │  │ ┌───────────────┐  │  │                         │
│                   │  │ │ Cache.ts      │  │  │                         │
│                   │  │ │ (410 lines)   │  │  │                         │
│                   │  │ │ 2-tier system │  │  │                         │
│                   │  │ └───────────────┘  │  │                         │
└───────────────────┘  └───────────────────┘  └─────────────────────────┘
```

---

## 4. Module/Component Breakdown

### 4.1 Frontend — Page Layer (`src/app/`)

#### Main Chat Page (`src/app/page.tsx` — 938 lines)
**Purpose**: Primary user-facing chat interface
**Key Features**:
- Left sidebar: conversation list with new/delete/select functionality
- Center: message bubbles with streaming support
- Right: contextual info panel (hidden by default)
- Bottom: input bar with voice recording
- Language selector: EN / BN / HI
- Guest mode gate with passcode
- Edit/regenerate message functionality
- Feedback submission per message
- Auto-scroll on new messages

**Notable Patterns**:
- SSE (Server-Sent Events) streaming for LLM responses
- Streaming word-by-word with token display
- Conversation persistence via Supabase
- Real-time message state updates

#### Admin Dashboard (`src/app/admin/page.tsx` — 1428 lines)
**Purpose**: Internal admin interface for knowledge base management
**8-Tab Architecture**:
1. **Review Tab**: Unknown question management, Q&A seeding
2. **Analytics Tab**: Pipeline metrics, latency charts
3. **Users Tab**: User profile management
4. **Train Bot Tab**: PDF/text ingestion with SSE progress streaming
5. **Graph Tab**: Knowledge graph visualizer
6. **RAG Settings Tab**: Runtime tuning (similarity thresholds, BM25 weight, etc.)
7. **Feedback Tab**: User feedback review and reranking
8. **RAPTOR Tab**: Index rebuild trigger

**Key Features**:
- Drag-and-drop PDF upload with ingestion pipeline
- Real-time ingestion progress via SSE
- Metrics visualization with Recharts
- Graph node/edge visualization
- Manual answer seeding for unknown questions

#### Auth Pages (`src/app/login/`, `src/app/reset-password/`, `src/app/auth/callback/`)
- Email/password auth via Supabase
- OAuth callback handler
- Password reset flow

### 4.2 API Layer (`src/app/api/`)

#### Core Chat API (`src/app/api/chat/route.ts` — 895 lines)
**Purpose**: Main chat pipeline entry point
**Flow**:
1. Parse request (message, session, language, audio)
2. Rate limit check (30 req/60s per IP)
3. Auth/guest session validation
4. Translation to English (if BN/HI)
5. Conversation retrieval (follow-up rewriting)
6. Cache check (2-tier)
7. Run pipeline
8. Stream response via SSE
9. Persist message to Supabase
10. Trigger diagram generation (if needed)

#### Diagram API (`src/app/api/diagram/route.ts` — 773 lines)
**Purpose**: Generate technical diagrams (Mermaid, ASCII)
**Supported Diagram Types** (9+ templates):
- `wiring`: Electrical wiring diagrams
- `power`: Power distribution
- `network`: Network topology
- `panel`: Control panel layout
- `block`: Block diagrams
- `connector`: Connector pinouts
- `led`: LED status indicators
- `alarm`: Alarm system wiring
- `misc`: General purpose

**Key Features**:
- LLM-driven diagram generation from text descriptions
- SVG rendering via Mermaid.js
- Terminal ID → spec mapping
- Configurable via prompts

#### Admin API Routes (15+ endpoints)
| Route | Purpose |
|-------|---------|
| `/api/admin/analytics` | Dashboard analytics data |
| `/api/admin/ingest` | PDF/text ingestion trigger |
| `/api/admin/raptor` | RAPTOR index rebuild |
| `/api/admin/graph` | Knowledge graph management |
| `/api/admin/feedback` | Feedback review |
| `/api/admin/questions` | Unknown questions |
| `/api/admin/rag-settings` | RAG configuration CRUD |
| `/api/admin/seed-answer` | Seed Q&A pairs |
| `/api/admin/seed-diagram` | Seed diagrams |
| `/api/admin/failures` | Failure logging |
| `/api/admin/metrics` | Pipeline metrics |
| `/api/admin/metrics/stream` | SSE metrics streaming |
| `/api/admin/performance` | Performance data |

#### Support Routes
| Route | Purpose |
|-------|---------|
| `/api/conversations` | List/create conversations |
| `/api/conversations/[id]` | CRUD single conversation |
| `/api/conversations/[id]/messages` | Message management |
| `/api/users` | User management |
| `/api/transcribe` | Audio transcription (Whisper) |
| `/api/test-email` | Email testing |

### 4.3 RAG Engine Layer (`src/lib/`)

#### Core RAG Engine (`src/lib/rag-engine.ts` — 986 lines)
**Purpose**: Multi-vector retrieval with HYDE, MMR, and cross-encoder scoring

**Pipeline Stages**:
1. **Query Preprocessing**: Parse, normalize, detect intent
2. **HYDE Generation**: Generate hypothetical answer for better retrieval
3. **Multi-Vector Search**: Query + HYDE answer → embeddings
4. **BM25 Keyword Search**: Boost recall for technical terms
5. **MMR (Max Marginal Relevance)**: Diversity in results
6. **Cross-Encoder Reranking**: Re-score with `cross_encoder_score`
7. **Contextual Compression**: Trim chunks to remove noise
8. **Confidence Calibration**: Score → mode mapping (quick/standard/enhanced)

**Key Functions**:
- `search()`: Main retrieval entry
- `searchHybrid()`: BM25 + vector combined
- `searchReranked()`: Cross-encoder reranking
- `compress()`: Contextual compression
- `calibrate()`: Confidence scoring

#### Pipeline Orchestrator (`src/lib/pipeline.ts` — 1148 lines)
**Purpose**: End-to-end pipeline execution
**Flow**:
```
1. Input Validation & Sanitization
       │
       ▼
2. Translation (BN/HI → EN)
       │
       ▼
3. Conversation Retrieval (follow-up rewriting)
       │
       ▼
4. Cache Check (Tier 1: Redis → Tier 2: pgvector)
       │
       ▼ (cache miss)
5. RAG Retrieval
   ├── Query Processor
   ├── Intent Classification
   ├── RAPTOR Hierarchical Search
   ├── Knowledge Graph Boosting
   ├── BM25 + Vector Hybrid
   └── Conversation Context
       │
       ▼
6. Reranking & Compression
       │
       ▼
7. LLM Generation
   ├── Simple LLM (quick answers)
   └── Complex LLM (enhanced mode)
       │
       ▼
8. Response Formatting
       │
       ▼
9. SSE Streaming
       │
       ▼
10. Post-processing & Logging
```

**Key Classes/Functions**:
- `runPipeline()`: Main orchestrator
- `buildRetrievalPlan()`: Adaptive retrieval strategy
- `runSimpleLLM()` / `runComplexLLM()`: LLM variants
- `streamSSE()`: SSE response helper

#### Caching System (`src/lib/cache.ts` — 410 lines)
**2-Tier + Local Architecture**:
```
User Query
     │
     ▼
┌─────────────────┐
│  Local LRU      │  ← Fastest (in-process)
│  (exact match)  │
└────────┬────────┘
         │ miss
         ▼
┌─────────────────┐
│ Tier 1: Upstash │  ← Fast (SHA-256 key)
│ Redis (exact)   │
└────────┬────────┘
         │ miss
         ▼
┌─────────────────┐
│ Tier 2: Supabase│  ← Semantic (0.90 threshold)
│ pgvector        │
└────────┬────────┘
         │ miss
         ▼
   Full RAG Pipeline
```

**Key Functions**:
- `getCachedResponse()`: Check all 3 tiers
- `setCache()`: Write to all tiers
- `invalidateCache()`: Clear cache entries
- `getLocalCache()`: Process-level LRU

#### RAPTOR Retrieval (`src/lib/raptor-retrieval.ts` — 204 lines)
**Purpose**: Hierarchical clustering retrieval for multi-scale context

**Method**:
- `search_raptor_multilevel()`: RPC call to Supabase
- 5-level hierarchy with leaf boost
- Cluster centroid traversal
- Level-specific scoring

#### Knowledge Graph (`src/lib/knowledge-graph.ts` — 331 lines)
**Purpose**: Entity extraction and relationship management

**Entity Types**:
- Error codes (`E001`, `E002`, etc.)
- Terminal blocks (`TB01`, `TB02`)
- Models (`HMS-1600`, `HMS-3200`)
- Protocols (`Modbus`, `SEPLe`)
- Physical components

**Key Functions**:
- `extractEntities()`: Parse text for known entities
- `queryGraph()`: Graph-aware retrieval
- `boostWithGraph()`: Multiply scores by entity overlap

#### Conversation Retrieval (`src/lib/conversation-retrieval.ts` — 145 lines)
**Purpose**: Follow-up query understanding

**Features**:
- LLM-driven query rewriting
- Pronoun resolution ("it", "that", "the error")
- Topic shift detection
- Conversation context injection

### 4.4 Supporting Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `embeddings.ts` | OpenAI `text-embedding-3-small` wrapper |
| `hybrid-search.ts` | BM25 + vector combined search |
| `reranker.ts` | Cross-encoder reranking logic |
| `feedback-reranker.ts` | User feedback boost |
| `context-ranker.ts` | Rank and deduplicate context |
| `retrieval-optimizer.ts` | Adaptive retrieval planning |
| `query-expansion.ts` | Query variant generation |
| `query-decomposer.ts` | Complex query splitting |
| `query-processor.ts` | Query preprocessing pipeline |
| `intent-classifier.ts` | Query intent detection |
| `hyde-generator.ts` | HYDE hypothetical answer |
| `vector-search.ts` | Vector search abstraction |
| `confidence.ts` | Confidence scoring & mode selection |
| `response-formatter.ts` | Per-intent response formatting |
| `sanitize.ts` | Input sanitization, injection detection |
| `logger.ts` | Chat logging, failure recording |
| `pipeline-metrics.ts` | Stage timing, pipeline metrics |
| `semantic-cache.ts` | Semantic cache operations |
| `rate-limiter.ts` | Per-IP rate limiting |
| `sse.ts` | SSE response helpers |
| `llm.ts` | LLM factory (simple/complex) |
| `auth.ts` | Client-side Supabase auth |
| `auth-server.ts` | Server-side Supabase auth |
| `admin-emails.ts` | Admin email validation |
| `admin-fetch.ts` | Admin API fetch wrapper |
| `admin-adapter.ts` | Admin API adapter |
| `fetch-sse.ts` | SSE fetch consumer |
| `supabase.ts` | Supabase client (custom DNS resolver) |

### 4.5 React Components (`src/components/`)

| Component | Purpose |
|-----------|---------|
| `Chat/ChatInputBar.tsx` | Input bar with audio, guest gate |
| `Chat/ConversationSidebar.tsx` | Conversation list, CRUD |
| `Chat/MessageBubble.tsx` | Message rendering, streaming, edit, feedback |
| `DiagramCard.tsx` | Mermaid diagram renderer |
| `MermaidBlock.tsx` | Raw Mermaid block wrapper |
| `LanguageSelector.tsx` | EN/BN/HI toggle |
| `FeedbackTab.tsx` | Feedback review UI |
| `GraphTab.tsx` | Knowledge graph visualizer |
| `RAGSettingsTab.tsx` | Runtime RAG tuning |
| `admin/AdminAnalyticsDashboard.tsx` | Analytics charts |

### 4.6 Custom Hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useChatStream.ts` | SSE streaming management, message state |
| `useAudioRecorder.ts` | Voice recording, transcription |

### 4.7 Database Schema (`supabase/migrations/`)

31 migration files covering:

**Core Tables**:
- `knowledge_base`: Vector chunks with metadata
- `conversations`: User conversation threads
- `messages`: Individual messages with role
- `users`: User profiles
- `feedback`: User feedback on responses
- `diagrams`: Diagram chunks with Mermaid content
- `unknown_questions`: Unanswered questions for review

**Vector Indexes**:
- HNSW for high-dimensional vectors
- IVFFlat for approximate search

**Specialized**:
- `rag_evaluations`: Answer quality evaluation
- `semantic_cache`: Cached responses
- `rate_limits`: Per-IP rate tracking
- `observability_logs`: Pipeline logging
- `pipeline_metrics`: Performance tracking
- `rag_settings`: Runtime configuration

**Views**:
- `active_users`: Currently active users
- `failure_log`: Failed queries

### 4.8 Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `seed.ts` | JSON-based database seeding |
| `seed-supabase.ts` | Supabase-specific seeding |
| `ingest-pdf.ts` | PDF ingestion pipeline |
| `ingest-jsonl.ts` | JSONL ingestion |
| `ingest-diagram.ts` | Diagram ingestion |
| `seed-pdfs.ts` | Bulk PDF seeding |
| `embed-all.ts` | Bulk embedding generation |
| `audit-kb.ts` | Knowledge base audit |
| `clear.ts` | Database/cache clearing |
| `run-rag-benchmark.ts` | RAG quality benchmarks |
| `test-embedding-match.ts` | Embedding match testing |
| `validate-fixes.ts` | Fix validation |
| `langextract-ingest.py` | Python language extraction |

---

## 5. File-by-File Reference

### Configuration Files

| File | Purpose | Key Content |
|------|---------|-------------|
| `package.json` | Project manifest | Name: `dexter-bot`, deps: langchain, ai v4, supabase, mermaid, pdf-parse, resend |
| `next.config.ts` | Next.js config | Webpack externals for pdf2json, pdf-parse, canvas; env mapping |
| `tsconfig.json` | TypeScript config | Strict mode, `@/*` → `./src/*` alias, React 19 JSX |
| `postcss.config.mjs` | Tailwind v4 integration | `@tailwindcss/postcss` |
| `eslint.config.mjs` | ESLint flat config | |
| `netlify.toml` | Netlify deploy | @netlify/plugin-nextjs |
| `.env.example` | Env template | Supabase, OpenAI, Pinecone, Upstash, Resend |
| `.env` / `.env.local` | Local env (gitignored) | Actual credentials |
| `README.md` | 3200+ line documentation | Complete project docs |
| `CLAUDE.md` | AI agent instructions | 456 lines, tech stack, pipeline flow, debugging |

### Source Files Summary

| Path | Lines | Purpose |
|------|-------|---------|
| `src/lib/rag-engine.ts` | 986 | Multi-vector RAG with HYDE, MMR, cross-encoder |
| `src/lib/pipeline.ts` | 1148 | Pipeline orchestrator, SSE streaming |
| `src/lib/cache.ts` | 410 | 2-tier + local caching |
| `src/lib/supabase.ts` | 62 | Custom DNS resolver (8.8.8.8 IPv4) |
| `src/lib/raptor-retrieval.ts` | 204 | Hierarchical RAPTOR search |
| `src/lib/knowledge-graph.ts` | 331 | Entity extraction, graph boosting |
| `src/lib/conversation-retrieval.ts` | 145 | Follow-up query rewriting |
| `src/app/page.tsx` | 938 | Main chat UI |
| `src/app/admin/page.tsx` | 1428 | Admin dashboard |
| `src/app/api/chat/route.ts` | 895 | Main chat API |
| `src/app/api/diagram/route.ts` | 773 | Diagram generation API |
| `src/middleware.ts` | 62 | Supabase auth middleware |

### Key Patterns in Source Files

1. **Singleton Supabase client** (`src/lib/supabase.ts`): Custom DNS resolver forces `8.8.8.8` for IPv4 to bypass SEPLe network restrictions
2. **Two-tier cache** (`src/lib/cache.ts`): Redis exact match → pgvector semantic → full pipeline
3. **Adaptive LLM** (`src/lib/pipeline.ts`): Simple LLM for quick answers, complex LLM for enhanced mode
4. **SSE streaming** throughout: `/api/chat` and `/api/admin/metrics/stream` use Server-Sent Events
5. **Feedback reranking** (`src/lib/feedback-reranker.ts`): User thumbs up/down boost retrieval scores

---

## 6. Data Flow

### Typical Chat Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Request                                                  │
│   POST /api/chat                                                        │
│   Body: { message, sessionId, language, audioTranscript? }             │
└─────────────────────────────────┬───────────────────────────────────────┘
│
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: API Route Entry (src/app/api/chat/route.ts)                     │
│   - Rate limit check (Upstash: 30 req/60s per IP)                      │
│   - Auth/guest session validation                                       │
│   - Parse and validate input                                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Translation (if non-English)                                    │
│   language: "bn" | "hi" → translate to "en"                           │
│   Using Sarvam.ai translation API                                      │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Conversation Retrieval (src/lib/conversation-retrieval.ts)    │
│   - Detect follow-up query                                              │
│   - Rewrite with pronoun resolution                                    │
│   - Inject conversation context                                         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Cache Check (src/lib/cache.ts)                                  │
│   a) Local LRU (exact match)                                           │
│   b) Upstash Redis (SHA-256 key, exact match)                         │
│   c) Supabase pgvector (semantic, 0.90 threshold)                      │
│                                                                       │
│   If HIT → return cached response, skip to STEP 10                    │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ (cache miss)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 6: RAG Retrieval (src/lib/rag-engine.ts)                           │
│                                                                       │
│   6a. Query Processor: Normalize, extract entities                    │
│   6b. Intent Classifier: Determine query type                        │
│   6c. HYDE Generator: Generate hypothetical answer                    │
│   6d. Vector Search: Query + HYDE → embeddings                        │
│   6e. BM25 Search: Keyword boost for technical terms                  │
│   6f. RAPTOR Search: Hierarchical clustering retrieval                 │
│   6g. Knowledge Graph: Entity-based score boosting                    │
│   6h. Hybrid Combine: BM25 + vector weighted                          │
│   6i. MMR: Diversity selection                                        │
│   6j. Cross-Encoder Reranking: Re-score top-k                        │
│   6k. Context Compression: Trim noise                                 │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 7: Confidence Calibration (src/lib/confidence.ts)                  │
│   Score → Mode: < 0.3 = quick, 0.3-0.7 = standard, > 0.7 = enhanced   │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 8: LLM Generation (src/lib/pipeline.ts)                            │
│                                                                       │
│   Mode determines:                                                     │
│   - simple: Quick answer, fewer context                               │
│   - standard: Balanced response                                       │
│   - enhanced: Deep analysis, more sources, diagram suggestion        │
│                                                                       │
│   System prompt: Industrial IoT expert persona                       │
│   Includes: conversation history, retrieved context, language         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 9: SSE Streaming (src/lib/sse.ts)                                  │
│   Stream response token-by-token                                       │
│   Events: token, done, diagram_trigger                                │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 10: Post-Processing                                                │
│   - Persist message to Supabase (conversations, messages)              │
│   - Update pipeline metrics                                            │
│   - Log to observability                                               │
│   - If diagram_trigger: Call /api/diagram async                        │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 11: Response to Client                                             │
│   SSE stream with markdown + metadata                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Admin Ingestion Flow

```
Admin Upload PDF
       │
       ▼
POST /api/admin/ingest
       │
       ▼
PDF Parsing (pdf-parse / pdf2json)
       │
       ▼
Text Extraction & Cleaning
       │
       ▼
Chunking (recursive, 500 tokens, 50 overlap)
       │
       ▼
Embedding (OpenAI text-embedding-3-small)
       │
       ▼
Upsert to Supabase pgvector
       │
       ▼
Trigger RAPTOR rebuild (optional)
       │
       ▼
SSE progress updates to admin UI
```

---

## 7. Key Patterns & Design Decisions

### 7.1 Architecture Patterns

| Pattern | Implementation | Rationale |
|---------|----------------|-----------|
| **RAG** | Multi-vector with HYDE | Better retrieval for complex technical queries |
| **2-Tier Cache** | Redis + pgvector | Balance speed and semantic matching |
| **Hierarchical Retrieval** | RAPTOR 5-level clustering | Multi-scale context (panel-level vs component-level) |
| **Adaptive LLM** | Simple vs Complex variants | Speed vs quality trade-off |
| **SSE Streaming** | Server-Sent Events | Real-time token streaming without WebSocket |
| **Singleton Client** | Supabase/Redis clients | Connection pooling, reuse |
| **Custom DNS** | 8.8.8.8 resolver | Bypass SEPLe network restrictions |

### 7.2 Design Decisions

| Decision | Trade-off | Outcome |
|----------|-----------|---------|
| Supabase over Pinecone | Slightly less optimized vectors | Unified DB + vectors, simpler ops |
| Upstash Redis for cache | Extra dependency | Serverless-compatible, easy rate limiting |
| OpenAI embeddings | Vendor lock-in | Best quality, good cost |
| Sarvam AI for LLM | India-region optimization | Low latency for Bengali/Hindi |
| Next.js App Router | Learning curve | Better SSR/streaming support |
| Dual deploy (Netlify + Vercel) | More complex ops | Reliability, geographic distribution |

### 7.3 Configuration Pattern

Runtime RAG settings stored in `rag_settings` table, editable via admin UI, allowing tuning without redeployment:
- `similarity_threshold`: Vector match threshold (default: 0.70)
- `bm25_weight`: Keyword boost weight (default: 0.30)
- `max_chunks`: Maximum chunks to retrieve (default: 10)
- `enable_hyde`: HYDE toggle (default: true)

### 7.4 Rate Limiting

- **Algorithm**: Fixed window (60 seconds)
- **Limit**: 30 requests per IP per minute
- **Storage**: Upstash Redis
- **Response**: 429 with `Retry-After` header

---

## 8. Things to Watch Out For

### 8.1 Critical Issues

1. **Custom DNS Resolver** (`src/lib/supabase.ts`)
   - Hardcoded `8.8.8.8` IPv4 — works around SEPLe restrictions but may break in other networks
   - Only resolves `*.supabase.co` — not general-purpose

2. **Environment Variables**
   - `.env` / `.env.local` contain real credentials — never commit
   - Multiple env files (`.env`, `.env.example`, `.env.local`) can cause confusion

3. **Rate Limiting Bypass**
   - No rate limit on `/api/chat` if Upstash is down
   - Consider adding fallback

### 8.2 Tech Debt

1. **Duplicate LLM Providers**
   - Both `Sarvam AI` (GPT-4o wrapper) and `Google Gemini` configured
   - Sarvam appears to be primary — simplify if Gemini is unused

2. **Admin Password**
   - Stored in `.env.local` as `ADMIN_PASSWORD`
   - No rotation mechanism, no audit log on failed attempts

3. **No Automated Tests** (only `tests/admin-smoke.test.ts`)
   - Missing unit tests for RAG pipeline
   - Missing integration tests for chat flow
   - Missing E2E tests

4. **Knowledge Graph Rebuild**
   - Manual trigger via admin UI
   - No scheduled rebuild
   - No diff-based updates

5. **Large Embedding Model**
   - Migration `029` adds `text-embedding-3-large` (3072 dims)
   - Higher cost than `text-embedding-3-small` (1536 dims)
   - Consider if actually needed

### 8.3 Performance Considerations

1. **RAPTOR Rebuild is Expensive**
   - Full re-clustering of entire knowledge base
   - No incremental update mechanism
   - Admin trigger is blocking

2. **PDF Ingestion Memory**
   - `pdf2json` loaded via Webpack externals
   - Large PDFs may cause OOM on serverless

3. **No Connection Pooling Visibility**
   - Supabase client uses custom fetch with undici Agent
   - Pool size not explicitly configured

### 8.4 Security Notes

1. **Input Sanitization** (`src/lib/sanitize.ts`)
   - XSS prevention in user input
   - SQL injection prevented by parameterized queries
   - No CSRF protection (API routes use session cookies)

2. **Admin Access**
   - Single password, no 2FA
   - Admin emails whitelist (`src/lib/admin-emails.ts`)

3. **Guest Mode**
   - Passcode-based guest access
   - No account linking for guest messages

### 8.5 Operational Notes

1. **Dual Deploy Complexity**
   - Netlify + Vercel may drift over time
   - Consider unifying to single platform

2. **31 Database Migrations**
   - Some migrations are out of order (e.g., `016` RAPTOR before `015` user profiles)
   - No migration rollback tests

3. **Redis Cache Invalidation**
   - No TTL on Tier 1 (exact cache)
   - Manual invalidation only
   - May grow unbounded

4. **SSE Connection Limits**
   - Browsers limit SSE connections
   - Long conversations may cause reconnection issues

---

## 9. Recommended Starting Points for a New Developer

### Phase 1: Orientation (Day 1)

1. **Read `CLAUDE.md`** — This is your AI agent instruction file with tech stack, pipeline flow, and debugging checklist

2. **Read `README.md`** — 3200+ line comprehensive documentation

3. **Understand the 6-Phase RAG Pipeline**:
   ```
   Translation → Conversation Retrieval → Cache Check → 
   RAG Retrieval (HYDE + BM25 + RAPTOR + Graph) → 
   Reranking → LLM Generation → SSE Streaming
   ```

4. **Set up local environment**:
   ```bash
   cp .env.example .env.local
   # Fill in Supabase, OpenAI, Upstash credentials
   npm install
   npm run dev
   ```

### Phase 2: Core Concepts (Days 2-3)

1. **Start with `src/lib/pipeline.ts`** (1148 lines) — The pipeline orchestrator
   - Understand `runPipeline()` and `buildRetrievalPlan()`

2. **Then `src/lib/rag-engine.ts`** (986 lines) — The RAG core
   - Understand HYDE, MMR, cross-encoder reranking

3. **Then `src/app/api/chat/route.ts`** (895 lines) — The API entry
   - Understand request flow, rate limiting, SSE

4. **Finally `src/lib/cache.ts`** (410 lines) — The caching layer
   - Understand 2-tier + local LRU

### Phase 3: UI Understanding (Days 4-5)

1. **Read `src/app/page.tsx`** (938 lines) — Main chat interface
   - Focus on `useChatStream` hook integration

2. **Read `src/app/admin/page.tsx`** (1428 lines) — Admin dashboard
   - Understand the 8-tab architecture

3. **Explore `src/components/`** — UI building blocks

### Phase 4: Database & Scripts (Days 6-7)

1. **Review `supabase/migrations/001_setup_pgvector.sql`** — Schema foundation

2. **Read key scripts**:
   - `scripts/ingest-pdf.ts` — PDF ingestion
   - `scripts/audit-kb.ts` — Knowledge base audit

### Debugging Guide

1. **Chat not working?**
   - Check `/api/chat` logs
   - Verify rate limiting not triggered
   - Check cache hit/miss in pipeline metrics

2. **Poor retrieval quality?**
   - Check `rag_settings` table
   - Adjust `similarity_threshold` (try 0.75)
   - Check `bm25_weight` (try 0.40)

3. **Slow responses?**
   - Check `pipeline-metrics` in admin
   - Check Upstash Redis latency
   - Check Supabase pgvector query time

4. **Cache issues?**
   - Clear cache: `scripts/clear.ts`
   - Check Redis connection
   - Verify pgvector index exists

### Key Files by Feature

| Feature | Start Here |
|---------|------------|
| Adding new diagram type | `src/app/api/diagram/route.ts` |
| Tuning RAG settings | Admin UI > RAG Settings tab |
| Adding new entity type | `src/lib/knowledge-graph.ts` |
| Changing LLM prompt | `src/lib/pipeline.ts` → `buildSystemPrompt()` |
| Modifying chunking | `src/app/api/admin/ingest/route.ts` |
| Adding new language | `src/lib/pipeline.ts` → translation section |
| Rate limit tuning | `src/lib/rate-limiter.ts` |

### Common Tasks Checklist

- [ ] Add new diagram template → Edit `src/app/api/diagram/route.ts`
- [ ] Tune retrieval quality → Admin > RAG Settings
- [ ] Add new entity extractor → Edit `src/lib/knowledge-graph.ts`
- [ ] Change LLM provider → Edit `src/lib/llm.ts` + env vars
- [ ] Add new admin endpoint → Create `src/app/api/admin/[name]/route.ts`
- [ ] Modify UI styling → Edit `src/app/globals.css`
- [ ] Add new conversation feature → Edit `src/app/page.tsx`

---

## 10. Appendix

### A. Environment Variables Reference

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI/LLM
OPENAI_API_KEY=
GOOGLE_GENERATIVE_API_KEY=
HUGGINGFACE_API_KEY=

# Sarvam AI (primary LLM for India)
SARVAM_API_KEY=

# Vector Search
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=

# Cache & Rate Limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Email
RESEND_API_KEY=

# Admin
ADMIN_PASSWORD=

# Optional
NEXT_PUBLIC_BASE_URL=
NEXT_PUBLIC_APP_URL=
```

### B. API Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/chat` | Main chat pipeline |
| GET/POST | `/api/diagram` | Diagram generation |
| GET | `/api/conversations` | List conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/[id]` | Get conversation |
| PUT | `/api/conversations/[id]` | Update conversation |
| DELETE | `/api/conversations/[id]` | Delete conversation |
| GET/POST | `/api/conversations/[id]/messages` | Messages |
| POST | `/api/transcribe` | Audio transcription |
| GET | `/api/admin/analytics` | Analytics data |
| POST | `/api/admin/ingest` | Trigger ingestion |
| POST | `/api/admin/raptor` | Rebuild RAPTOR |
| GET/POST | `/api/admin/graph` | Knowledge graph |
| POST | `/api/admin/feedback` | Submit feedback |
| GET | `/api/admin/metrics` | Pipeline metrics |
| GET | `/api/admin/metrics/stream` | SSE metrics |

### C. Database Tables

| Table | Purpose |
|-------|---------|
| `knowledge_base` | Vector chunks for RAG |
| `conversations` | User conversation threads |
| `messages` | Individual messages |
| `users` | User profiles |
| `feedback` | User feedback |
| `diagrams` | Diagram chunks |
| `unknown_questions` | Unanswered queries |
| `rag_evaluations` | Answer quality |
| `semantic_cache` | Cached responses |
| `rate_limits` | IP rate tracking |
| `observability_logs` | Pipeline logs |
| `pipeline_metrics` | Performance data |
| `rag_settings` | Runtime config |
| `knowledge_graph_entities` | Graph entities |
| `knowledge_graph_relations` | Graph edges |

---

*Report generated by Matrix Agent — Codebase Analysis System*