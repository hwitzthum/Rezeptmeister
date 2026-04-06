/**
 * In-memory sliding window rate limiter.
 * Suitable for single-instance / self-hosted deployments.
 * For multi-instance production, replace with @upstash/ratelimit.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

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
    if (process.env.NODE_ENV === "production") {
      throw new Error("DISABLE_RATE_LIMIT=true ist in Produktion nicht erlaubt.");
    }
    return { allowed: true, remaining: config.max };
  }

  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= config.windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: config.max - 1 };
  }

  if (entry.count >= config.max) {
    const retryAfterMs = config.windowMs - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: config.max - entry.count };
}

/** Extract client IP from Next.js request headers.
 * Uses the rightmost entry of x-forwarded-for, which is set by the trusted
 * reverse proxy closest to the application (not spoofable by the client).
 * Falls back to a URL+User-Agent hash when no IP header is present,
 * to avoid all unknown clients sharing a single rate-limit bucket. */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = ips[ips.length - 1];
    if (ip) return ip;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  // Fallback: hash URL + User-Agent to avoid a shared "unknown" bucket
  const ua = request.headers.get("user-agent") ?? "";
  const url = new URL(request.url);
  let hash = 0;
  for (const ch of ua) {
    hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  }
  return `unknown:${url.pathname}:${hash}`;
}
