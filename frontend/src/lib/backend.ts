import { NextResponse } from "next/server";
/**
 * Shared utilities for Next.js → FastAPI internal calls.
 * The INTERNAL_SECRET env var gates all backend requests so the FastAPI
 * service is not directly reachable without the shared token.
 */
export function buildBackendHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.INTERNAL_SECRET) {
    headers["X-Internal-Token"] = process.env.INTERNAL_SECRET;
  }
  return headers;
}

/**
 * Like buildBackendHeaders() but also injects the user's decrypted Gemini API key
 * as X-Gemini-API-Key (per HTTP spec for credentials — never in the body).
 */
export function buildAiHeaders(geminiApiKey: string): Record<string, string> {
  return {
    ...buildBackendHeaders(),
    "X-Gemini-API-Key": geminiApiKey,
  };
}

/**
 * Fetch the FastAPI backend with automatic retry for Render free-tier cold starts.
 *
 * Render free plan spins down after ~15 min of inactivity. Cold starts take
 * 30-40s (Docker boot + DB connection pool init). A single 30s timeout races
 * against this and often loses. This helper retries once after a short delay
 * with an extended timeout so the backend has time to wake up.
 *
 * Returns the Response on success, or null if BACKEND_URL is missing or
 * both attempts fail (caller should return 503).
 */
export async function fetchBackendWithRetry(
  path: string,
  init: { method: string; headers: Record<string, string>; body: string },
  timeoutMs = 30_000,
): Promise<Response | null> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) return null;

  const url = `${backendUrl}${path}`;

  // Attempt 1 — normal timeout
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    // Likely cold start — retry
  }

  // Wait briefly for the container to finish booting
  await new Promise((r) => setTimeout(r, 3_000));

  // Attempt 2 — extended timeout (at least 60s)
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(Math.max(timeoutMs, 60_000)),
    });
  } catch {
    return null;
  }
}

/**
 * Proxies a POST to the FastAPI AI backend: injects the Gemini key, handles the
 * 503 (backend unreachable) and non-OK (forwarded detail) cases, and returns
 * the parsed JSON. Consolidates the identical tail of every /api/ai/* route.
 */
export async function proxyAiRequest(
  path: string,
  geminiKey: string,
  payload: unknown,
  fallbackError: string,
  timeoutMs?: number,
): Promise<NextResponse> {
  const backendRes = await fetchBackendWithRetry(
    path,
    {
      method: "POST",
      headers: buildAiHeaders(geminiKey),
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
  if (!backendRes) {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    let detail = fallbackError;
    try {
      const err = (await backendRes.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: detail }, { status: backendRes.status });
  }

  const result: unknown = await backendRes.json();
  return NextResponse.json(result);
}
