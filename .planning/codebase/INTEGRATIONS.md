# Integrations

## Core Infrastructure
- **Supabase**: Primary Backend-as-a-Service (BaaS).
  - **Auth**: User management and authentication.
  - **Database**: Relational data storage (PostgreSQL).
  - **Vector Search**: Powering the RAG engine via `pgvector`.
  - **Configuration**: Managed via `src/lib/supabase.ts`.

- **Upstash**: Cloud Redis integration for caching.
  - **Role**: Tier 1 cache for exact query matches.
  - **Configuration**: Managed via `src/lib/cache.ts`.

## AI Providers
- **OpenAI API**: 
  - Used for generating high-dimensional embeddings and powering conversational responses.
  - Integrated via `src/lib/embeddings.ts` and LangChain providers.

- **Google AI (Gemini)**: 
  - Integrated for multi-model fallback and specialized reasoning tasks.

- **Sarvam AI**: 
  - Specialized integration for technical reasoning models.
  - Handles the stripping of `<think>` tags and post-processing of reasoning model outputs.

## Communication & Delivery
- **Resend**: 
  - API-based email integration for support ticket notifications and system alerts.

- **Netlify**:
  - CI/CD and hosting integration with support for Next.js server-side features and Netlify Functions.

## Documentation & Visualization
- **Mermaid.js**: In-browser rendering of technical diagrams (Ademco protocols, sensor logic).
- **Lucide/FontAwesome**: External icon set delivery.
