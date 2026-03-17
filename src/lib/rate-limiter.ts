/**
 * src/lib/rate-limiter.ts
 *
 * Rate Limiting & Abuse Protection
 *
 * Two strategies:
 * 1. In-memory sliding window (fast, per-instance, no external deps)
 * 2. Upstash Redis (shared across instances, persistent)
 *
 * Limits are different for:
 * - Guest users (by IP): stricter limits
 * - Authenticated users (by user ID): more generous
 *
 * Uses token bucket algorithm with sliding window for burst protection.
 */

import { Redis } from '@upstash/redis';

export interface RateLimitConfig {
    /** Max requests in the window */
    maxRequests: number;
    /** Window size in seconds */
    windowSeconds: number;
    /** Identifier prefix for namespacing */
    prefix: string;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetInSeconds: number;
    retryAfterSeconds?: number;
}

// Default limits
export const RATE_LIMITS = {
    guest: {
        maxRequests: 15,
        windowSeconds: 60,
        prefix: 'rl:guest:',
    } satisfies RateLimitConfig,
    authenticated: {
        maxRequests: 60,
        windowSeconds: 60,
        prefix: 'rl:auth:',
    } satisfies RateLimitConfig,
    admin: {
        maxRequests: 200,
        windowSeconds: 60,
        prefix: 'rl:admin:',
    } satisfies RateLimitConfig,
};

// ─── In-Memory Sliding Window ───────────────────────────────────────

interface WindowEntry {
    timestamps: number[];
    blockedUntil?: number;
}

const memoryStore = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(): void {
    if (cleanupInterval) return;
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        const cutoff = now - 120_000; // remove entries older than 2 minutes

        for (const [key, entry] of memoryStore) {
            entry.timestamps = entry.timestamps.filter(t => t > cutoff);
            if (entry.timestamps.length === 0 && (!entry.blockedUntil || entry.blockedUntil < now)) {
                memoryStore.delete(key);
            }
        }
    }, 300_000);

    // Don't prevent process exit
    if (cleanupInterval.unref) cleanupInterval.unref();
}

function checkMemoryRateLimit(
    identifier: string,
    config: RateLimitConfig,
): RateLimitResult {
    ensureCleanup();

    const key = config.prefix + identifier;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    let entry = memoryStore.get(key);
    if (!entry) {
        entry = { timestamps: [] };
        memoryStore.set(key, entry);
    }

    // Check if currently blocked (exponential backoff)
    if (entry.blockedUntil && now < entry.blockedUntil) {
        const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
        return {
            allowed: false,
            remaining: 0,
            resetInSeconds: retryAfter,
            retryAfterSeconds: retryAfter,
        };
    }

    // Remove old timestamps
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    if (entry.timestamps.length >= config.maxRequests) {
        // Exceeded limit — apply exponential backoff
        const overageCount = entry.timestamps.length - config.maxRequests + 1;
        const backoffSeconds = Math.min(60, Math.pow(2, overageCount - 1));
        entry.blockedUntil = now + backoffSeconds * 1000;

        return {
            allowed: false,
            remaining: 0,
            resetInSeconds: backoffSeconds,
            retryAfterSeconds: backoffSeconds,
        };
    }

    // Allow the request
    entry.timestamps.push(now);
    const remaining = config.maxRequests - entry.timestamps.length;
    const oldestInWindow = entry.timestamps[0] ?? now;
    const resetInSeconds = Math.ceil((oldestInWindow + windowMs - now) / 1000);

    return {
        allowed: true,
        remaining,
        resetInSeconds: Math.max(0, resetInSeconds),
    };
}

// ─── Redis Rate Limiter ─────────────────────────────────────────────

let _redis: Redis | null = null;

function getRedis(): Redis | null {
    if (_redis) return _redis;

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) return null;

    _redis = new Redis({ url, token });
    return _redis;
}

async function checkRedisRateLimit(
    identifier: string,
    config: RateLimitConfig,
): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        // Fallback to in-memory
        return checkMemoryRateLimit(identifier, config);
    }

    const key = config.prefix + identifier;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - config.windowSeconds;

    try {
        // Sliding window with sorted set
        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(key, 0, windowStart);
        pipeline.zadd(key, { score: now, member: `${now}:${Math.random().toString(36).slice(2, 8)}` });
        pipeline.zcard(key);
        pipeline.expire(key, config.windowSeconds + 1);

        const results = await pipeline.exec();
        const currentCount = (results[2] as number) || 0;

        if (currentCount > config.maxRequests) {
            // Remove the entry we just added since we're denying
            pipeline.zremrangebyscore(key, now, now);

            const retryAfter = Math.min(60, Math.ceil(config.windowSeconds / 2));
            return {
                allowed: false,
                remaining: 0,
                resetInSeconds: config.windowSeconds,
                retryAfterSeconds: retryAfter,
            };
        }

        return {
            allowed: true,
            remaining: config.maxRequests - currentCount,
            resetInSeconds: config.windowSeconds,
        };
    } catch (err) {
        console.warn('[rate-limiter] Redis error, falling back to memory:', (err as Error).message);
        return checkMemoryRateLimit(identifier, config);
    }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Check rate limit for a request.
 *
 * @param identifier - IP address or user ID
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed and metadata
 */
export async function checkRateLimit(
    identifier: string,
    config: RateLimitConfig = RATE_LIMITS.guest,
): Promise<RateLimitResult> {
    // Try Redis first, fallback to memory
    return checkRedisRateLimit(identifier, config);
}

/**
 * Extract client identifier from request.
 * Uses X-Forwarded-For for proxied requests, falls back to a hash.
 */
export function getClientIdentifier(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;

    // Fallback — not ideal but better than nothing
    return 'unknown';
}

/**
 * Build rate limit headers for the response.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    const headers: Record<string, string> = {
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetInSeconds),
    };

    if (!result.allowed && result.retryAfterSeconds) {
        headers['Retry-After'] = String(result.retryAfterSeconds);
    }

    return headers;
}
