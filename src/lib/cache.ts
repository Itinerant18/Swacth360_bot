/**
 * src/lib/cache.ts
 *
 * Two-Tier Query Cache for SAI HMS Bot
 *
 * Tier 1 - Exact Match (Upstash Redis)
 *   SHA-256(normalized query) -> Redis key -> cached answer
 *   Speed: < 5ms
 *
 * Tier 2 - Semantic Match (Supabase pgvector)
 *   embed(query) -> KNN search on semantic_cache table
 *   Threshold: 0.90 cosine similarity
 *   Speed: < 50ms
 */

import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';
import { getSupabase } from './supabase';

// Config

const CACHE_CONFIG = {
    TIER1_TTL_SECONDS: parseInt(process.env.CACHE_TTL_SECONDS || '600'),
    TIER2_THRESHOLD: parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || '0.90'),
    REDIS_KEY_PREFIX: 'sai:cache:v1:',
    MAX_ANSWER_LENGTH: 8000,
    MIN_ANSWER_LENGTH: 20,
    LOCAL_CACHE_MAX_ENTRIES: 200,
    MIN_CACHE_CONFIDENCE: parseFloat(process.env.MIN_CACHE_CONFIDENCE || '0.72'),
};

// Types

export interface CacheHit {
    answer: string;
    tier: 1 | 2;
    similarity?: number;
    hitCount?: number;
    cacheId?: string;
}

export interface CacheMiss {
    hit: false;
}

export type CacheResult = (CacheHit & { hit: true }) | CacheMiss;

// Redis Client (Tier 1)

let _redis: Redis | null = null;
const localTier1Cache = new Map<string, { answer: string; expiresAt: number }>();

function getRedis(): Redis | null {
    if (_redis) return _redis;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn('[cache] UPSTASH_REDIS env vars missing - Tier 1 cache disabled');
        return null;
    }

    _redis = new Redis({ url, token });
    return _redis;
}

// Tier 1 Helpers

const SUPPORTED_LANGUAGES = ['en', 'bn', 'hi'] as const;

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalizeCacheQuery(query: string): string {
    return query
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\s+([?!.:,])/g, '$1');
}

function normalizeLanguage(language?: string): SupportedLanguage {
    if (!language) return 'en';
    const normalized = language.trim().toLowerCase();
    return (SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage) ? normalized : 'en') as SupportedLanguage;
}

function buildLanguageCacheKey(language: SupportedLanguage, query: string): string {
    const normalized = normalizeCacheQuery(query);
    return `${language}:${normalized}`;
}

function hashQuery(query: string, language: SupportedLanguage): string {
    const normalized = buildLanguageCacheKey(language, query);
    return CACHE_CONFIG.REDIS_KEY_PREFIX + createHash('sha256').update(normalized).digest('hex');
}

function getLocalTier1(query: string, language: SupportedLanguage): string | null {
    const cacheKey = buildLanguageCacheKey(language, query);
    const cached = localTier1Cache.get(cacheKey);

    if (!cached) {
        return null;
    }

    if (cached.expiresAt < Date.now()) {
        localTier1Cache.delete(cacheKey);
        return null;
    }

    // Refresh insertion order for hot entries.
    localTier1Cache.delete(cacheKey);
    localTier1Cache.set(cacheKey, cached);
    return cached.answer;
}

function setLocalTier1(query: string, answer: string, language: SupportedLanguage): void {
    const cacheKey = buildLanguageCacheKey(language, query);
    const expiresAt = Date.now() + CACHE_CONFIG.TIER1_TTL_SECONDS * 1000;

    if (localTier1Cache.has(cacheKey)) {
        localTier1Cache.delete(cacheKey);
    }

    localTier1Cache.set(cacheKey, { answer, expiresAt });

    while (localTier1Cache.size > CACHE_CONFIG.LOCAL_CACHE_MAX_ENTRIES) {
        const oldestKey = localTier1Cache.keys().next().value;
        if (!oldestKey) {
            break;
        }
        localTier1Cache.delete(oldestKey);
    }
}

function deleteLocalTier1(query: string, language: SupportedLanguage): void {
    const cacheKey = buildLanguageCacheKey(language, query);
    localTier1Cache.delete(cacheKey);
}

