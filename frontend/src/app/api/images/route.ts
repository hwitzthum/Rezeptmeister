import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { thumbnailUrl } from "@/lib/images";

const listQuerySchema = z.object({
  rezeptId: z.string().uuid().optional(),
  /** true = ohne Rezept; false = mit Rezept (zugeordnet) */
  unzugeordnet: z.enum(["true", "false"]).optional(),
  seite: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`images-list:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Parameter." }, { status: 400 });
  }

  const { rezeptId, unzugeordnet, seite, limit } = parsed.data;

  const conditions = [eq(images.userId, session.user.id)];
  if (rezeptId) conditions.push(eq(images.recipeId, rezeptId));
  if (unzugeordnet === "true") conditions.push(isNull(images.recipeId));
  if (unzugeordnet === "false") conditions.push(isNotNull(images.recipeId)); // "zugeordnet" filter

  const where = and(...conditions);

  try {
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(images)
      .where(where);

    const rows = await db
      .select({
        id: images.id,
        userId: images.userId,
        recipeId: images.recipeId,
        filePath: images.filePath,
        fileName: images.fileName,
        mimeType: images.mimeType,
        fileSizeBytes: images.fileSizeBytes,
        width: images.width,
        height: images.height,
        isPrimary: images.isPrimary,
        sourceType: images.sourceType,
        altText: images.altText,
        createdAt: images.createdAt,
      })
      .from(images)
      .where(where)
      .orderBy(desc(images.createdAt))
      .limit(limit)
      .offset((seite - 1) * limit);

    const result = rows.map((row) => ({
      ...row,
      thumbnailUrl: thumbnailUrl(row.filePath),
    }));

    return NextResponse.json({
      images: result,
      total,
      seite,
      hasMore: seite * limit < total,
    });
  } catch (error) {
    console.error("Bilder-Abfrage fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
