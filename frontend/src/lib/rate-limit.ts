/**
 * Rate limiting utilities.
 * In-memory limiter (checkRateLimit): suitable for single-instance / self-hosted
 * deployments.
 * Distributed limiter (checkRateLimitDistributed): Redis-backed, required for
 * multi-instance Vercel deployments where in-memory state does not persist
 * across cold-start containers. Falls back to the in-memory limiter when Upstash
 * env vars are absent.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;

// Validate DISABLE_RATE_LIMIT at module initialization time so misconfiguration
// is caught at startup rather than silently failing per-request in production.
if (
  process.env.DISABLE_RATE_LIMIT === "true" &&
  process.env.NODE_ENV === "production"
) {
  throw new Error("DISABLE_RATE_LIMIT=true ist in Produktion nicht erlaubt.");
}

// Purge stale entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (now - entry.windowStart > 15 * 60 * 1_000) store.delete(key);
      }
    },
    5 * 60 * 1_000,
  );
}

export interface RateLimitConfig {
  /** Window duration in milliseconds */
  windowMs: number;
  /** Maximum requests allowed per window */
  max: number;
}

/** Default: 100 requests per 15 minutes */
export const DEFAULT_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1_000,
  max: 100,
};

/** Auth endpoints: 10 requests per 15 minutes */
export const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1_000,
  max: 10,
};

/** AI endpoints: 20 requests per 15 minutes */
export const AI_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1_000,
  max: 20,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

/**
 * Check rate limit for a given key (typically IP-based).
 * Returns remaining requests and whether the request is allowed.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_LIMIT,
): RateLimitResult {
  // Disable rate limiting in test/development when explicitly opted out
  if (process.env.DISABLE_RATE_LIMIT === "true") {
    return { allowed: true, remaining: config.max };
  }

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    if (store.size > MAX_STORE_SIZE) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    return { allowed: true, remaining: config.max - 1 };
  }

  if (entry.count >= config.max) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: config.max - entry.count };
}

/**
 * Extract the verified client IP from request headers.
 *
 * On Vercel the edge network appends the real client IP as the RIGHTMOST entry
 * in x-forwarded-for. The leftmost entry is client-supplied and trivially
 * spoofable — using it allows a complete rate-limit bypass by prepending a
 * fake IP. Always consume the rightmost (proxy-appended) entry.
 *
 * x-real-ip is kept as a secondary fallback for nginx-style reverse proxies in
 * non-Vercel deployments; it is not set by Vercel's edge.
 */
export function getClientIp(request: Request): string {
  // Rightmost XFF entry = IP appended by the trusted Vercel edge.
  // The leftmost entry is attacker-controlled and must NOT be used.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ip = ips[ips.length - 1];
    if (ip) return ip;
  }

  // x-real-ip: set by nginx / other trusted reverse proxies (not Vercel)
  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return "unknown";
}

// ---------------------------------------------------------------------------
// Redis-backed distributed rate limiter (all API routes)
// ---------------------------------------------------------------------------

// Lazy-initialized shared Redis connection, created on first use to avoid
// module-load failures during the Next.js build when env vars are absent.
let _redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis;
  // Vercel's Upstash Marketplace integration provisions the REST credentials
  // under KV-prefixed names; fall back to those when the Upstash SDK defaults
  // (UPSTASH_REDIS_REST_URL/TOKEN) are not present.
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.UPSTASH_REDIS_KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not configured — " +
          "rate limiting falls back to in-memory only (ineffective " +
          "across Vercel serverless instances).",
      );
    }
    return (_redis = null);
  }
  return (_redis = new Redis({ url, token }));
}

// One Ratelimit instance per distinct (max, windowMs) config. The sliding
// window is fixed at construction time, so different limit tiers need
// separate instances; they are cached and keyed by the config values.
const _limiters = new Map<string, Ratelimit>();

function getDistributedLimiter(config: RateLimitConfig): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${config.max}:${config.windowMs}`;
  const existing = _limiters.get(cacheKey);
  if (existing) return existing;
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      config.max,
      `${Math.ceil(config.windowMs / 1_000)} s`,
    ),
    analytics: false,
    // Namespace by window so distinct tiers sharing a route key never collide.
    prefix: `rl:rezeptmeister:${cacheKey}`,
  });
  _limiters.set(cacheKey, limiter);
  return limiter;
}

/**
 * Distributed rate limit check backed by Upstash Redis, with a graceful
 * in-memory fallback.
 *
 * On Vercel each cold-start container gets a fresh in-memory store, so the
 * synchronous checkRateLimit alone is bypassable by distributing requests
 * across instances. This routes the check through a shared Redis counter when
 * UPSTASH_REDIS_REST_URL/TOKEN are configured, and falls back to the
 * per-instance in-memory limiter (best effort) when they are not.
 *
 * Returns the same RateLimitResult shape as checkRateLimit, so call sites only
 * need to add `await`.
 */
export async function checkRateLimitDistributed(
  key: string,
  config: RateLimitConfig = DEFAULT_LIMIT,
): Promise<RateLimitResult> {
  if (process.env.DISABLE_RATE_LIMIT === "true") {
    return { allowed: true, remaining: config.max };
  }
  const limiter = getDistributedLimiter(config);
  if (!limiter) return checkRateLimit(key, config);
  const { success, remaining, reset } = await limiter.limit(key);
  return {
    allowed: success,
    remaining,
    retryAfterMs: success ? undefined : Math.max(0, reset - Date.now()),
  };
}