async function tier1Get(query: string, language: SupportedLanguage): Promise<string | null> {
    const localHit = getLocalTier1(query, language);
    if (localHit) {
        console.log(`[cache] Local Tier 1 HIT (${language}) - "${query.slice(0, 60)}"`);
        return localHit;
    }

    const redis = getRedis();
    if (!redis) return null;
    try {
        const key = hashQuery(query, language);
        const cached = await redis.get<string>(key);
        if (cached) {
            setLocalTier1(query, cached, language);
        }
        return cached ?? null;
    } catch (err: unknown) {
        console.warn('[cache.tier1] Redis GET failed:', (err as Error).message);
        return null;
    }
}

async function tier1Set(query: string, answer: string, language: SupportedLanguage): Promise<void> {
    setLocalTier1(query, answer, language);
    const redis = getRedis();
    if (!redis) return;
    try {
        const key = hashQuery(query, language);
        await redis.set(key, answer, { ex: CACHE_CONFIG.TIER1_TTL_SECONDS });
    } catch (err: unknown) {
        console.warn('[cache.tier1] Redis SET failed:', (err as Error).message);
    }
}

async function tier1Delete(query: string, language: SupportedLanguage): Promise<void> {
    deleteLocalTier1(query, language);
    const redis = getRedis();
    if (!redis) return;
    try {
        await redis.del(hashQuery(query, language));
    } catch (err: unknown) {
        console.warn('[cache.tier1] Redis DEL failed:', (err as Error).message);
    }
}

// Tier 2 Helpers

async function tier2Get(
    queryVector: number[],
    language: SupportedLanguage,
): Promise<{ answer: string; similarity: number; id: string; hitCount: number } | null> {
    const supabase = getSupabase();
    try {
        const { data, error } = await supabase.rpc('search_semantic_cache', {
            query_embedding: queryVector,
            similarity_threshold: CACHE_CONFIG.TIER2_THRESHOLD,
            match_count: 1,
            target_language: language,
        });
        if (error || !data || data.length === 0) return null;
        const hit = data[0];
        void supabase.rpc('increment_cache_hit', { p_id: hit.id });
        return {
            answer: hit.answer,
            similarity: hit.similarity,
            id: hit.id,
            hitCount: hit.hit_count,
        };
    } catch (err: unknown) {
        console.warn('[cache.tier2] Supabase search failed:', (err as Error).message);
        return null;
    }
}

async function tier2Set(params: {
    query: string;
    queryVector: number[];
    answer: string;
    answerMode: string;
    language: string;
}): Promise<void> {
    const supabase = getSupabase();
    const { query, queryVector, answer, answerMode, language } = params;
    const normalizedLanguage = normalizeLanguage(language);
    try {
        const { error } = await supabase.from('semantic_cache').insert({
            query_hash: createHash('sha256').update(normalizeCacheQuery(query)).digest('hex'),
            query_text: normalizeCacheQuery(query).slice(0, 500),
            embedding: queryVector,
            answer,
            answer_mode: answerMode,
            language: normalizedLanguage,
        });
        if (error) console.warn('[cache.tier2] Supabase INSERT failed:', error.message);
    } catch (err: unknown) {
        console.warn('[cache.tier2] tier2Set error:', (err as Error).message);
    }
}

// Public API

/**
 * checkCache()
 *
 * Pass queryVector as null to check only Tier 1 (no embedding needed).
 * Pass the embedding to also check Tier 2.
 */
export async function checkCache(
    query: string,
    queryVector: number[] | null,
    language: string = 'en',
): Promise<CacheResult> {
    const normalizedLanguage = normalizeLanguage(language);
    // Tier 1
    const t1Start = performance.now();
    const tier1Result = await tier1Get(query, normalizedLanguage);
    if (tier1Result) {
        console.log(`[cache] Tier 1 HIT (${(performance.now() - t1Start).toFixed(1)}ms, lang=${normalizedLanguage}) - "${query.slice(0, 60)}"`);
        return { hit: true, answer: tier1Result, tier: 1 };
    }

    // Tier 2
    if (!queryVector) return { hit: false };

    const t2Start = performance.now();
    const tier2Result = await tier2Get(queryVector, normalizedLanguage);
    if (tier2Result) {
        console.log(`[cache] Tier 2 HIT (${(performance.now() - t2Start).toFixed(1)}ms, sim=${tier2Result.similarity.toFixed(3)}, lang=${normalizedLanguage}) - "${query.slice(0, 60)}"`);
        // Backfill Tier 1 so next identical query is even faster
        void tier1Set(query, tier2Result.answer, normalizedLanguage);
        return {
            hit: true,
            answer: tier2Result.answer,
            tier: 2,
            similarity: tier2Result.similarity,
            hitCount: tier2Result.hitCount,
            cacheId: tier2Result.id,
        };
    }

    console.log(`[cache] Miss - "${query.slice(0, 60)}"`);
    return { hit: false };
}

