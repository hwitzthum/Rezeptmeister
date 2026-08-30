import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimitDistributed, getClientIp } from "@/lib/rate-limit";
import { recipeBodySchema } from "@/lib/schemas";
import { listQuerySchema, listRecipes } from "@/lib/recipes/list";
import { createRecipe, scheduleTextEmbeddings } from "@/lib/recipes/create";

// ── POST /api/recipes ─────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`recipes-create:${ip}`);
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

  const postBodySchema = recipeBodySchema.extend({
    imageId: z.string().uuid().optional(),
  });

  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { imageId, ...data } = parsed.data;

  // If an imageId was supplied, verify it belongs to this user before entering
  // the transaction — fail fast with a clear error rather than a silent rollback.
  if (imageId) {
    const [img] = await db
      .select({ id: images.id })
      .from(images)
      .where(and(eq(images.id, imageId), eq(images.userId, session.user.id)))
      .limit(1);
    if (!img) {
      return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
    }
  }

  try {
    const recipe = await db.transaction(async (tx) => {
      const newRecipe = await createRecipe(tx, session.user.id, data);

      // Atomically link the image to this recipe within the same transaction.
      if (imageId) {
        await tx
          .update(images)
          .set({ recipeId: newRecipe.id })
          .where(and(eq(images.id, imageId), eq(images.userId, session.user.id)));
      }

      return newRecipe;
    });

    // Fire-and-forget: Embedding im Hintergrund berechnen (nur wenn Gemini-Schlüssel vorhanden)
    void scheduleTextEmbeddings(session.user.id, [recipe]);

    return NextResponse.json(recipe, { status: 201 });
  } catch (err) {
    console.error("Fehler beim Erstellen des Rezepts", { message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

// ── GET /api/recipes ──────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`recipes-list:${ip}`);
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

  const result = await listRecipes(session.user.id, parsed.data);
  return NextResponse.json(result);
}
