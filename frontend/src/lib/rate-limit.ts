/**
 * Sliding window rate limiter.
 *
 * Uses Upstash Redis (@upstash/ratelimit) when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set — this is the correct approach for
 * serverless / multi-instance deployments where an in-memory store is
 * per-instance and therefore bypassable by distributing requests.
 *
 * Falls back to an in-memory store when Upstash is not configured (local dev
 * or single-instance self-hosted). In production without Upstash a console
 * warning is emitted on first use so misconfiguration surfaces immediately.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Startup guards
// ---------------------------------------------------------------------------

if (
  process.env.DISABLE_RATE_LIMIT === "true" &&
  process.env.NODE_ENV === "production"
) {
  throw new Error("DISABLE_RATE_LIMIT=true ist in Produktion nicht erlaubt.");
}

// ---------------------------------------------------------------------------
// Upstash Redis client (created once, lazily)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;
let _upstashWarned = false;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (process.env.NODE_ENV === "production" && !_upstashWarned) {
      _upstashWarned = true;
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set. " +
          "Falling back to in-memory rate limiting — " +
          "ineffective across multiple serverless instances. " +
          "Provision Upstash Redis for distributed rate limiting.",
      );
    }
    return null;
  }
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Upstash Ratelimit instances (one per unique config, cached)
// ---------------------------------------------------------------------------

const _limiters = new Map<string, Ratelimit>();

function windowMsToDuration(ms: number): `${number} ${"s" | "m" | "h" | "d"}` {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function getLimiter(config: RateLimitConfig): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const key = `${config.max}:${config.windowMs}`;
  if (!_limiters.has(key)) {
    _limiters.set(
      key,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          config.max,
          windowMsToDuration(config.windowMs),
        ),
        analytics: false,
        prefix: "rl:rezeptmeister",
      }),
    );
  }
  return _limiters.get(key)!;
}

// ---------------------------------------------------------------------------
// In-memory fallback (single-instance only)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();
const MAX_STORE_SIZE = 10_000;

if (typeof setInterval !== "undefined") {
  setInterval(
    () => {
      const now = Date.now();
      for (const [k, entry] of store) {
        if (now - entry.windowStart > 15 * 60 * 1_000) store.delete(k);
      }
    },
    5 * 60 * 1_000,
  );
}

function checkInMemory(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
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

// ---------------------------------------------------------------------------
// Public types and configs
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key (typically IP-based).
 *
 * Uses Upstash Redis when configured (distributed, effective across all
 * serverless instances). Falls back to in-memory for local dev / self-hosted.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_LIMIT,
): Promise<RateLimitResult> {
  if (process.env.DISABLE_RATE_LIMIT === "true") {
    return { allowed: true, remaining: config.max };
  }

  const limiter = getLimiter(config);

  if (limiter) {
    const result = await limiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      retryAfterMs: result.success
        ? undefined
        : Math.max(0, result.reset - Date.now()),
    };
  }

  // In-memory fallback
  return checkInMemory(key, config);
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract the verified client IP from request headers.
 *
 * On Vercel the edge network appends the real client IP as the RIGHTMOST entry
 * in x-forwarded-for. The leftmost entry is client-supplied and trivially
 * spoofable — using it allows a complete rate-limit bypass by prepending a
 * fake IP. Always consume the rightmost (proxy-appended) entry.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = ips[ips.length - 1];
    if (ip) return ip;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return "unknown";
}