/**
 * storeCache()
 *
 * Call after a full RAG pipeline run. Fire-and-forget is fine.
 * Skips storing if: answerMode is 'general', answer too short/long.
 */
export async function storeCache(params: {
    query: string;
    queryVector: number[];
    answer: string;
    answerMode: string;
    language: string;
    confidence?: number;
}): Promise<void> {
    const { answer, answerMode, confidence = 0 } = params;

    if (answerMode === 'general' || answerMode === 'rag_partial') return;
    if (answer.length < CACHE_CONFIG.MIN_ANSWER_LENGTH) return;
    if (answer.length > CACHE_CONFIG.MAX_ANSWER_LENGTH) return;
    if (confidence < CACHE_CONFIG.MIN_CACHE_CONFIDENCE) return;

    await Promise.allSettled([
        tier1Set(params.query, answer, normalizeLanguage(params.language)),
        tier2Set({
            ...params,
            language: normalizeLanguage(params.language),
        }),
    ]);

    console.log(`[cache] Stored in both tiers - "${params.query.slice(0, 60)}"`);
}

/**
 * invalidateCache()
 *
 * Evict a specific query from both tiers.
 * Call this when an admin corrects a wrong answer.
 */
export async function invalidateCache(query: string): Promise<void> {
    const supabase = getSupabase();
    const hash = createHash('sha256').update(normalizeCacheQuery(query)).digest('hex');
    await Promise.allSettled([
        ...SUPPORTED_LANGUAGES.map((lang) => tier1Delete(query, lang)),
        supabase.rpc('invalidate_cache_entry', { p_query_hash: hash }),
    ]);
    console.log(`[cache] Invalidated - "${query.slice(0, 60)}"`);
}

/**
 * invalidateAllCache()
 *
 * Clears ALL cache entries. Call after a full KB retrain.
 */
export async function invalidateAllCache(): Promise<{ tier1Cleared: boolean; tier2Cleared: number }> {
    const redis = getRedis();
    const supabase = getSupabase();
    let tier1Cleared = false;
    let tier2Cleared = 0;

    localTier1Cache.clear();

    try {
        if (redis) {
            let cursor = '0';
            do {
                const [nextCursor, keys] = await redis.scan(cursor, {
                    match: `${CACHE_CONFIG.REDIS_KEY_PREFIX}*`,
                    count: 100,
                });
                cursor = nextCursor;
                if (keys.length > 0) await redis.del(...keys);
            } while (cursor !== '0');
            tier1Cleared = true;
        }
    } catch (err: unknown) {
        console.warn('[cache] Tier 1 flush failed:', (err as Error).message);
    }

    try {
        const { data } = await supabase
            .from('semantic_cache')
            .delete()
            .not('id', 'is', null)
            .select('id');
        tier2Cleared = data?.length ?? 0;
    } catch (err: unknown) {
        console.warn('[cache] Tier 2 flush failed:', (err as Error).message);
    }

    console.log(`[cache] Full invalidation - Tier1: ${tier1Cleared}, Tier2: ${tier2Cleared} rows`);
    return { tier1Cleared, tier2Cleared };
}

/**
 * getCacheStats()
 *
 * Returns stats for admin dashboard.
 */
export async function getCacheStats(): Promise<{
    tier1Connected: boolean;
    tier2Stats: Record<string, unknown> | null;
}> {
    const redis = getRedis();
    const supabase = getSupabase();
    let tier1Connected = false;

    try {
        if (redis) {
            await redis.ping();
            tier1Connected = true;
        }
    } catch {
        // offline
    }

    let tier2Stats = null;
    try {
        const { data } = await supabase.from('semantic_cache_stats').select('*').single();
        tier2Stats = data;
    } catch {
        // table may not exist yet
    }

    return { tier1Connected, tier2Stats };
}
