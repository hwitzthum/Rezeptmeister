import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { mealPlans, recipes } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";

const mealPlanUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat.").optional(),
  mealType: z.enum(["fruehstueck", "mittagessen", "abendessen", "snack"]).optional(),
  recipeId: z.string().uuid("Ungültige Rezept-ID.").optional(),
  servingsOverride: z.number().int().min(1).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ── PUT /api/meal-plans/[id] ─────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`meal-plans-update:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Verify ownership
  const existing = await db
    .select({
      id: mealPlans.id,
      userId: mealPlans.userId,
      date: mealPlans.date,
      mealType: mealPlans.mealType,
    })
    .from(mealPlans)
    .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, session.user.id)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json(
      { error: "Wochenplan-Eintrag nicht gefunden." },
      { status: 404 },
    );
  }

  const currentEntry = existing[0];

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400 },
    );
  }

  const parsed = mealPlanUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // If recipeId is changing, verify new recipe ownership
  if (parsed.data.recipeId) {
    const recipe = await db.query.recipes.findFirst({
      where: recipeOwnerCondition(
        parsed.data.recipeId,
        session.user.id,
        session.user.role,
      ),
      columns: { id: true },
    });
    if (!recipe) {
      return NextResponse.json(
        { error: "Rezept nicht gefunden." },
        { status: 404 },
      );
    }
  }

  // Check for slot collision when date or mealType changes
  const targetDate = parsed.data.date ?? currentEntry.date;
  const targetMealType = parsed.data.mealType ?? currentEntry.mealType;

  if (targetDate !== currentEntry.date || targetMealType !== currentEntry.mealType) {
    const collision = await db
      .select({ id: mealPlans.id })
      .from(mealPlans)
      .where(
        and(
          eq(mealPlans.userId, session.user.id),
          eq(mealPlans.date, targetDate),
          eq(mealPlans.mealType, targetMealType),
          ne(mealPlans.id, id),
        ),
      )
      .limit(1);

    if (collision.length > 0) {
      return NextResponse.json(
        { error: "Dieser Platz ist bereits belegt." },
        { status: 409 },
      );
    }
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.date !== undefined) updates.date = parsed.data.date;
  if (parsed.data.mealType !== undefined) updates.mealType = parsed.data.mealType;
  if (parsed.data.recipeId !== undefined) updates.recipeId = parsed.data.recipeId;
  if (parsed.data.servingsOverride !== undefined)
    updates.servingsOverride = parsed.data.servingsOverride ?? null;
  if (parsed.data.notes !== undefined)
    updates.notes = parsed.data.notes ?? null;

  try {
    const [updated] = await db
      .update(mealPlans)
      .set(updates)
      .where(
        and(eq(mealPlans.id, id), eq(mealPlans.userId, session.user.id)),
      )
      .returning();

    // Fetch recipe title for response
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, updated.recipeId),
      columns: { title: true, servings: true },
    });

    return NextResponse.json({
      ...updated,
      recipeTitle: recipe?.title ?? null,
      recipeServings: recipe?.servings ?? null,
    });
  } catch (err) {
    console.error("Fehler beim Aktualisieren des Wochenplan-Eintrags:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── DELETE /api/meal-plans/[id] ──────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`meal-plans-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Verify ownership
  const existing = await db
    .select({ id: mealPlans.id })
    .from(mealPlans)
    .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, session.user.id)))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json(
      { error: "Wochenplan-Eintrag nicht gefunden." },
      { status: 404 },
    );
  }

  await db
    .delete(mealPlans)
    .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
