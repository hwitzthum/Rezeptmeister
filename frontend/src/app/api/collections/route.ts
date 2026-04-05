import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { collections, collectionRecipes, images } from "@/lib/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  coverImageId: z.string().uuid().optional().nullable(),
});

// ── GET /api/collections ─────────────────────────────────────────────────────

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-list:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const userCollections = await db.query.collections.findMany({
      where: eq(collections.userId, session.user.id),
      orderBy: [desc(collections.createdAt)],
    });

    // Fetch recipe counts per collection
    let countMap = new Map<string, number>();
    if (userCollections.length > 0) {
      const counts = await db
        .select({
          collectionId: collectionRecipes.collectionId,
          count: sql<number>`count(*)::int`,
        })
        .from(collectionRecipes)
        .where(
          inArray(
            collectionRecipes.collectionId,
            userCollections.map((c) => c.id),
          ),
        )
        .groupBy(collectionRecipes.collectionId);

      countMap = new Map(counts.map((c) => [c.collectionId, c.count]));
    }

    // Fetch cover images: explicit coverImageId or first recipe's primary image
    const coverImageMap = new Map<string, string | null>();

    // 1) Collections with explicit cover images
    const withCoverImage = userCollections.filter((c) => c.coverImageId);
    if (withCoverImage.length > 0) {
      const coverImages = await db
        .select({ id: images.id, filePath: images.filePath })
        .from(images)
        .where(
          inArray(
            images.id,
            withCoverImage.map((c) => c.coverImageId!),
          ),
        );
      for (const img of coverImages) {
        const col = withCoverImage.find((c) => c.coverImageId === img.id);
        if (col) coverImageMap.set(col.id, img.filePath);
      }
    }

    // 2) Collections without cover image: get first recipe's primary image
    const withoutCoverImage = userCollections.filter(
      (c) => !c.coverImageId && !coverImageMap.has(c.id),
    );
    if (withoutCoverImage.length > 0) {
      for (const col of withoutCoverImage) {
        const firstRecipeImage = await db
          .select({ filePath: images.filePath })
          .from(collectionRecipes)
          .innerJoin(
            images,
            sql`${images.recipeId} = ${collectionRecipes.recipeId} AND ${images.isPrimary} = true`,
          )
          .where(eq(collectionRecipes.collectionId, col.id))
          .orderBy(collectionRecipes.sortOrder)
          .limit(1);

        if (firstRecipeImage.length > 0) {
          coverImageMap.set(col.id, firstRecipeImage[0].filePath);
        }
      }
    }

    const result = userCollections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      recipeCount: countMap.get(c.id) ?? 0,
      coverImageUrl: coverImageMap.get(c.id) ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ collections: result });
  } catch (err) {
    console.error("Fehler beim Laden der Sammlungen:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── POST /api/collections ────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`collections-create:${ip}`);
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
      { error: "Ungueltiger JSON-Body." },
      { status: 400 },
    );
  }

  const parsed = createCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, description, coverImageId } = parsed.data;

  try {
    const [collection] = await db
      .insert(collections)
      .values({
        userId: session.user.id,
        name,
        description: description ?? null,
        coverImageId: coverImageId ?? null,
      })
      .returning();

    return NextResponse.json(collection, { status: 201 });
  } catch (err) {
    console.error("Fehler beim Erstellen der Sammlung:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
