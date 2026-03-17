/**
 * src/lib/semantic-chunker.ts
 *
 * Semantic Chunking for Knowledge Base Ingestion
 *
 * Instead of splitting documents at fixed character boundaries,
 * this chunker splits at natural topic boundaries by measuring
 * embedding similarity between consecutive sentences.
 *
 * When similarity drops below a threshold, a chunk boundary is inserted.
 * This produces chunks that are topically coherent — dramatically
 * improving retrieval precision vs fixed-size chunking.
 *
 * Algorithm:
 * 1. Split text into sentences
 * 2. Group sentences into windows (3-sentence sliding window)
 * 3. Embed each window
 * 4. Compute cosine similarity between consecutive windows
 * 5. Where similarity drops below threshold → chunk boundary
 * 6. Merge small chunks and split oversized ones
 */

import { embedTexts } from './embeddings';

export interface SemanticChunk {
    content: string;
    sentenceCount: number;
    startIndex: number;
    endIndex: number;
    avgEmbeddingSimilarity: number;
}

export interface SemanticChunkerOptions {
    /** Similarity threshold below which a boundary is placed (0-1). Default: 0.75 */
    similarityThreshold?: number;
    /** Minimum chunk size in characters. Default: 100 */
    minChunkSize?: number;
    /** Maximum chunk size in characters. Default: 1500 */
    maxChunkSize?: number;
    /** Sliding window size in sentences. Default: 3 */
    windowSize?: number;
    /** Batch size for embedding API calls. Default: 20 */
    embeddingBatchSize?: number;
}

const DEFAULTS: Required<SemanticChunkerOptions> = {
    similarityThreshold: 0.75,
    minChunkSize: 100,
    maxChunkSize: 1500,
    windowSize: 3,
    embeddingBatchSize: 20,
};

/**
 * Split text into sentences using regex-based sentence boundary detection.
 */
function splitSentences(text: string): string[] {
    // Split on sentence-ending punctuation, keeping abbreviations intact
    const raw = text.match(/[^.!?\n]+(?:[.!?](?:\s|$)|\n|$)/g) || [text];
    return raw
        .map(s => s.trim())
        .filter(s => s.length > 5); // filter out very short fragments
}

/**
 * Create sliding windows of sentences for embedding.
 */
function createWindows(sentences: string[], windowSize: number): string[] {
    const windows: string[] = [];
    for (let i = 0; i < sentences.length; i++) {
        const window = sentences.slice(i, i + windowSize).join(' ');
        windows.push(window);
    }
    return windows;
}

/**
 * Cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find boundary indices where similarity drops below threshold.
 */
function findBoundaries(
    similarities: number[],
    threshold: number,
): number[] {
    const boundaries: number[] = [];

    // Use percentile-based adaptive threshold if we have enough data
    if (similarities.length > 5) {
        const sorted = [...similarities].sort((a, b) => a - b);
        const p25 = sorted[Math.floor(sorted.length * 0.25)];
        // Use the lower of: absolute threshold or 25th percentile
        const adaptiveThreshold = Math.min(threshold, p25 + 0.02);

        for (let i = 0; i < similarities.length; i++) {
            if (similarities[i] < adaptiveThreshold) {
                boundaries.push(i + 1); // boundary AFTER this sentence
            }
        }
    } else {
        for (let i = 0; i < similarities.length; i++) {
            if (similarities[i] < threshold) {
                boundaries.push(i + 1);
            }
        }
    }

    return boundaries;
}

/**
 * Merge chunks that are too small and split chunks that are too large.
 */
function normalizeChunks(
    chunks: string[],
    minSize: number,
    maxSize: number,
): string[] {
    const normalized: string[] = [];
    let buffer = '';

    for (const chunk of chunks) {
        buffer = buffer ? `${buffer} ${chunk}` : chunk;

        if (buffer.length >= minSize) {
            // If too large, split at sentence boundaries
            if (buffer.length > maxSize) {
                const sentences = splitSentences(buffer);
                let current = '';
                for (const sentence of sentences) {
                    if (current.length + sentence.length > maxSize && current.length >= minSize) {
                        normalized.push(current.trim());
                        current = sentence;
                    } else {
                        current = current ? `${current} ${sentence}` : sentence;
                    }
                }
                if (current.trim()) {
                    buffer = current;
                } else {
                    buffer = '';
                }
            } else {
                normalized.push(buffer.trim());
                buffer = '';
            }
        }
    }

    // Don't lose remaining content
    if (buffer.trim()) {
        if (normalized.length > 0 && buffer.length < minSize) {
            // Append to last chunk if too small
            normalized[normalized.length - 1] += ' ' + buffer.trim();
        } else {
            normalized.push(buffer.trim());
        }
    }

    return normalized;
}

