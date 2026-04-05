import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { images, recipes, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { buildBackendHeaders, buildAiHeaders } from "@/lib/backend";
import { decrypt } from "@/lib/crypto";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  MIME_TO_EXT,
  UPLOAD_BASE,
  UPLOAD_API_PREFIX,
  thumbnailUrl,
  stripImageColumns,
} from "@/lib/images";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`images-upload:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültiger Multipart-Body." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Kein Bild übergeben." }, { status: 400 });
  }

  // Optional atomic recipe assignment during upload
  const recipeIdRaw = formData.get("recipeId");
  let recipeId: string | null = null;
  if (typeof recipeIdRaw === "string" && recipeIdRaw) {
    const parsed = z.string().uuid().safeParse(recipeIdRaw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Ungültige recipeId." }, { status: 400 });
    }
    const [recipe] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(and(eq(recipes.id, parsed.data), eq(recipes.userId, session.user.id)))
      .limit(1);
    if (!recipe) {
      return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
    }
    recipeId = parsed.data;
  }

  if (!ALLOWED_IMAGE_MIME.includes(file.type as (typeof ALLOWED_IMAGE_MIME)[number])) {
    return NextResponse.json(
      { error: "Nicht unterstütztes Bildformat. Erlaubt: JPEG, PNG, WebP." },
      { status: 415 },
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Bild zu gross. Maximum: 10 MB." },
      { status: 413 },
    );
  }

  const imageId = crypto.randomUUID();
  const ext = MIME_TO_EXT[file.type as keyof typeof MIME_TO_EXT] ?? ".jpg";
  const originalFileName = `${imageId}${ext}`;
  const thumbFileName = `${imageId}.webp`;

  const originalsDir = path.join(UPLOAD_BASE, "originals");
  const thumbsDir = path.join(UPLOAD_BASE, "thumbnails");
  const originalPath = path.join(originalsDir, originalFileName);
  const thumbPath = path.join(thumbsDir, thumbFileName);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Single sharp instance: get metadata and generate thumbnail concurrently.
  // metadata() reads only the image header; clone() runs the resize pipeline.
  const s = sharp(buffer);
  let meta: sharp.Metadata;
  let thumbBuffer: Buffer;
  try {
    [meta, thumbBuffer] = await Promise.all([
      s.metadata(),
      s.clone().resize(300, 300, { fit: "cover", position: "centre" }).webp({ quality: 80 }).toBuffer(),
    ]);
  } catch {
    return NextResponse.json(
      { error: "Nicht unterstütztes Bildformat. Erlaubt: JPEG, PNG, WebP." },
      { status: 415 },
    );
  }

  // Ensure upload directories exist, then write files in parallel
  await Promise.all([
    fs.promises.mkdir(originalsDir, { recursive: true }),
    fs.promises.mkdir(thumbsDir, { recursive: true }),
  ]);

  try {
    await Promise.all([
      fs.promises.writeFile(originalPath, buffer),
      fs.promises.writeFile(thumbPath, thumbBuffer),
    ]);
  } catch (err) {
    await Promise.allSettled([
      fs.promises.unlink(originalPath),
      fs.promises.unlink(thumbPath),
    ]);
    console.error("Fehler beim Schreiben der Bilddateien:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  const filePath = `${UPLOAD_API_PREFIX}/originals/${originalFileName}`;

  let image: typeof images.$inferSelect;
  try {
    const [inserted] = await db
      .insert(images)
      .values({
        id: imageId,
        userId: session.user.id,
        recipeId,
        filePath,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        width: meta.width ?? null,
        height: meta.height ?? null,
        sourceType: "upload",
        isPrimary: false,
      })
      .returning();
    image = inserted;
  } catch (err) {
    await Promise.allSettled([
      fs.promises.unlink(originalPath),
      fs.promises.unlink(thumbPath),
    ]);
    console.error("Fehler beim Speichern des Bildes in der Datenbank:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }

  // Fire-and-forget Bild-Embedding (nur wenn Gemini-Schlüssel vorhanden)
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { apiKeyEncrypted: true, apiProvider: true },
    });
    let geminiKey: string | null = null;
    if (userRecord?.apiProvider === "gemini" && userRecord.apiKeyEncrypted) {
      try { geminiKey = decrypt(userRecord.apiKeyEncrypted); } catch { /* Schlüssel beschädigt */ }
    }
    const headers = geminiKey ? buildAiHeaders(geminiKey) : buildBackendHeaders();
    fetch(`${backendUrl}/embed/image`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image_id: imageId }),
    }).catch((err) => {
      console.error("Bild-Embedding-Berechnung fehlgeschlagen:", err);
    });
  }

  return NextResponse.json(
    { ...stripImageColumns(image), thumbnailUrl: thumbnailUrl(filePath) },
    { status: 201 },
  );
}
