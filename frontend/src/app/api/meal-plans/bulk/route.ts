import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { mealPlans, recipes } from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { recipeOwnerConditionMany } from "@/lib/db/helpers";
import { checkRateLimitDistributed, getClientIp } from "@/lib/rate-limit";

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat."),
  mealType: z.enum(["fruehstueck", "mittagessen", "abendessen", "snack"]),
  recipeId: z.string().uuid("Ungültige Rezept-ID."),
  servingsOverride: z.number().int().min(1).optional(),
  notes: z.string().max(2000).optional(),
});

const bulkSchema = z.object({
  entries: z.array(entrySchema).min(1).max(28),
  overwrite: z.boolean().default(false),
});

/**
 * POST /api/meal-plans/bulk — mehrere Slots in einer Transaktion (KI-Wochenplan).
 * Ohne `overwrite` bleiben belegte Slots unangetastet und werden als `skipped` gezählt.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`meal-plans-bulk:${ip}`);
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

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { entries, overwrite } = parsed.data;

  const keys = new Set<string>();
  for (const e of entries) {
    const key = `${e.date}-${e.mealType}`;
    if (keys.has(key)) {
      return NextResponse.json(
        { error: `Platz ${key} ist doppelt im Plan.` },
        { status: 400 },
      );
    }
    keys.add(key);
  }

  const recipeIds = [...new Set(entries.map((e) => e.recipeId))];
  const owned = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      servings: recipes.servings,
    })
    .from(recipes)
    .where(
      recipeOwnerConditionMany(recipeIds, session.user.id, session.user.role),
    );
  const ownedById = new Map(owned.map((r) => [r.id, r]));
  const missing = recipeIds.filter((id) => !ownedById.has(id));
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden.", missing },
      { status: 404 },
    );
  }

  const dates = entries.map((e) => e.date).sort();
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  try {
    const result = await db.transaction(async (tx) => {
      let toWrite = entries;
      let skipped = 0;
      if (!overwrite) {
        const existing = await tx
          .select({ date: mealPlans.date, mealType: mealPlans.mealType })
          .from(mealPlans)
          .where(
            and(
              eq(mealPlans.userId, session.user.id),
              gte(mealPlans.date, minDate),
              lte(mealPlans.date, maxDate),
            ),
          );
        const occupied = new Set(
          existing.map((e) => `${e.date}-${e.mealType}`),
        );
        toWrite = entries.filter(
          (e) => !occupied.has(`${e.date}-${e.mealType}`),
        );
        skipped = entries.length - toWrite.length;
      }
      if (toWrite.length === 0) return { rows: [], skipped };

      const values = toWrite.map((e) => ({
        userId: session.user.id,
        date: e.date,
        mealType: e.mealType,
        recipeId: e.recipeId,
        servingsOverride: e.servingsOverride ?? null,
        notes: e.notes ?? null,
      }));

      const insert = tx.insert(mealPlans).values(values);
      const rows = overwrite
        ? await insert
            .onConflictDoUpdate({
              target: [mealPlans.userId, mealPlans.date, mealPlans.mealType],
              set: {
                recipeId: sqlExcluded("recipe_id"),
                servingsOverride: sqlExcluded("servings_override"),
                notes: sqlExcluded("notes"),
              },
            })
            .returning()
        : await insert
            .onConflictDoNothing({
              target: [mealPlans.userId, mealPlans.date, mealPlans.mealType],
            })
            .returning();
      return { rows, skipped: skipped + (toWrite.length - rows.length) };
    });

    const enriched = result.rows.map((row) => ({
      ...row,
      recipeTitle: ownedById.get(row.recipeId)?.title ?? null,
      recipeServings: ownedById.get(row.recipeId)?.servings ?? null,
    }));
    return NextResponse.json(
      { entries: enriched, skipped: result.skipped },
      { status: 201 },
    );
  } catch (err) {
    console.error("Bulk-Wochenplan fehlgeschlagen:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// `excluded.<spalte>` für ON CONFLICT DO UPDATE — Drizzle hat dafür keinen Helfer.
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

