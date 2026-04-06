import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { mealPlans, recipes } from "@/lib/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";

const mealPlanBodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat."),
  mealType: z.enum(["fruehstueck", "mittagessen", "abendessen", "snack"]),
  recipeId: z.string().uuid("Ungültige Rezept-ID."),
  servingsOverride: z.number().int().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

// ── GET /api/meal-plans ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`meal-plans-get:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json(
      { error: "Parameter 'start' und 'end' sind erforderlich." },
      { status: 400 },
    );
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start) || !datePattern.test(end)) {
    return NextResponse.json(
      { error: "Ungültiges Datumsformat. Erwartet: YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    const entries = await db
      .select({
        id: mealPlans.id,
        date: mealPlans.date,
        mealType: mealPlans.mealType,
        recipeId: mealPlans.recipeId,
        servingsOverride: mealPlans.servingsOverride,
        notes: mealPlans.notes,
        createdAt: mealPlans.createdAt,
        recipeTitle: recipes.title,
        recipeServings: recipes.servings,
      })
      .from(mealPlans)
      .leftJoin(recipes, eq(mealPlans.recipeId, recipes.id))
      .where(
        and(
          eq(mealPlans.userId, session.user.id),
          gte(mealPlans.date, start),
          lte(mealPlans.date, end),
        ),
      )
      .orderBy(asc(mealPlans.date));

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("Fehler beim Laden der Wochenplan-Einträge:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── POST /api/meal-plans ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`meal-plans-create:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
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

  const parsed = mealPlanBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, mealType, recipeId, servingsOverride, notes } = parsed.data;

  // Verify recipe ownership
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(recipeId, session.user.id, session.user.role),
    columns: { id: true, title: true, servings: true },
  });

  if (!recipe) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  try {
    const [entry] = await db
      .insert(mealPlans)
      .values({
        userId: session.user.id,
        date,
        mealType,
        recipeId,
        servingsOverride: servingsOverride ?? null,
        notes: notes ?? null,
      })
      .onConflictDoUpdate({
        target: [mealPlans.userId, mealPlans.date, mealPlans.mealType],
        set: {
          recipeId,
          servingsOverride: servingsOverride ?? null,
          notes: notes ?? null,
        },
      })
      .returning();

    return NextResponse.json(
      {
        ...entry,
        recipeTitle: recipe.title,
        recipeServings: recipe.servings,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Fehler beim Erstellen des Wochenplan-Eintrags:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
