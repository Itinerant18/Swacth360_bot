/**
 * Shared embedding utility for the entire app and all ingestion scripts.
 *
 * Requirements:
 * - Single embedding model everywhere
 * - Batch requests for throughput
 * - Retry on rate limits / transient failures
 * - Validate vector dimensions
 * - Deduplicate repeated inputs
 * - Reuse recent vectors in-memory
 */

import OpenAI from 'openai';

export const EMBEDDING_MODEL = 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_BATCH_SIZE = 64;

const EMBEDDING_CACHE_LIMIT = 2000;
const EMBEDDING_MAX_RETRIES = 4;

let openAIClient: OpenAI | null = null;
const embeddingCache = new Map<string, number[]>();

function getOpenAIClient(): OpenAI {
    if (!openAIClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('Missing OPENAI_API_KEY in environment variables');
        }

        openAIClient = new OpenAI({
            apiKey,
            maxRetries: 0,
            timeout: 30_000,
        });
    }

    return openAIClient;
}

function normalizeEmbeddingInput(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function rememberEmbedding(key: string, vector: number[]): void {
    if (embeddingCache.has(key)) {
        embeddingCache.delete(key);
    }

    embeddingCache.set(key, vector);

    while (embeddingCache.size > EMBEDDING_CACHE_LIMIT) {
        const oldestKey = embeddingCache.keys().next().value;
        if (!oldestKey) {
            break;
        }
        embeddingCache.delete(oldestKey);
    }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}

function getErrorStatus(error: unknown): number | null {
    if (typeof error !== 'object' || error === null || !('status' in error)) {
        return null;
    }

    const status = (error as { status?: unknown }).status;
    return typeof status === 'number' ? status : null;
}

function getErrorCode(error: unknown): string | null {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

function isRetryableEmbeddingError(error: unknown): boolean {
    const status = getErrorStatus(error);
    const code = getErrorCode(error);
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    return status === 429
        || (status !== null && status >= 500)
        || code === 'rate_limit_exceeded'
        || code === 'timeout'
        || message.includes('rate limit')
        || message.includes('timeout')
        || message.includes('temporarily unavailable');
}

function getRetryDelayMs(attempt: number): number {
    const baseDelay = 500 * (2 ** attempt);
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(8_000, baseDelay + jitter);
}

function validateEmbeddingVector(vector: number[], label: string): number[] {
    if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
            `[embeddings] ${label} returned ${vector.length} dimensions; expected ${EMBEDDING_DIMENSIONS}`,
        );
    }

    return vector;
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestEmbeddingBatch(batch: string[]): Promise<number[][]> {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= EMBEDDING_MAX_RETRIES; attempt++) {
        try {
            const response = await getOpenAIClient().embeddings.create({
                model: EMBEDDING_MODEL,
                input: batch,
                dimensions: EMBEDDING_DIMENSIONS,
            });

            if (response.data.length !== batch.length) {
                throw new Error(
                    `[embeddings] response count mismatch: got ${response.data.length}, expected ${batch.length}`,
                );
            }

            return response.data.map((item, index) =>
                validateEmbeddingVector(item.embedding, `input[${index}]`),
            );
        } catch (error) {
            lastError = error;
            const shouldRetry = attempt < EMBEDDING_MAX_RETRIES && isRetryableEmbeddingError(error);

            console.error('[embeddings] batch request failed', {
                attempt: attempt + 1,
                batchSize: batch.length,
                error: error instanceof Error ? error.message : String(error),
                retrying: shouldRetry,
            });

            if (!shouldRetry) {
                break;
            }

            await sleep(getRetryDelayMs(attempt));
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error('[embeddings] unknown embedding failure');
}

export function clearEmbeddingCache(): void {
    embeddingCache.clear();
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
        return [];
    }

    const normalizedInputs = texts.map((text, index) => {
        const normalized = normalizeEmbeddingInput(text);
        if (!normalized) {
            throw new Error(`[embeddings] input[${index}] is empty after normalization`);
        }
        return normalized;
    });

    const uniqueMissingKeys: string[] = [];
    const uniqueMissingTexts: string[] = [];

    for (const normalized of normalizedInputs) {
        if (embeddingCache.has(normalized) || uniqueMissingKeys.includes(normalized)) {
            continue;
        }

        uniqueMissingKeys.push(normalized);
        uniqueMissingTexts.push(normalized);
    }

    const textBatches = chunkArray(uniqueMissingTexts, EMBEDDING_BATCH_SIZE);
    const keyBatches = chunkArray(uniqueMissingKeys, EMBEDDING_BATCH_SIZE);

    for (let index = 0; index < textBatches.length; index++) {
        const vectors = await requestEmbeddingBatch(textBatches[index]);
        keyBatches[index].forEach((key, vectorIndex) => {
            rememberEmbedding(key, vectors[vectorIndex]);
        });
    }

    return normalizedInputs.map((normalized, index) => {
        const vector = embeddingCache.get(normalized);
        if (!vector) {
            throw new Error(`[embeddings] missing cached vector for input[${index}]`);
        }
        return vector;
    });
}

export async function embedText(text: string): Promise<number[]> {
    const [vector] = await embedTexts([text]);
    return vector;
}
