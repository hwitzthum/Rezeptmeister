import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { addDays, format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { db } from "@/lib/db";
import { mealPlans } from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { buildAiHeaders, fetchBackendWithRetry } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import {
  checkRateLimitDistributed,
  getClientIp,
  AI_LIMIT,
} from "@/lib/rate-limit";
import { saisonFuer, saisonaleZutaten } from "@/lib/ai/saison";
import {
  buildPlanCandidates,
  compactCandidates,
  mapPlanEntries,
  type BackendPlanEntry,
} from "@/lib/ai/plan-candidates";

const MEAL_TYPES = [
  "fruehstueck",
  "mittagessen",
  "abendessen",
  "snack",
] as const;

const bodySchema = z.object({
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat."),
  days: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .default([0, 1, 2, 3, 4, 5, 6]),
  mealTypes: z.array(z.enum(MEAL_TYPES)).min(1).max(4).default(["abendessen"]),
  overwrite: z.boolean().default(false),
  vegetarianMin: z.number().int().min(0).max(28).default(0),
  maxMinutesWeekday: z.number().int().min(5).max(480).nullable().default(null),
  varyCuisine: z.boolean().default(true),
  useLeftovers: z.boolean().default(false),
  newSuggestionsMax: z.number().int().min(0).max(7).default(0),
  wish: z.string().max(500).default(""),
});

/**
 * POST /api/ai/plan-week — KI-Wochenplan aus den eigenen Rezepten (Phase 21).
 * Kandidaten und Saison entstehen hier (DB bleibt bei Next.js), das Backend wählt,
 * die Rückabbildung Index → Rezept passiert wieder hier.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`plan-week:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
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
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingaben.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const monday = parseISO(input.weekStart);
  if (!isValid(monday)) {
    return NextResponse.json({ error: "Ungültiges Datum." }, { status: 400 });
  }

  const keyResult = await resolveGeminiKey(session.user.id);
  if (!keyResult.ok) return keyResult.response;

  // Belegte Slots der Woche — ohne «überschreiben» werden sie nicht geplant
  const sunday = addDays(monday, 6);
  const existing = await db
    .select({ date: mealPlans.date, mealType: mealPlans.mealType })
    .from(mealPlans)
    .where(
      and(
        eq(mealPlans.userId, session.user.id),
        gte(mealPlans.date, format(monday, "yyyy-MM-dd")),
        lte(mealPlans.date, format(sunday, "yyyy-MM-dd")),
      ),
    );
  const occupied = new Set(existing.map((e) => `${e.date}-${e.mealType}`));

  const days = [...new Set(input.days)].sort((a, b) => a - b);
  const slots: { day_index: number; meal_type: string; is_weekday: boolean }[] =
    [];
  let skippedOccupied = 0;
  for (const day of days) {
    const date = format(addDays(monday, day), "yyyy-MM-dd");
    for (const mealType of input.mealTypes) {
      if (!input.overwrite && occupied.has(`${date}-${mealType}`)) {
        skippedOccupied += 1;
        continue;
      }
      slots.push({ day_index: day, meal_type: mealType, is_weekday: day <= 4 });
    }
  }
  if (slots.length === 0) {
    return NextResponse.json({
      proposals: [],
      skippedOccupied,
      notes: ["Alle gewählten Plätze sind bereits belegt."],
    });
  }

  const candidates = await buildPlanCandidates(session.user.id);
  if (candidates.length === 0 && input.newSuggestionsMax === 0) {
    return NextResponse.json(
      {
        error:
          "Keine eigenen Rezepte vorhanden — zuerst Rezepte anlegen oder neue Vorschläge zulassen.",
      },
      { status: 400 },
    );
  }

  const saison = saisonFuer();
  const payload = {
    slots,
    candidates: compactCandidates(candidates),
    vegetarian_min: input.vegetarianMin,
    max_minutes_weekday: input.maxMinutesWeekday,
    vary_cuisine: input.varyCuisine,
    use_leftovers: input.useLeftovers,
    new_suggestions_max: input.newSuggestionsMax,
    wish: input.wish,
    season_month: saison.monat,
    seasonal_ingredients: saisonaleZutaten(),
    day_labels: Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), "EEEE dd.MM.", { locale: de }),
    ),
    user_id: session.user.id,
  };

  // Nicht proxyAiRequest: die Antwort muss hier noch auf Rezepte abgebildet werden.
  const backendRes = await fetchBackendWithRetry(
    "/ai/plan-week",
    {
      method: "POST",
      headers: buildAiHeaders(keyResult.key),
      body: JSON.stringify(payload),
    },
    90_000, // Nachschlag möglich — wie bei /ai/suggest
  );
  if (!backendRes) {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }
  if (!backendRes.ok) {
    let curated: string | null = null;
    try {
      const err = (await backendRes.json()) as { detail?: unknown };
      const d = err.detail;
      if (
        d &&
        typeof d === "object" &&
        !Array.isArray(d) &&
        typeof (d as { message?: unknown }).message === "string"
      ) {
        curated = (d as { message: string }).message;
      }
    } catch {
      /* kein JSON */
    }
    const safe: Record<number, string> = {
      400: "Ungültige Anfrage.",
      429: "Zu viele Anfragen.",
    };
    return NextResponse.json(
      {
        error:
          curated ??
          safe[backendRes.status] ??
          "Wochenplan konnte nicht erstellt werden.",
      },
      { status: backendRes.status },
    );
  }

  const result = (await backendRes.json()) as {
    entries: BackendPlanEntry[];
    filled_by_fallback: string[];
    issues_remaining: string[];
  };

  return NextResponse.json({
    proposals: mapPlanEntries(
      result.entries,
      candidates,
      input.weekStart,
      result.filled_by_fallback,
    ),
    skippedOccupied,
    notes: result.issues_remaining,
  });
}
