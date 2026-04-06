import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { collections, collectionRecipes } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";

const addRecipeSchema = z.object({
  recipeId: z.string().uuid(),
});

const removeRecipeSchema = z.object({
  recipeId: z.string().uuid(),
});

const reorderSchema = z.object({
  order: z.array(
    z.object({
      recipeId: z.string().uuid(),
      sortOrder: z.number().int(),
    }),
  ),
});

/** Verify the collection belongs to the current user. */
async function verifyCollectionOwnership(collectionId: string, userId: string) {
  return db.query.collections.findFirst({
    where: and(
      eq(collections.id, collectionId),
      eq(collections.userId, userId),
    ),
    columns: { id: true },
  });
}

// ── POST /api/collections/[id]/rezepte ── Add recipe ─────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-add-recipe:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const collection = await verifyCollectionOwnership(id, session.user.id);
  if (!collection) {
    return NextResponse.json(
      { error: "Sammlung nicht gefunden." },
      { status: 404 },
    );
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

  const parsed = addRecipeSchema.safeParse(body);
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
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  try {
    // Calculate next sortOrder
    const [maxResult] = await db
      .select({
        maxSort: sql<number>`COALESCE(MAX(${collectionRecipes.sortOrder}), -1) + 1`,
      })
      .from(collectionRecipes)
      .where(eq(collectionRecipes.collectionId, id));

    const nextSort = maxResult?.maxSort ?? 0;

    await db
      .insert(collectionRecipes)
      .values({
        collectionId: id,
        recipeId,
        sortOrder: nextSort,
      })
      .onConflictDoNothing();

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("Fehler beim Hinzufügen des Rezepts zur Sammlung:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── DELETE /api/collections/[id]/rezepte ── Remove recipe ────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-remove-recipe:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const collection = await verifyCollectionOwnership(id, session.user.id);
  if (!collection) {
    return NextResponse.json(
      { error: "Sammlung nicht gefunden." },
      { status: 404 },
    );
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

  const parsed = removeRecipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { recipeId } = parsed.data;

  try {
    await db
      .delete(collectionRecipes)
      .where(
        and(
          eq(collectionRecipes.collectionId, id),
          eq(collectionRecipes.recipeId, recipeId),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Entfernen des Rezepts aus der Sammlung:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── PATCH /api/collections/[id]/rezepte ── Reorder ───────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-reorder:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const collection = await verifyCollectionOwnership(id, session.user.id);
  if (!collection) {
    return NextResponse.json(
      { error: "Sammlung nicht gefunden." },
      { status: 404 },
    );
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await db.transaction(async (tx) => {
      for (const entry of parsed.data.order) {
        await tx
          .update(collectionRecipes)
          .set({ sortOrder: entry.sortOrder })
          .where(
            and(
              eq(collectionRecipes.collectionId, id),
              eq(collectionRecipes.recipeId, entry.recipeId),
            ),
          );
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Sortieren der Rezepte:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
