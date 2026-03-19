# Architecture

**Analysis Date:** 2025-03-24

## Pattern Overview

**Overall:** Modular AI-native RAG (Retrieval-Augmented Generation) system.

**Key Characteristics:**
- **Advanced RAG Pipeline:** Multi-vector retrieval, HYDE (Hypothetical Document Embeddings), and cross-encoder reranking.
- **Hierarchical Context:** Implementation of RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval) for managing long-context technical manuals.
- **Multilingual Support:** Native Bengali and Hindi support via translation layers and domain-specific embeddings.
- **Semantic Caching:** Two-tier caching (exact and semantic match) to optimize performance and reduce LLM costs.

## Layers

**Frontend Layer:**
- Purpose: Provides a chat interface, admin dashboard, and visualization tools.
- Location: `src/app`, `src/components`
- Contains: React components, Next.js pages, and client-side state.
- Depends on: API Layer
- Used by: End users and administrators.

**API Layer:**
- Purpose: Orchestrates the RAG pipeline, handles authentication, and manages data persistence.
- Location: `src/app/api`
- Contains: Next.js Route Handlers for chat, ingestion, analytics, and diagram generation.
- Depends on: Core Logic Layer, Supabase (DB/Auth)
- Used by: Frontend Layer

**Core Logic Layer (RAG Engine):**
- Purpose: Implements the intelligence of the system (retrieval, ranking, query analysis).
- Location: `src/lib`
- Contains: `rag-engine.ts`, `hybrid-search.ts`, `raptor-retrieval.ts`, `query-decomposer.ts`.
- Depends on: Supabase Client, LLM Clients (Sarvam, OpenAI)
- Used by: API Layer

**Data Layer:**
- Purpose: Stores knowledge base chunks, embeddings, conversation history, and user profiles.
- Location: `supabase/migrations`, `data/`
- Contains: SQL schema for `pgvector` enabled tables, PDF source files, and JSONL data.
- Depends on: Supabase (Postgres + pgvector)
- Used by: Core Logic Layer

## Data Flow

**User Chat Request:**

1. **Request Ingestion:** `src/app/api/chat/route.ts` receives user message, language preference, and conversation ID.
2. **Preprocessing:** Message is translated to English (if needed) and rewritten for context (resolving pronouns) using `src/lib/conversation-retrieval.ts`.
3. **Retrieval Strategy Selection:** `src/lib/logical-router.ts` decides between vector search, relational DB query, or hybrid search based on query classification.
4. **Multi-Vector Retrieval:** `src/lib/rag-engine.ts` fetches candidates using original query, HYDE hypothetical answer, and expanded query terms from `src/lib/embeddings.ts`.
5. **Reranking:** Candidates are scored and sorted using a cross-encoder heuristic and BM25 in `src/lib/rag-engine.ts`.
6. **Augmentation:** Top chunks are compressed to relevant passages and injected into the system prompt.
7. **Generation:** LLM (Sarvam AI) generates the final answer in the user's preferred language.
8. **Persistence & Caching:** Answer is stored in conversation history and semantic cache (`src/lib/cache.ts`).

**Knowledge Ingestion:**

1. **Extraction:** `scripts/ingest-pdf.ts` or `scripts/ingest-jsonl.ts` extracts text/metadata from source files.
2. **Chunking:** `src/lib/semantic-chunker.ts` splits text into logically coherent segments.
3. **Indexing:** `src/lib/embeddings.ts` generates vector embeddings.
4. **Hierarchical Processing:** `src/lib/raptor-builder.ts` recursively summarizes chunks to create a tree-structured index.
5. **Storage:** Chunks and embeddings are stored in Supabase `knowledge_chunks` table.

**State Management:**
- Server-side state: Handled by Supabase (Postgres) for persistence.
- Client-side state: React hooks and Next.js built-in state management.
- Cache: Two-tier cache (Redis-like behavior implemented via Supabase) in `src/lib/cache.ts`.

## Key Abstractions

**RAG Engine:**
- Purpose: Central entry point for all retrieval operations.
- Examples: `src/lib/rag-engine.ts`
- Pattern: Strategy pattern for different search modes (MMR, Weighted, Hybrid).

**Query Intelligence:**
- Purpose: Classifies and expands user queries before retrieval.
- Examples: `src/lib/query-decomposer.ts`, `src/lib/query-expansion.ts`.
- Pattern: Pipeline pattern.

**Diagram Engine:**
- Purpose: Dynamically generates Mermaid.js diagrams for technical support.
- Examples: `src/app/api/diagram/route.ts`, `src/components/MermaidBlock.tsx`.
- Pattern: Template-based generation.

## Entry Points

**Chat API:**
- Location: `src/app/api/chat/route.ts`
- Triggers: User interaction in the chat UI.
- Responsibilities: Main RAG pipeline execution.

**Admin Dashboard:**
- Location: `src/app/admin/page.tsx`
- Triggers: Administrator access.
- Responsibilities: Monitoring RAG performance, managing settings, and trigger data ingestion.

**Ingestion Scripts:**
- Location: `scripts/`
- Triggers: Manual execution or cron jobs.
- Responsibilities: Populating the knowledge base from raw data.

## Error Handling

**Strategy:** Graceful degradation with fallback responses.

**Patterns:**
- **Translation Fallback:** If translation fails, use the original text with a warning.
- **RAG Fallback:** If retrieval confidence is low, redirect to general industrial automation expertise or technical support.
- **Rate Limiting:** `src/lib/rate-limiter.ts` prevents abuse at the API level.

## Cross-Cutting Concerns

**Logging:** Query analytics and evaluation results are logged to `chat_sessions` and `rag_evals` tables.
**Validation:** Zod schemas or basic runtime checks for API inputs.
**Authentication:** Managed via Supabase Auth with domain-restricted access configured in `src/lib/auth-server.ts`.

---

*Architecture analysis: 2025-03-24*
