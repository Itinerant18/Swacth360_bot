export interface SemanticCacheHit {
    hit: true;
    answer: string;
    similarity: number;
    confidence: number;
    answerMode: string;
    hitCount: number;
}

export interface SemanticCacheMiss {
    hit: false;
}

export type SemanticCacheResult = SemanticCacheHit | SemanticCacheMiss;

interface SemanticCacheEntry {
    normalizedQuery: string;
    queryEmbedding: number[];
    answer: string;
    confidence: number;
    answerMode: string;
    language: string;
    hitCount: number;
    createdAt: number;
    expiresAt: number;
}

const CACHE_TTL_MS = parseInt(process.env.SEMANTIC_RESPONSE_CACHE_TTL_MS || '900000', 10);
const CACHE_THRESHOLD = parseFloat(process.env.SEMANTIC_RESPONSE_CACHE_THRESHOLD || '0.92');
const CACHE_MAX_ENTRIES = parseInt(process.env.SEMANTIC_RESPONSE_CACHE_MAX_ENTRIES || '250', 10);
const CACHE_MIN_CONFIDENCE = parseFloat(process.env.SEMANTIC_RESPONSE_CACHE_MIN_CONFIDENCE || '0.74');

const entries: SemanticCacheEntry[] = [];

function normalizeQuery(query: string): string {
    return query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\s+([?!.:,])/g, '$1');
}

function cosineSimilarity(left: number[], right: number[]): number {
    if (left.length === 0 || left.length !== right.length) {
        return 0;
    }

    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let index = 0; index < left.length; index++) {
        dot += left[index] * right[index];
        leftNorm += left[index] * left[index];
        rightNorm += right[index] * right[index];
    }

    if (leftNorm === 0 || rightNorm === 0) {
        return 0;
    }

    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function purgeExpiredEntries(): void {
    const now = Date.now();
    for (let index = entries.length - 1; index >= 0; index--) {
        if (entries[index].expiresAt <= now) {
            entries.splice(index, 1);
        }
    }
}

export function checkSemanticCache(params: {
    query: string;
    queryEmbedding: number[];
    threshold?: number;
}): SemanticCacheResult {
    const { query, queryEmbedding, threshold = CACHE_THRESHOLD } = params;
    purgeExpiredEntries();

    const normalizedQuery = normalizeQuery(query);
    let best: SemanticCacheEntry | null = null;
    let bestSimilarity = 0;

    for (const entry of entries) {
        const similarity = normalizedQuery === entry.normalizedQuery
            ? 1
            : cosineSimilarity(queryEmbedding, entry.queryEmbedding);

        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            best = entry;
        }
    }

    if (!best || bestSimilarity < threshold) {
        return { hit: false };
    }

    best.hitCount += 1;

    return {
        hit: true,
        answer: best.answer,
        similarity: bestSimilarity,
        confidence: best.confidence,
        answerMode: best.answerMode,
        hitCount: best.hitCount,
    };
}

export function storeSemanticCache(params: {
    query: string;
    queryEmbedding: number[];
    answer: string;
    answerMode: string;
    language: string;
    confidence: number;
    ttlMs?: number;
}): void {
    const {
        query,
        queryEmbedding,
        answer,
        answerMode,
        language,
        confidence,
        ttlMs = CACHE_TTL_MS,
    } = params;

    if (answerMode === 'general' || answerMode === 'rag_partial') {
        return;
    }

    if (confidence < CACHE_MIN_CONFIDENCE || answer.trim().length < 24) {
        return;
    }

    purgeExpiredEntries();
    const normalizedQuery = normalizeQuery(query);
    const now = Date.now();
    const existingIndex = entries.findIndex((entry) =>
        entry.normalizedQuery === normalizedQuery
        || cosineSimilarity(entry.queryEmbedding, queryEmbedding) >= 0.98
    );

    const nextEntry: SemanticCacheEntry = {
        normalizedQuery,
        queryEmbedding: [...queryEmbedding],
        answer,
        confidence,
        answerMode,
        language,
        hitCount: existingIndex >= 0 ? entries[existingIndex].hitCount : 0,
        createdAt: existingIndex >= 0 ? entries[existingIndex].createdAt : now,
        expiresAt: now + ttlMs,
    };

    if (existingIndex >= 0) {
        entries.splice(existingIndex, 1, nextEntry);
    } else {
        entries.unshift(nextEntry);
    }

    while (entries.length > CACHE_MAX_ENTRIES) {
        entries.pop();
    }
}

export function getSemanticCacheStats(): {
    size: number;
    threshold: number;
    ttlMs: number;
    avgHitCount: number;
} {
    purgeExpiredEntries();

    const avgHitCount = entries.length > 0
        ? entries.reduce((sum, entry) => sum + entry.hitCount, 0) / entries.length
        : 0;

    return {
        size: entries.length,
        threshold: CACHE_THRESHOLD,
        ttlMs: CACHE_TTL_MS,
        avgHitCount: Number(avgHitCount.toFixed(2)),
    };
}
