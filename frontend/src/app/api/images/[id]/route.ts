import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { USER_ROLE } from "@/lib/auth";
import { db } from "@/lib/db";
import { images, recipes } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { thumbnailUrl, stripImageColumns, UPLOAD_API_PREFIX } from "@/lib/images";
import { deleteFromStorage } from "@/lib/supabase-storage";

const patchSchema = z.object({
  recipeId: z.string().uuid().nullable().optional(),
  isPrimary: z.boolean().optional(),
  altText: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ip = getClientIp(request);
  const rl = checkRateLimit(`images-patch:${ip}`);
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const [existing] = await db
    .select({ id: images.id, userId: images.userId, recipeId: images.recipeId })
    .from(images)
    .where(eq(images.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
  }
  if (existing.userId !== session.user.id && session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  // Verify ownership of target recipe when reassigning
  if (data.recipeId != null) {
    const [recipe] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, data.recipeId), eq(recipes.userId, session.user.id)))
      .limit(1);
    if (!recipe) {
      return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
    }
  }

  const targetRecipeId =
    data.recipeId !== undefined ? data.recipeId : existing.recipeId;

  if (data.isPrimary === true && !targetRecipeId) {
    return NextResponse.json(
      {
        error:
          "Bild muss einem Rezept zugeordnet sein um als Hauptbild markiert zu werden.",
      },
      { status: 400 },
    );
  }

  const updateData: Partial<{
    recipeId: string | null;
    isPrimary: boolean;
    altText: string | null;
  }> = {};
  if (data.recipeId !== undefined) updateData.recipeId = data.recipeId;
  if (data.isPrimary !== undefined) updateData.isPrimary = data.isPrimary;
  if (data.altText !== undefined) updateData.altText = data.altText;

  let updatedImage: typeof images.$inferSelect;
  try {
    updatedImage = await db.transaction(async (tx) => {
      if (data.isPrimary === true && targetRecipeId) {
        await tx
          .update(images)
          .set({ isPrimary: false })
          .where(
            and(
              eq(images.recipeId, targetRecipeId),
              eq(images.userId, session.user.id),
              ne(images.id, id),
            ),
          );
      }
      const [updated] = await tx
        .update(images)
        .set(updateData)
        .where(and(eq(images.id, id), eq(images.userId, session.user.id)))
        .returning();
      return updated;
    });
  } catch (err) {
    console.error("Fehler beim Aktualisieren des Bildes:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  return NextResponse.json({
    ...stripImageColumns(updatedImage),
    thumbnailUrl: thumbnailUrl(updatedImage.filePath),
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ip = getClientIp(request);
  const rl = checkRateLimit(`images-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const [existing] = await db
    .select({ id: images.id, userId: images.userId, filePath: images.filePath })
    .from(images)
    .where(eq(images.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Bild nicht gefunden." }, { status: 404 });
  }
  if (existing.userId !== session.user.id && session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 });
  }

  // Delete DB record first (rollbackable); then remove files from storage
  await db.delete(images).where(eq(images.id, id));

  // Convert API path to storage path: /api/uploads/originals/uuid.jpg → originals/uuid.jpg
  const storagePath = existing.filePath.replace(`${UPLOAD_API_PREFIX}/`, "");
  const thumbStoragePath = thumbnailUrl(existing.filePath).replace(`${UPLOAD_API_PREFIX}/`, "");
  await Promise.allSettled([
    deleteFromStorage(storagePath),
    deleteFromStorage(thumbStoragePath),
  ]);

  return new Response(null, { status: 204 });
}
