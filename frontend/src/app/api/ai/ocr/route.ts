import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { buildAiHeaders } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimit, getClientIp, AI_LIMIT } from "@/lib/rate-limit";

const bodySchema = z.object({
  imageId: z.string().uuid(),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`ocr:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)) },
      },
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingaben.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const keyResult = await resolveGeminiKey(session.user.id);
  if (!keyResult.ok) return keyResult.response;
  const geminiKey = keyResult.key;

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Backend nicht erreichbar." }, { status: 503 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/ocr/extract`, {
      method: "POST",
      headers: buildAiHeaders(geminiKey),
      body: JSON.stringify({
        image_id: parsed.data.imageId,
        user_id: session.user.id,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    let detail = "OCR-Extraktion fehlgeschlagen.";
    try {
      const err = (await backendRes.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch { /* ignore */ }
    return NextResponse.json({ error: detail }, { status: backendRes.status });
  }

  const result: unknown = await backendRes.json();
  return NextResponse.json(result);
}
