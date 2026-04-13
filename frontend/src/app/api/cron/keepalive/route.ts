import { NextResponse } from "next/server";

/**
 * Vercel Cron endpoint that pings the Render backend /health endpoint
 * every 10 minutes to prevent free-tier spin-down.
 */
export async function GET(request: Request) {
  // Verify the request comes from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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