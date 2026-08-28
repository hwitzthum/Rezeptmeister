import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { proxyAiRequest } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimitDistributed, getClientIp, AI_LIMIT } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import { clampGenerateImagePayload } from "@/lib/ai/generate-image-payload";

const bodySchema = z.object({
  recipe_id: z.string().uuid(),
  title: z.string().min(1),
  ingredients: z.array(z.string()).default([]),
  category: z.string().default(""),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`generate-image:${ip}`, AI_LIMIT);
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

  return proxyAiRequest(
    "/ai/generate-image",
    geminiKey,
    // Auf die Grenzen des Backend-Schemas kuerzen. Ohne das lehnte Pydantic ein
    // Rezept mit mehr als 20 Zutaten mit 422 ab, und im Browser stand nur
    // „Ungueltige Eingabedaten" — siehe lib/ai/generate-image-payload.ts.
    { ...clampGenerateImagePayload(parsed.data), user_id: session.user.id },
    "Bild konnte nicht generiert werden.",
  );
}
