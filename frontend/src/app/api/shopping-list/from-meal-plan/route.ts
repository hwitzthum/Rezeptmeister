import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shoppingListItems, mealPlans, ingredients, recipes } from "@/lib/db/schema";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getAisleCategory } from "@/lib/shopping/aisle-categories";

const fromMealPlanSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── POST /api/shopping-list/from-meal-plan ──────────────────────────────────
// Generates shopping list items from all meal plan entries in a date range.
// Idempotent: deletes previously generated items for the same range, then rebuilds.

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-from-plan:${ip}`);
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
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = fromMealPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { startDate, endDate } = parsed.data;

  // Fetch all meal plan entries for this user in the date range
  const entries = await db
    .select({
      id: mealPlans.id,
      recipeId: mealPlans.recipeId,
      servingsOverride: mealPlans.servingsOverride,
    })
    .from(mealPlans)
    .where(
      and(
        eq(mealPlans.userId, session.user.id),
        gte(mealPlans.date, startDate),
        lte(mealPlans.date, endDate),
      ),
    );

  if (entries.length === 0) {
    return NextResponse.json({ added: 0, merged: 0, total: 0 });
  }

  const entryIds = entries.map((e) => e.id);

  // ── Step 1: Delete previously generated items for these meal plan entries ──
  await db
    .delete(shoppingListItems)
    .where(
      and(
        eq(shoppingListItems.userId, session.user.id),
        inArray(shoppingListItems.mealPlanEntryId, entryIds),
      ),
    );

  // Collect all unique recipe IDs and fetch their ingredients + servings
  const recipeIds = [...new Set(entries.map((e) => e.recipeId))];

  // Fetch recipe servings
  const recipeServingsMap = new Map<string, number>();
  for (const rid of recipeIds) {
    const r = await db.query.recipes.findFirst({
      where: eq(recipes.id, rid),
      columns: { id: true, servings: true },
    });
    if (r) recipeServingsMap.set(r.id, r.servings);
  }

  // Fetch ingredients for all recipes
  const allIngredients = new Map<string, typeof ingredients.$inferSelect[]>();
  for (const rid of recipeIds) {
    const ings = await db.query.ingredients.findMany({
      where: eq(ingredients.recipeId, rid),
    });
    allIngredients.set(rid, ings);
  }

  let added = 0;

  // ── Step 2: Rebuild generated items from scratch ──
  // Always create separate generated items (tagged with mealPlanEntryId).
  // Never merge into manually-added items — that would be irreversible on regeneration.
  for (const entry of entries) {
    const ings = allIngredients.get(entry.recipeId) ?? [];
    const baseServings = recipeServingsMap.get(entry.recipeId) ?? 1;
    const scaleFactor = entry.servingsOverride
      ? entry.servingsOverride / baseServings
      : 1;

    for (const ing of ings) {
      const scaledAmount = ing.amount
        ? parseFloat(ing.amount) * scaleFactor
        : null;

      await db
        .insert(shoppingListItems)
        .values({
          userId: session.user.id,
          ingredientName: ing.name,
          amount: scaledAmount != null ? String(scaledAmount) : undefined,
          unit: ing.unit ?? undefined,
          aisleCategory: getAisleCategory(ing.name),
          mealPlanEntryId: entry.id,
        });

      added++;
    }
  }

  const totalResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.userId, session.user.id));

  const total = totalResult[0]?.count ?? 0;

  return NextResponse.json({ added, total });
}