/**
 * semanticChunk()
 *
 * Main entry point: splits a document into semantically coherent chunks.
 *
 * @param text - The document text to chunk
 * @param options - Chunking configuration
 * @returns Array of semantic chunks with metadata
 */
export async function semanticChunk(
    text: string,
    options: SemanticChunkerOptions = {},
): Promise<SemanticChunk[]> {
    const opts = { ...DEFAULTS, ...options };

    // Step 1: Split into sentences
    const sentences = splitSentences(text);

    if (sentences.length <= 3) {
        // Too short to chunk semantically — return as one chunk
        return [{
            content: text.trim(),
            sentenceCount: sentences.length,
            startIndex: 0,
            endIndex: sentences.length - 1,
            avgEmbeddingSimilarity: 1.0,
        }];
    }

    // Step 2: Create sliding windows
    const windows = createWindows(sentences, opts.windowSize);

    // Step 3: Embed all windows in batches
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < windows.length; i += opts.embeddingBatchSize) {
        const batch = windows.slice(i, i + opts.embeddingBatchSize);
        const batchEmbeddings = await embedTexts(batch);
        allEmbeddings.push(...batchEmbeddings);
    }

    // Step 4: Compute similarities between consecutive windows
    const similarities: number[] = [];
    for (let i = 0; i < allEmbeddings.length - 1; i++) {
        similarities.push(cosineSimilarity(allEmbeddings[i], allEmbeddings[i + 1]));
    }

    // Step 5: Find boundaries
    const boundaries = findBoundaries(similarities, opts.similarityThreshold);

    // Step 6: Create raw chunks from boundaries
    const rawChunks: string[] = [];
    let start = 0;
    for (const boundary of boundaries) {
        const chunk = sentences.slice(start, boundary).join(' ');
        if (chunk.trim()) rawChunks.push(chunk.trim());
        start = boundary;
    }
    // Last chunk
    const lastChunk = sentences.slice(start).join(' ');
    if (lastChunk.trim()) rawChunks.push(lastChunk.trim());

    // Step 7: Normalize sizes
    const normalizedChunks = normalizeChunks(rawChunks, opts.minChunkSize, opts.maxChunkSize);

    // Step 8: Build result with metadata
    let sentenceIdx = 0;
    const result: SemanticChunk[] = normalizedChunks.map(content => {
        const chunkSentences = splitSentences(content);
        const startIndex = sentenceIdx;
        sentenceIdx += chunkSentences.length;
        const endIndex = sentenceIdx - 1;

        // Average similarity within this chunk's range
        const relevantSims = similarities.slice(
            Math.max(0, startIndex),
            Math.min(similarities.length, endIndex),
        );
        const avgSim = relevantSims.length > 0
            ? relevantSims.reduce((s, v) => s + v, 0) / relevantSims.length
            : 1.0;

        return {
            content,
            sentenceCount: chunkSentences.length,
            startIndex,
            endIndex,
            avgEmbeddingSimilarity: avgSim,
        };
    });

    return result;
}

/**
 * Fixed-size fallback chunker for when semantic chunking
 * would be too expensive (e.g., very large documents).
 * Uses overlap to maintain context across boundaries.
 */
export function fixedChunkWithOverlap(
    text: string,
    chunkSize: number = 800,
    overlap: number = 100,
): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + chunkSize;

        // Try to break at a sentence boundary
        if (end < text.length) {
            const lastPeriod = text.lastIndexOf('.', end);
            if (lastPeriod > start + chunkSize * 0.5) {
                end = lastPeriod + 1;
            }
        }

        chunks.push(text.slice(start, end).trim());
        start = end - overlap;
    }

    return chunks.filter(c => c.length > 20);
}
