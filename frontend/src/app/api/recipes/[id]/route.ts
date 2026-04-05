import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipes, ingredients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { buildBackendHeaders } from "@/lib/backend";
import { recipeBodySchema, calcTotalTime } from "@/lib/schemas";
import { USER_ROLE } from "@/lib/auth";
import { recipeOwnerCondition } from "@/lib/db/helpers";

// ── GET /api/recipes/[id] ─────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`recipes-get:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const ownerCondition = recipeOwnerCondition(id, session.user.id, session.user.role);

  const recipe = await db.query.recipes.findFirst({
    where: ownerCondition,
    columns: { embedding: false },
    with: {
      ingredients: {
        orderBy: (fields, { asc }) => [asc(fields.sortOrder)],
      },
      images: {
        where: (fields, { eq }) => eq(fields.isPrimary, true),
        columns: { embedding: false },
      },
    },
  });

  if (!recipe) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  return NextResponse.json(recipe);
}

// ── PUT /api/recipes/[id] ─────────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`recipes-update:${ip}`);
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

  // Berechtigungsprüfung: nur Besitzer oder Admin
  const existing = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
    columns: { id: true, userId: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  if (existing.userId !== session.user.id && session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  const data = parsed.data;
  const totalTime = calcTotalTime(data.prepTimeMinutes, data.cookTimeMinutes);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(recipes)
        .set({
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
          updatedAt: new Date(),
        })
        .where(eq(recipes.id, id));

      // Zutaten ersetzen: alte löschen, neue einfügen
      await tx.delete(ingredients).where(eq(ingredients.recipeId, id));

      if (data.ingredients.length > 0) {
        await tx.insert(ingredients).values(
          data.ingredients.map((ing, idx) => ({
            recipeId: id,
            name: ing.name,
            amount: ing.amount != null ? String(ing.amount) : null,
            unit: ing.unit || null,
            groupName: ing.groupName || null,
            sortOrder: ing.sortOrder ?? idx,
            isOptional: ing.isOptional,
          })),
        );
      }
    });

    // Fire-and-forget: Embedding neu berechnen
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl) {
      fetch(`${backendUrl}/embed/text`, {
        method: "POST",
        headers: buildBackendHeaders(),
        body: JSON.stringify({
          recipe_id: id,
          text: [data.title, data.description, data.instructions]
            .filter(Boolean)
            .join(" "),
        }),
      }).catch((err) => {
        console.error("Embedding-Neuberechnung fehlgeschlagen:", err);
      });
    }

    const updated = await db.query.recipes.findFirst({
      where: eq(recipes.id, id),
      columns: { embedding: false },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Fehler beim Aktualisieren des Rezepts:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── DELETE /api/recipes/[id] ──────────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`recipes-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const existing = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
    columns: { id: true, userId: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  if (existing.userId !== session.user.id && session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  await db.delete(recipes).where(eq(recipes.id, id));

  return new Response(null, { status: 204 });
}
