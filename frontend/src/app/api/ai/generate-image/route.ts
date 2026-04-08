import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { buildAiHeaders, fetchBackendWithRetry } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimit, getClientIp, AI_LIMIT } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";

const bodySchema = z.object({
  recipe_id: z.string().uuid(),
  title: z.string().min(1),
  ingredients: z.array(z.string()).default([]),
  category: z.string().default(""),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`generate-image:${ip}`, AI_LIMIT);
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

  // Rezept-Eigentümerschaft + API-Schlüssel parallel laden
  const [recipe, keyResult] = await Promise.all([
    db.query.recipes.findFirst({
      where: recipeOwnerCondition(parsed.data.recipe_id, session.user.id, session.user.role ?? "user"),
      columns: { id: true },
    }),
    resolveGeminiKey(session.user.id),
  ]);

  if (!recipe) {
    return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
  }

  if (!keyResult.ok) return keyResult.response;
  const geminiKey = keyResult.key;

  const backendRes = await fetchBackendWithRetry("/ai/generate-image", {
    method: "POST",
    headers: buildAiHeaders(geminiKey),
    body: JSON.stringify({ ...parsed.data, user_id: session.user.id }),
  });
  if (!backendRes) {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    let detail = "Bild konnte nicht generiert werden.";
    try {
      const err = (await backendRes.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch { /* ignore */ }
    return NextResponse.json({ error: detail }, { status: backendRes.status });
  }

  const result: unknown = await backendRes.json();
  return NextResponse.json(result);
}
