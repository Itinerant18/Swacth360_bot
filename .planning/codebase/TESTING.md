# Testing Patterns

**Analysis Date:** 2025-05-14

## Test Framework

**Runner:**
- `tsx` (TypeScript Execution Engine) - No formal runner like Jest/Vitest detected.
- Config: Directly invoked in `package.json` scripts.

**Assertion Library:**
- `node:assert/strict` (Native Node.js assertions)

**Run Commands:**
```bash
npm run test:smoke      # Run admin smoke tests (tests/admin-smoke.test.ts)
npm run benchmark       # Run full RAG benchmark (scripts/run-rag-benchmark.ts)
```

## Test File Organization

**Location:**
- Smoke tests: `tests/*.test.ts`
- Evaluation/Benchmarks: `scripts/*.ts`

**Naming:**
- `[name].test.ts` for smoke tests.
- `run-[name]-benchmark.ts` for evaluation scripts.

**Structure:**
```
[project-root]/
├── scripts/            # Benchmarking and data-heavy scripts
└── tests/              # Manual/smoke tests
```

## Test Structure

**Suite Organization:**
```typescript
async function run(name: string, fn: () => Promise<void> | void) {
    await fn();
    console.log(`PASS ${name}`);
}

await run('test name', async () => {
    // Assertions
    assert.equal(actual, expected);
});
```

**Patterns:**
- `withEnv` helper: Temporarily overrides environment variables and restores them after the test.
- `NextRequest`: Directly instantiate `NextRequest` and pass to imported route handlers for API testing.
- Static Rendering: Render React components to HTML for basic structure assertions.

## Mocking

**Framework:** Manual mocking via helpers (like `withEnv`) or direct replacement of library calls (rarely seen, focus is on integration/smoke).

**What to Mock:**
- Environment variables (API keys, connection strings).
- Request/Response objects (using `NextRequest` and standard `Response`).

**What NOT to Mock:**
- Core business logic (RAG retrieval, query classification).
- Component rendering (tested via `react-dom/server`).

## Fixtures and Factories

**Test Data:**
- `data/rag-benchmark.json`: Dataset for benchmarking RAG performance.

**Location:**
- `./data/`

## Coverage

**Requirements:** None enforced in the current setup.

**View Coverage:** Not configured.

## Test Types

**Smoke Tests:**
- Basic functionality checks for API routes and admin dashboard.
- Error handling (e.g., missing API keys).
- Location: `tests/admin-smoke.test.ts`

**RAG Evaluation (Benchmarking):**
- Complex evaluation of RAG retrieval quality, latency, and faithfulness.
- Use of LLM-based scoring (`rag-evaluator.ts`).
- Location: `scripts/run-rag-benchmark.ts`

**Integration Tests:**
- Most tests act as lightweight integration tests, calling real handlers and rendering real components.

## Common Patterns

**Async Testing:**
- Use of `async/await` throughout all test files.
- Manual handling of asynchronous `run` calls.

**Error Testing:**
- Explicit tests for 400, 401, and 500 responses in API routes.
```typescript
const response = await ingestPost(request);
const body = await response.json();
assert.equal(response.status, 500);
```

---

*Testing analysis: 2025-05-14*
