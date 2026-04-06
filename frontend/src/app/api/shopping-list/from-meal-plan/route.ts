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

  // Collect all unique recipe IDs and batch-fetch servings + ingredients
  const recipeIds = [...new Set(entries.map((e) => e.recipeId))];

  const [recipeRows, allIngs] = await Promise.all([
    db
      .select({ id: recipes.id, servings: recipes.servings })
      .from(recipes)
      .where(inArray(recipes.id, recipeIds)),
    db
      .select()
      .from(ingredients)
      .where(inArray(ingredients.recipeId, recipeIds)),
  ]);

  const recipeServingsMap = new Map(recipeRows.map((r) => [r.id, r.servings]));
  const ingredientsByRecipe = new Map<string, (typeof allIngs)[number][]>();
  for (const ing of allIngs) {
    const list = ingredientsByRecipe.get(ing.recipeId) ?? [];
    list.push(ing);
    ingredientsByRecipe.set(ing.recipeId, list);
  }

  // Build all rows to insert
  const allRows: (typeof shoppingListItems.$inferInsert)[] = [];
  for (const entry of entries) {
    const ings = ingredientsByRecipe.get(entry.recipeId) ?? [];
    const baseServings = recipeServingsMap.get(entry.recipeId) ?? 1;
    const scaleFactor = entry.servingsOverride
      ? entry.servingsOverride / baseServings
      : 1;

    for (const ing of ings) {
      const scaledAmount = ing.amount
        ? parseFloat(ing.amount) * scaleFactor
        : null;

      allRows.push({
        userId: session.user.id,
        ingredientName: ing.name,
        amount: scaledAmount != null ? String(scaledAmount) : undefined,
        unit: ing.unit ?? undefined,
        aisleCategory: getAisleCategory(ing.name),
        mealPlanEntryId: entry.id,
      });
    }
  }

  // Atomic: delete old generated items + bulk insert new ones
  await db.transaction(async (tx) => {
    await tx
      .delete(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.userId, session.user.id),
          inArray(shoppingListItems.mealPlanEntryId, entryIds),
        ),
      );
    if (allRows.length > 0) {
      await tx.insert(shoppingListItems).values(allRows);
    }
  });

  const added = allRows.length;

  const totalResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shoppingListItems)
    .where(eq(shoppingListItems.userId, session.user.id));

  const total = totalResult[0]?.count ?? 0;

  return NextResponse.json({ added, total });
}
