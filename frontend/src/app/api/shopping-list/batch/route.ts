import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shoppingListItems, ingredients } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import { getAisleCategory } from "@/lib/shopping/aisle-categories";

const batchAddSchema = z.object({
  recipeId: z.string().uuid(),
});

const batchActionSchema = z.object({
  action: z.enum(["check-all", "uncheck-all"]),
});

// -- POST /api/shopping-list/batch  (batch-add from recipe) ----------------

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-batch-add:${ip}`);
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
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }

  const parsed = batchAddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { recipeId } = parsed.data;

  // Verify recipe ownership
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(recipeId, session.user.id, session.user.role),
    columns: { id: true },
  });
  if (!recipe) {
    return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
  }

  // Fetch recipe ingredients
  const recipeIngredients = await db.query.ingredients.findMany({
    where: eq(ingredients.recipeId, recipeId),
  });

  if (recipeIngredients.length === 0) {
    return NextResponse.json({ added: 0, merged: 0, total: 0 });
  }

  // Transactional upsert: each item is queried fresh inside the tx to
  // prevent stale-snapshot duplicates under concurrent requests.
  const result = await db.transaction(async (tx) => {
    let txAdded = 0;
    let txMerged = 0;

    for (const ing of recipeIngredients) {
      const ingNameLower = ing.name.toLowerCase().trim();
      const ingUnit = (ing.unit ?? "").toLowerCase().trim();

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
        const existingAmount = existing.amount ? parseFloat(existing.amount) : null;
        const newAmount = ing.amount ? parseFloat(ing.amount) : null;

        if (existingAmount != null && newAmount != null) {
          await tx
            .update(shoppingListItems)
            .set({ amount: String(existingAmount + newAmount) })
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

// -- PATCH /api/shopping-list/batch  (check-all / uncheck-all) -------------

export async function PATCH(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-batch-action:${ip}`);
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
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }

  const parsed = batchActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const isChecked = parsed.data.action === "check-all";

  const result = await db
    .update(shoppingListItems)
    .set({ isChecked })
    .where(eq(shoppingListItems.userId, session.user.id))
    .returning();

  return NextResponse.json({ updated: result.length });
}

// -- DELETE /api/shopping-list/batch  (clear checked) ----------------------

export async function DELETE(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-batch-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const result = await db
    .delete(shoppingListItems)
    .where(
      and(
        eq(shoppingListItems.userId, session.user.id),
        eq(shoppingListItems.isChecked, true),
      ),
    )
    .returning();

  return NextResponse.json({ deleted: result.length });
}
