# Codebase Structure

**Analysis Date:** 2025-03-24

## Directory Layout

```
tech-support-ai/
├── data/               # Source data (PDFs, Diagrams, JSONL)
├── public/             # Static assets (SVGs, favicon)
├── scripts/            # Ingestion, seeding, and utility scripts
├── src/                # Application source code
│   ├── app/            # Next.js App Router (Routes & API)
│   ├── components/     # UI Components
│   └── lib/            # Core RAG logic and utilities
├── supabase/           # Database migrations and configuration
├── tests/              # Smoke tests and integration tests
└── .planning/          # GSD planning and codebase mapping
```

## Directory Purposes

**data/:**
- Purpose: Contains the raw technical material used to populate the knowledge base.
- Contains: `pdf/`, `diagrams/` (markdown descriptions).
- Key files: `data/diagrams/ademco_contact_id_protocol_full_reference.md`

**scripts/:**
- Purpose: CLI tools for administrative tasks and data pipeline management.
- Contains: Ingestion scripts for different formats, database seeding scripts.
- Key files: `scripts/ingest-pdf.ts`, `scripts/seed-supabase.ts`, `scripts/audit-kb.ts`.

**src/app/:**
- Purpose: Defines the application's page structure and server-side API endpoints.
- Contains: Next.js pages (`page.tsx`) and API route handlers (`route.ts`).
- Key files: `src/app/page.tsx` (Chat UI), `src/app/api/chat/route.ts` (Core Pipeline).

**src/lib/:**
- Purpose: The "Brain" of the application. High-performance, modular RAG logic.
- Contains: Retrieval algorithms, query processors, and third-party client wrappers.
- Key files: `src/lib/rag-engine.ts`, `src/lib/raptor-builder.ts`, `src/lib/hybrid-search.ts`.

**supabase/migrations/:**
- Purpose: SQL schema definitions and database evolution tracking.
- Contains: Vector search setup, RAG performance optimizations, and hierarchical indexing schemas.
- Key files: `supabase/migrations/013_enhanced_rag.sql`, `supabase/migrations/016_raptor_hierarchical_index.sql`.

## Key File Locations

**Entry Points:**
- `src/app/api/chat/route.ts`: Main entry for chat requests.
- `src/app/page.tsx`: Main chat interface.

**Configuration:**
- `next.config.ts`: Next.js configuration.
- `src/lib/rag-settings.ts`: Runtime RAG configuration management.
- `package.json`: Project dependencies and scripts.

**Core Logic:**
- `src/lib/rag-engine.ts`: Core retrieval and ranking logic.
- `src/lib/sarvam.ts`: Sarvam AI LLM integration.
- `src/lib/supabase.ts`: Supabase client and helper functions.

**Testing:**
- `tests/admin-smoke.test.ts`: Automated smoke tests for the admin dashboard.

## Naming Conventions

**Files:**
- Components: PascalCase (`DiagramCard.tsx`)
- Utilities/Logic: kebab-case or camelCase (`rag-engine.ts`, `auth.ts`)
- API Routes: Always `route.ts` inside a directory.

**Directories:**
- Route segments: Lowercase (`src/app/admin`)
- Dynamic segments: `[param]` (`src/app/api/conversations/[id]`)

## Where to Add New Code

**New RAG Strategy:**
- Implementation: Add to `src/lib/` (e.g., `src/lib/new-strategy.ts`).
- Integration: Update `src/lib/rag-engine.ts` or `src/lib/logical-router.ts`.

**New UI Feature:**
- Primary code: `src/components/`
- Integration: Update `src/app/page.tsx` or create a new route in `src/app/`.

**New Data Source:**
- Source file: Add to `data/`
- Ingestion script: Update or create a script in `scripts/`.
- Schema: Add a migration to `supabase/migrations/`.

## Special Directories

**.planning/:**
- Purpose: Stores codebase maps, architectural decisions, and phase plans for GSD.
- Generated: No
- Committed: Yes

**system-prompts-and-models-of-ai-tools/:**
- Purpose: Reference library for prompt engineering and AI model research (likely a submodule).
- Generated: No
- Committed: Yes

---

*Structure analysis: 2025-03-24*
