/**
 * src/lib/cache.ts
 *
 * Two-Tier Query Cache for Dexter HMS Bot
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
    TIER1_TTL_SECONDS: parseInt(process.env.CACHE_TTL_SECONDS || '86400'),
    TIER2_THRESHOLD: parseFloat(process.env.SEMANTIC_CACHE_THRESHOLD || '0.90'),
    REDIS_KEY_PREFIX: 'dexter:cache:v1:',
    MAX_ANSWER_LENGTH: 8000,
    MIN_ANSWER_LENGTH: 20,
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

function hashQuery(query: string): string {
    const normalized = query.trim().toLowerCase();
    return CACHE_CONFIG.REDIS_KEY_PREFIX + createHash('sha256').update(normalized).digest('hex');
}

async function tier1Get(query: string): Promise<string | null> {
    const redis = getRedis();
    if (!redis) return null;
    try {
        const key = hashQuery(query);
        const cached = await redis.get<string>(key);
        return cached ?? null;
    } catch (err: unknown) {
        console.warn('[cache.tier1] Redis GET failed:', (err as Error).message);
        return null;
    }
}

async function tier1Set(query: string, answer: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    try {
        const key = hashQuery(query);
        await redis.set(key, answer, { ex: CACHE_CONFIG.TIER1_TTL_SECONDS });
    } catch (err: unknown) {
        console.warn('[cache.tier1] Redis SET failed:', (err as Error).message);
    }
}

async function tier1Delete(query: string): Promise<void> {
    const redis = getRedis();
    if (!redis) return;
    try {
        await redis.del(hashQuery(query));
    } catch (err: unknown) {
        console.warn('[cache.tier1] Redis DEL failed:', (err as Error).message);
    }
}

// Tier 2 Helpers

async function tier2Get(
    queryVector: number[],
): Promise<{ answer: string; similarity: number; id: string; hitCount: number } | null> {
    const supabase = getSupabase();
    try {
        const { data, error } = await supabase.rpc('search_semantic_cache', {
            query_embedding: queryVector,
            similarity_threshold: CACHE_CONFIG.TIER2_THRESHOLD,
            match_count: 1,
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
    try {
        const { error } = await supabase.from('semantic_cache').insert({
            query_hash: createHash('sha256').update(query.trim().toLowerCase()).digest('hex'),
            query_text: query.slice(0, 500),
            embedding: queryVector,
            answer,
            answer_mode: answerMode,
            language,
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
): Promise<CacheResult> {
    // Tier 1
    const t1Start = performance.now();
    const tier1Result = await tier1Get(query);
    if (tier1Result) {
        console.log(`[cache] Tier 1 HIT (${(performance.now() - t1Start).toFixed(1)}ms) - "${query.slice(0, 60)}"`);
        return { hit: true, answer: tier1Result, tier: 1 };
    }

    // Tier 2
    if (!queryVector) return { hit: false };

    const t2Start = performance.now();
    const tier2Result = await tier2Get(queryVector);
    if (tier2Result) {
        console.log(`[cache] Tier 2 HIT (${(performance.now() - t2Start).toFixed(1)}ms, sim=${tier2Result.similarity.toFixed(3)}) - "${query.slice(0, 60)}"`);
        // Backfill Tier 1 so next identical query is even faster
        void tier1Set(query, tier2Result.answer);
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
}): Promise<void> {
    const { answer, answerMode } = params;

    if (answerMode === 'general') return;
    if (answer.length < CACHE_CONFIG.MIN_ANSWER_LENGTH) return;
    if (answer.length > CACHE_CONFIG.MAX_ANSWER_LENGTH) return;

    await Promise.allSettled([
        tier1Set(params.query, answer),
        tier2Set(params),
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
    const hash = createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
    await Promise.allSettled([
        tier1Delete(query),
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
