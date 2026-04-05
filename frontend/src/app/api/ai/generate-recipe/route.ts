import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { decrypt } from "@/lib/crypto";
import { buildAiHeaders } from "@/lib/backend";
import { checkRateLimit, getClientIp, AI_LIMIT } from "@/lib/rate-limit";

const bodySchema = z.object({
  suggestion_title: z.string().min(1),
  suggestion_description: z.string(),
  servings: z.number().int().min(1).max(100).default(4),
  cuisine: z.string().default(""),
  dietary: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`generate-recipe:${ip}`, AI_LIMIT);
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

  // Gemini API-Schlüssel aus DB laden und entschlüsseln
  const userRecord = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { apiKeyEncrypted: true, apiProvider: true },
  });

  if (!userRecord?.apiKeyEncrypted || userRecord.apiProvider !== "gemini") {
    return NextResponse.json(
      {
        error:
          "Kein Gemini API-Schlüssel hinterlegt. Bitte in den Einstellungen einen Gemini API-Schlüssel eingeben.",
      },
      { status: 400 },
    );
  }

  let geminiKey: string;
  try {
    geminiKey = decrypt(userRecord.apiKeyEncrypted);
  } catch {
    return NextResponse.json(
      { error: "API-Schlüssel konnte nicht entschlüsselt werden." },
      { status: 500 },
    );
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Backend nicht erreichbar." }, { status: 503 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/ai/generate-recipe`, {
      method: "POST",
      headers: buildAiHeaders(geminiKey),
      body: JSON.stringify({
        ...parsed.data,
        user_id: session.user.id,
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    let detail = "Rezept konnte nicht generiert werden.";
    try {
      const err = (await backendRes.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch { /* ignore */ }
    return NextResponse.json({ error: detail }, { status: backendRes.status });
  }

  const result: unknown = await backendRes.json();
  return NextResponse.json(result);
}
