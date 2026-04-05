import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipes, ingredients } from "@/lib/db/schema";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { buildBackendHeaders } from "@/lib/backend";
import { recipeBodySchema, calcTotalTime } from "@/lib/schemas";

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  kategorie: z.string().max(100).optional(),
  kueche: z.string().max(100).optional(),
  schwierigkeit: z.enum(["einfach", "mittel", "anspruchsvoll"]).optional(),
  favoriten: z.enum(["true", "false"]).optional(),
  seite: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortierung: z
    .enum(["neueste", "alphabetisch", "bearbeitet"])
    .default("neueste"),
});

// ── POST /api/recipes ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`recipes-create:${ip}`);
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

  const parsed = recipeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const totalTime = calcTotalTime(data.prepTimeMinutes, data.cookTimeMinutes);

  try {
    const recipe = await db.transaction(async (tx) => {
      const [newRecipe] = await tx
        .insert(recipes)
        .values({
          userId: session.user.id,
          title: data.title,
          description: data.description || null,
          instructions: data.instructions,
          servings: data.servings,
          prepTimeMinutes: data.prepTimeMinutes ?? null,
          cookTimeMinutes: data.cookTimeMinutes ?? null,
          totalTimeMinutes: totalTime,
          difficulty: data.difficulty ?? null,
          category: data.category || null,
          cuisine: data.cuisine || null,
          tags: data.tags,
          sourceType: data.sourceType,
        })
        .returning();

      if (data.ingredients.length > 0) {
        await tx.insert(ingredients).values(
          data.ingredients.map((ing, idx) => ({
            recipeId: newRecipe.id,
            name: ing.name,
            amount: ing.amount != null ? String(ing.amount) : null,
            unit: ing.unit || null,
            groupName: ing.groupName || null,
            sortOrder: ing.sortOrder ?? idx,
            isOptional: ing.isOptional,
          })),
        );
      }

      return newRecipe;
    });

    // Fire-and-forget: Embedding im Hintergrund berechnen
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl) {
      fetch(`${backendUrl}/embed/text`, {
        method: "POST",
        headers: buildBackendHeaders(),
        body: JSON.stringify({
          recipe_id: recipe.id,
          text: [recipe.title, recipe.description, recipe.instructions]
            .filter(Boolean)
            .join(" "),
        }),
      }).catch((err) => {
        console.error("Embedding-Berechnung fehlgeschlagen:", err);
      });
    }

    return NextResponse.json(recipe, { status: 201 });
  } catch (err) {
    console.error("Fehler beim Erstellen des Rezepts:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── GET /api/recipes ──────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`recipes-list:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Parameter." }, { status: 400 });
  }

  const { q, kategorie, kueche, schwierigkeit, favoriten, seite, limit, sortierung } =
    parsed.data;

  const conditions = [eq(recipes.userId, session.user.id)];
  if (q) conditions.push(ilike(recipes.title, `%${q}%`));
  if (kategorie) conditions.push(eq(recipes.category, kategorie));
  if (kueche) conditions.push(eq(recipes.cuisine, kueche));
  if (schwierigkeit)
    conditions.push(eq(recipes.difficulty, schwierigkeit));
  if (favoriten === "true") conditions.push(eq(recipes.isFavorite, true));

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(recipes)
    .where(where);

  const orderBy =
    sortierung === "alphabetisch"
      ? asc(recipes.title)
      : sortierung === "bearbeitet"
        ? desc(recipes.updatedAt)
        : desc(recipes.createdAt);

  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      description: recipes.description,
      category: recipes.category,
      cuisine: recipes.cuisine,
      difficulty: recipes.difficulty,
      totalTimeMinutes: recipes.totalTimeMinutes,
      servings: recipes.servings,
      isFavorite: recipes.isFavorite,
      tags: recipes.tags,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
    })
    .from(recipes)
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset((seite - 1) * limit);

  return NextResponse.json({
    recipes: rows,
    total,
    seite,
    hasMore: seite * limit < total,
  });
}
