import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron endpoint that pings the Render backend /health endpoint
 * every 10 minutes to prevent free-tier spin-down.
 */

function safeCompare(a: string, b: string): boolean {
  // Hash both inputs to fixed 32-byte HMAC-SHA256 digests before comparing.
  // A raw length pre-check (a.length !== b.length) followed by timingSafeEqual
  // leaks the expected token length via timing: wrong-length inputs return
  // immediately while correct-length inputs enter the comparison branch.
  // Hashing to a fixed-length output removes that side channel entirely.
  const key = "cron-compare";
  const aHash = createHmac("sha256", key).update(a).digest();
  const bHash = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

export async function GET(request: Request) {
  // Fail closed if CRON_SECRET is not configured
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  // Verify the request comes from Vercel Cron using constant-time comparison
  const authHeader = request.headers.get("authorization");
  if (!safeCompare(authHeader ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "BACKEND_URL nicht konfiguriert." }, { status: 503 });
  }

  try {
    const res = await fetch(`${backendUrl}/health`, {
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json();
    return NextResponse.json({ status: res.status, backend: body });
  } catch {
    return NextResponse.json({ error: "Backend nicht erreichbar." }, { status: 503 });
  }
}
