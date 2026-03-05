/**
 * src/lib/embeddings.ts
 *
 * Embedding utility — OpenAI text-embedding-3-small (1536 dimensions).
 * Used everywhere: chat route, seed-answer, ingest API.
 *
 * Why text-embedding-3-small?
 *  - Better quality than ada-002 at 5x lower price
 *  - 1536 dims (upgraded from 768 nomic-embed-text)
 *  - No local dependency — works on Vercel, anywhere
 */

import { OpenAIEmbeddings } from '@langchain/openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';

// Singleton — reuse across requests (avoids recreating on every call)
let _embeddings: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
    if (!_embeddings) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('Missing OPENAI_API_KEY in environment variables');

        _embeddings = new OpenAIEmbeddings({
            modelName: EMBEDDING_MODEL,
            openAIApiKey: apiKey,
        });
    }
    return _embeddings;
}

/**
 * Embed a single text string → 1536-dimensional vector.
 * Used in: chat/route.ts, admin/seed-answer, admin/ingest
 */
export async function embedText(text: string): Promise<number[]> {
    return getEmbeddings().embedQuery(text);
}

/**
 * Embed multiple texts in batch.
 * More efficient than calling embedText() in a loop.
 * Used in: seed-supabase.ts, ingest-pdf.ts
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
    return getEmbeddings().embedDocuments(texts);
}