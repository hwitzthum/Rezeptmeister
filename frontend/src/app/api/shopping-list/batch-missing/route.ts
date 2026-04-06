import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shoppingListItems, ingredients } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import { getAisleCategory } from "@/lib/shopping/aisle-categories";
import { filterMissingIngredients } from "@/lib/shopping/ingredient-match";

const batchMissingSchema = z.object({
  recipeId: z.string().uuid(),
  availableIngredients: z.array(z.string().min(1).max(255)),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-batch-missing:${ip}`);
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

  const parsed = batchMissingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { recipeId, availableIngredients } = parsed.data;

  // Verify recipe ownership
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(recipeId, session.user.id, session.user.role),
    columns: { id: true },
  });
  if (!recipe) {
    return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
  }

  // Fetch non-optional recipe ingredients
  const recipeIngredients = await db.query.ingredients.findMany({
    where: eq(ingredients.recipeId, recipeId),
  });

  // Filter to only missing ingredients (exact normalized match, not substring)
  const missingIngredients = filterMissingIngredients(recipeIngredients, availableIngredients);

  if (missingIngredients.length === 0) {
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.userId, session.user.id));
    return NextResponse.json({ added: 0, merged: 0, total: totalResult[0]?.count ?? 0 });
  }

  // Transactional upsert: each item is queried fresh inside the tx to
  // prevent stale-snapshot duplicates under concurrent requests.
  const result = await db.transaction(async (tx) => {
    let txAdded = 0;
    let txMerged = 0;

    for (const ing of missingIngredients) {
      const ingNameLower = ing.name.toLowerCase().trim();
      const ingUnit = (ing.unit ?? "").toLowerCase().trim();

      // Fresh per-item lookup inside the transaction
      const [existing] = await tx
        .select()
        .from(shoppingListItems)
        .where(
          and(
            eq(shoppingListItems.userId, session.user.id),
            sql`lower(trim(${shoppingListItems.ingredientName})) = ${ingNameLower}`,
            sql`lower(trim(coalesce(${shoppingListItems.unit}, ''))) = ${ingUnit}`,
          ),
        )
        .limit(1);

      if (existing) {
        // Merge: sum amounts if both are numeric
        const existingAmount = existing.amount ? parseFloat(existing.amount) : null;
        const newAmount = ing.amount ? parseFloat(ing.amount) : null;

        if (existingAmount != null && newAmount != null) {
          const summed = existingAmount + newAmount;
          await tx
            .update(shoppingListItems)
            .set({ amount: String(summed) })
            .where(eq(shoppingListItems.id, existing.id));
        }
        txMerged++;
      } else {
        await tx.insert(shoppingListItems).values({
          userId: session.user.id,
          recipeId,
          ingredientName: ing.name,
          amount: ing.amount ?? undefined,
          unit: ing.unit ?? undefined,
          aisleCategory: getAisleCategory(ing.name),
        });
        txAdded++;
      }
    }

    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(shoppingListItems)
      .where(eq(shoppingListItems.userId, session.user.id));

    return { added: txAdded, merged: txMerged, total: countRow?.count ?? 0 };
  });

  return NextResponse.json(result);
}
