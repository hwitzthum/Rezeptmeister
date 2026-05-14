import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron endpoint that pings the Render backend /health endpoint
 * every 10 minutes to prevent free-tier spin-down.
 */

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export async function GET(request: Request) {
  // Verify the request comes from Vercel Cron using constant-time comparison
  const authHeader = request.headers.get("authorization");
  if (!safeCompare(authHeader ?? "", `Bearer ${process.env.CRON_SECRET ?? ""}`)) {
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
