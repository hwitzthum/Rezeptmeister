import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  collections,
  collectionRecipes,
  recipes,
  images,
} from "@/lib/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  coverImageId: z.string().uuid().optional().nullable(),
});

// ── GET /api/collections/[id] ────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-detail:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const collection = await db.query.collections.findFirst({
      where: and(
        eq(collections.id, id),
        eq(collections.userId, session.user.id),
      ),
    });

    if (!collection) {
      return NextResponse.json(
        { error: "Sammlung nicht gefunden." },
        { status: 404 },
      );
    }

    // Fetch recipes in collection via join
    const recipesInCollection = await db
      .select({
        sortOrder: collectionRecipes.sortOrder,
        recipeId: recipes.id,
        title: recipes.title,
        category: recipes.category,
        totalTimeMinutes: recipes.totalTimeMinutes,
        difficulty: recipes.difficulty,
        servings: recipes.servings,
        isFavorite: recipes.isFavorite,
      })
      .from(collectionRecipes)
      .innerJoin(recipes, eq(collectionRecipes.recipeId, recipes.id))
      .where(eq(collectionRecipes.collectionId, id))
      .orderBy(asc(collectionRecipes.sortOrder));

    // Batch-fetch primary images for those recipe IDs
    const recipeIds = recipesInCollection.map((r) => r.recipeId);
    let imageMap = new Map<string, string>();

    if (recipeIds.length > 0) {
      const primaryImages = await db
        .select({
          recipeId: images.recipeId,
          filePath: images.filePath,
        })
        .from(images)
        .where(
          and(
            inArray(images.recipeId, recipeIds),
            eq(images.isPrimary, true),
          ),
        );

      imageMap = new Map(
        primaryImages
          .filter((i) => i.recipeId !== null)
          .map((i) => [i.recipeId!, i.filePath]),
      );
    }

    const recipesWithImages = recipesInCollection.map((r) => ({
      ...r,
      thumbnailUrl: imageMap.get(r.recipeId) ?? null,
    }));

    return NextResponse.json({
      collection: {
        ...collection,
        createdAt: collection.createdAt.toISOString(),
      },
      recipes: recipesWithImages,
    });
  } catch (err) {
    console.error("Fehler beim Laden der Sammlung:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── PUT /api/collections/[id] ────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-update:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Verify ownership
  const existing = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, id),
      eq(collections.userId, session.user.id),
    ),
    columns: { id: true },
  });

  if (!existing) {
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
      { error: "Ungueltiger JSON-Body." },
      { status: 400 },
    );
  }

  const parsed = updateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    updates.description = parsed.data.description;
  if (parsed.data.coverImageId !== undefined)
    updates.coverImageId = parsed.data.coverImageId;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Keine Aenderungen angegeben." },
      { status: 400 },
    );
  }

  try {
    const [updated] = await db
      .update(collections)
      .set(updates)
      .where(eq(collections.id, id))
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Fehler beim Aktualisieren der Sammlung:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── DELETE /api/collections/[id] ─────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Verify ownership
  const existing = await db.query.collections.findFirst({
    where: and(
      eq(collections.id, id),
      eq(collections.userId, session.user.id),
    ),
    columns: { id: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Sammlung nicht gefunden." },
      { status: 404 },
    );
  }

  try {
    await db.delete(collections).where(eq(collections.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Loeschen der Sammlung:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
