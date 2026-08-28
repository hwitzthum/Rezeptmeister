import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { proxyAiRequest } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimitDistributed, getClientIp, AI_LIMIT } from "@/lib/rate-limit";
import { buildTasteProfile } from "@/lib/ai/taste-profile";
import { saisonFuer, saisonaleZutaten } from "@/lib/ai/saison";

const bodySchema = z.object({
  ingredients: z.array(z.string().max(100)).max(50).default([]),
  cuisine: z.string().max(100).default(""),
  time_budget_minutes: z.number().int().min(5).max(480).default(60),
  dietary: z.array(z.string().max(50)).max(20).default([]),
  season: z.string().max(50).default(""),
  /**
   * Titel der zuletzt angezeigten Vorschlaege. Wer erneut auf "Vorschlagen"
   * tippt, will etwas Neues sehen — diese Titel gehen als Ausschluss mit.
   */
  exclude_titles: z.array(z.string().max(200)).max(30).default([]),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`suggest:${ip}`, AI_LIMIT);
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

  // Geschmacksprofil und Saison entstehen hier, nicht im KI-Dienst: der
  // Datenbankzugriff liegt auf der Next.js-Seite, FastAPI bleibt zustandslos
  // und sieht nur, was es fuer den Prompt braucht.
  const tasteProfile = await buildTasteProfile(session.user.id);
  const saison = saisonFuer();

  return proxyAiRequest(
    "/ai/suggest",
    geminiKey,
    {
      ...parsed.data,
      // Ohne ausdrueckliche Auswahl gilt die tatsaechliche Jahreszeit.
      season: parsed.data.season || saison.jahreszeit,
      taste_profile: tasteProfile,
      season_month: saison.monat,
      seasonal_ingredients: saisonaleZutaten(),
      seasonal_occasions: saison.anlass,
    },
    "Rezeptvorschläge konnten nicht geladen werden.",
    // Die Qualitätsschranke im Backend kann einen zweiten Gemini-Durchgang
    // auslösen; die Vorgabe von 30 s reichte dafür nicht und löste stattdessen
    // den Kaltstart-Neuversuch aus — also ein dritter Durchgang auf Kosten des
    // Nutzerschlüssels.
    90_000,
  );
}
