import { describe, it, expect, beforeEach } from "vitest";

// Re-import fresh module each test to reset the in-memory store
// We use vi.resetModules() in beforeEach
import { vi } from "vitest";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows first request", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const result = checkRateLimit("test-ip-1", { windowMs: 60_000, max: 5 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("counts consecutive requests", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const config = { windowMs: 60_000, max: 3 };
    checkRateLimit("ip-count", config);
    checkRateLimit("ip-count", config);
    const third = checkRateLimit("ip-count", config);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("blocks when limit exceeded", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const config = { windowMs: 60_000, max: 2 };
    checkRateLimit("ip-block", config);
    checkRateLimit("ip-block", config);
    const over = checkRateLimit("ip-block", config);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
    expect(over.retryAfterMs).toBeGreaterThan(0);
  });

  it("uses independent counters per key", async () => {
    const { checkRateLimit } = await import("../rate-limit");
    const config = { windowMs: 60_000, max: 1 };
    const a = checkRateLimit("key-a", config);
    const b = checkRateLimit("key-b", config);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();
    const { checkRateLimit } = await import("../rate-limit");
    const config = { windowMs: 1_000, max: 1 };
    checkRateLimit("ip-expire", config);
    expect(checkRateLimit("ip-expire", config).allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit("ip-expire", config).allowed).toBe(true);
    vi.useRealTimers();
  });
});

describe("getClientIp", () => {
  it("extracts rightmost IP from x-forwarded-for (set by trusted proxy)", async () => {
    const { getClientIp } = await import("../rate-limit");
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    // Rightmost entry is set by the trusted reverse proxy, not spoofable by client
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("returns single IP when x-forwarded-for has one entry", async () => {
    const { getClientIp } = await import("../rate-limit");
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", async () => {
    const { getClientIp } = await import("../rate-limit");
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no IP headers present", async () => {
    const { getClientIp } = await import("../rate-limit");
    const req = new Request("http://localhost/");
    expect(getClientIp(req)).toBe("unknown");
  });
});
