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
