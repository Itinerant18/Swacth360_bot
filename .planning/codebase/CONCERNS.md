# Concerns, Risks & Technical Debt

## 1. Security & Configuration
- **Environment Variable Proliferation**: The project relies on a large number of sensitive environment variables (`OPENAI_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `HUGGINGFACE_API_KEY`, `PINECONE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Inconsistent Error Handling**: Some core libraries (like `reranker.ts`) fail silently or return empty results when keys are missing, while others (like `embeddings.ts`) throw hard errors. This could lead to unpredictable behavior in production.
- **Reranker Exposure**: The reranking logic currently relies on a HuggingFace API key which was not listed in the primary tech stack, indicating "hidden" dependencies.

## 2. Architectural Complexity (RAG Debt)
- **Dual Vector DB Strategy**: The project currently uses `pgvector` (Supabase) but includes scripts and dependencies for `Pinecone`. Managing two vector databases increases maintenance overhead and data synchronization risks.
- **Logic Overload in `src/lib`**: The `src/lib` directory is highly congested with 20+ complex logic files. Files like `rag-engine.ts` (39KB) and `raptor-builder.ts` are becoming monolithic and difficult to unit test.
- **Experimental Bloat**: Features like `Knowledge Graph`, `RAPTOR`, and `Query Decomposition` are implemented but their relative performance impact isn't clearly documented or togglable, making the system "heavy" by default.

## 3. Dependency & Versioning
- **Major Version Lag**: The `ai` (Vercel AI SDK) package is at `v4.x` while `v6.x` is available. Upgrading may involve significant breaking changes in streaming logic.
- **LangChain Fragmentation**: The project uses multiple `@langchain/*` sub-packages which are frequently updated. Keeping these in sync across the monorepo-style structure is a constant maintenance task.
- **Redundant PDF Libraries**: The project includes `pdf-parse`, `pdf2json`, and `pdfjs-dist`. This redundancy increases bundle size and maintenance complexity for document ingestion.

## 4. Testing & Validation
- **Lack of Unit Tests**: There are no standard unit testing frameworks (Jest/Vitest) configured. The project relies on `tsx` scripts for smoke tests and benchmarks, which are insufficient for a complex RAG system.
- **Benchmark Dependency**: Factual and diagnostic benchmarks exist but aren't integrated into a CI/CD pipeline, meaning regressions in retrieval quality might go unnoticed.

## 5. Performance Risks
- **Cold Start Latency**: With Next.js 16 and a heavy RAG engine, cold starts on serverless platforms (Netlify/Vercel) might be significant.
- **Reranking Overhead**: The cross-encoder reranking step adds significant latency to every request. Without aggressive caching, user-perceived speed may suffer.
