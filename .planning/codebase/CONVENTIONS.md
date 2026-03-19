# Coding Conventions

**Analysis Date:** 2025-05-14

## Naming Patterns

**Files:**
- Components: PascalCase.tsx (e.g., `src/components/DiagramCard.tsx`, `src/components/FeedbackTab.tsx`)
- Library/Utils: kebab-case.ts (e.g., `src/lib/rag-engine.ts`, `src/lib/auth-server.ts`)
- App Routes: Standard Next.js kebab-case/bracket naming (e.g., `src/app/api/conversations/[id]/route.ts`)

**Functions:**
- Components: PascalCase (e.g., `export default function DiagramCard`)
- General functions: camelCase (e.g., `export function classifyQuery`)

**Variables:**
- General: camelCase
- Constants/Config: SCREAMING_SNAKE_CASE (e.g., `RETRIEVAL_CONFIG` in `src/lib/rag-engine.ts`)

**Types:**
- Interfaces and Types: PascalCase (e.g., `interface DiagramCardProps`, `type QueryType`)

## Code Style

**Formatting:**
- No explicit Prettier config found, but code follows a standard consistent style.
- Uses 4-space indentation in most files.
- Uses single quotes for strings in most places.

**Linting:**
- Tool: ESLint 9+
- Rules: Uses `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Custom ignores configured in `eslint.config.mjs` for `.next`, `out`, `build`.

## Import Organization

**Order:**
1. Standard library imports (`node:assert`, `fs`, `path`)
2. React and Next.js imports
3. Third-party library imports (`@langchain/*`, `@supabase/*`, `ai`)
4. Local project imports using `@/` alias or relative paths

**Path Aliases:**
- `@/*` mapped to `./src/*` (configured in `tsconfig.json`)

## Error Handling

**Patterns:**
- API routes: Returns JSON with `error` field and appropriate status codes (400 for bad request, 401 for unauthorized, 500 for server errors).
- Try-catch blocks used around async operations (e.g., Supabase calls, AI SDK invocations).
- Validation: Explicit checks for required parameters at the start of functions/routes.

## Logging

**Framework:** Standard `console` methods.

**Patterns:**
- Server-side: `console.log` for tracing complex processes like RAG retrieval or benchmarking.
- Warnings: `console.warn` for non-critical failures.
- Errors: `console.error` for critical failures.

## Comments

**When to Comment:**
- File headers: Most files start with a comment block explaining the file's purpose and location.
- Complex Logic: Extensive comments explaining RAG techniques (HYDE, MMR, Reranking) and technical domain knowledge (HMS panels).
- Section Dividers: Uses visual dividers like `// ─── Section Name ───`.

**JSDoc/TSDoc:**
- Used to describe function parameters and behavior for key library functions.

## Function Design

**Size:** Ranges from small utility functions to larger orchestrator functions (like `retrieve` in `src/lib/rag-engine.ts`).

**Parameters:** Uses options objects for functions with many parameters (e.g., `retrieve(query, llm, options)`) to maintain readability.

**Return Values:** Frequently returns structured objects (e.g., `RAGResult`) to provide rich metadata along with the main result.

## Module Design

**Exports:**
- Components: Typically `export default function`.
- Libraries: Mix of named exports for utilities and sometimes a primary orchestrator.

**Barrel Files:** Not extensively used; direct imports from `src/lib/file.ts` are more common.

---

*Convention analysis: 2025-05-14*
