# Technology Stack

## Core Frameworks & Languages
- **Next.js 16.1.6**: React framework with App Router support.
- **React 19.2.3**: Component-based UI library.
- **TypeScript**: Typed JavaScript for better DX and safety.

## AI & Machine Learning (RAG Engine)
- **OpenAI**: Core embedding and completion models.
  - `text-embedding-3-small` (1536 dimensions).
  - GPT-4o for high-quality responses.
- **LangChain**: Primary orchestration framework for RAG.
  - `@langchain/openai`, `@langchain/community`, `@langchain/core`.
- **Google Generative AI**: Gemini Pro integration for alternative LLM paths.
- **Sarvam AI**: Specialized handling for technical reasoning and reasoning model outputs (e.g., `<think>` tag removal).

## Data & Storage
- **Supabase (PostgreSQL)**: Primary database provider.
  - **pgvector**: Used for semantic search and high-dimensional vector storage.
- **Upstash Redis**: Used for low-latency exact-match caching of common queries.

## Frontend & Styling
- **Tailwind CSS 4**: Utility-first CSS framework for modern styling.
- **Lucide React & FontAwesome**: Iconography.
- **Mermaid.js**: Dynamic diagram generation (e.g., system flows, protocols).
- **Recharts**: Data visualization for support analytics.

## Backend Utilities
- **Resend**: Transactional email delivery service for support notifications.
- **Netlify**: Deployment and hosting platform with specific Next.js plugin support.

## Sophisticated RAG Components
- **HYDE (Hypothetical Document Embeddings)**: Improving retrieval accuracy.
- **Multi-Vector Retrieval**: For handling complex document structures.
- **Cross-Encoder Reranking**: Final selection of relevant context.
- **Contextual Compression**: Optimizing LLM prompt window usage.
