import path from "path";
import fs from "fs";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/auth";
import { z } from "zod";
import { buildAiHeaders, buildBackendHeaders } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimit, getClientIp, AI_LIMIT } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { images, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  MIME_TO_EXT,
  UPLOAD_BASE,
  UPLOAD_API_PREFIX,
  thumbnailUrl,
  type AllowedImageMime,
} from "@/lib/images";

const bodySchema = z.object({
  url: z.string().url(),
});

/** Fetch an external image URL, store it locally, return the imageId or null on failure. */
async function fetchAndStoreImage(
  imageUrl: string,
  userId: string,
  geminiKey: string | null,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Rezeptmeister/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_IMAGE_MIME.includes(contentType as AllowedImageMime)) return null;

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) return null;

    const imageId = crypto.randomUUID();
    const ext = MIME_TO_EXT[contentType as AllowedImageMime] ?? ".jpg";
    const originalFileName = `${imageId}${ext}`;
    const thumbFileName = `${imageId}.webp`;

    const originalsDir = path.join(UPLOAD_BASE, "originals");
    const thumbsDir = path.join(UPLOAD_BASE, "thumbnails");

    const s = sharp(buffer);
    const [meta, thumbBuffer] = await Promise.all([
      s.metadata(),
      s.clone().resize(300, 300, { fit: "cover", position: "centre" }).webp({ quality: 80 }).toBuffer(),
    ]);

    await Promise.all([
      fs.promises.mkdir(originalsDir, { recursive: true }),
      fs.promises.mkdir(thumbsDir, { recursive: true }),
    ]);
    await Promise.all([
      fs.promises.writeFile(path.join(originalsDir, originalFileName), buffer),
      fs.promises.writeFile(path.join(thumbsDir, thumbFileName), thumbBuffer),
    ]);

    const filePath = `${UPLOAD_API_PREFIX}/originals/${originalFileName}`;
    await db.insert(images).values({
      id: imageId,
      userId,
      recipeId: null,
      filePath,
      fileName: originalFileName,
      mimeType: contentType,
      fileSizeBytes: buffer.length,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sourceType: "web_import",
      isPrimary: false,
    });

    // Fire-and-forget image embedding
    const backendUrl = process.env.BACKEND_URL;
    if (backendUrl) {
      const headers = geminiKey ? buildAiHeaders(geminiKey) : buildBackendHeaders();
      fetch(`${backendUrl}/embed/image`, {
        method: "POST",
        headers,
        body: JSON.stringify({ image_id: imageId }),
        signal: AbortSignal.timeout(60_000),
      }).catch(() => {});
    }

    return imageId;
  } catch (err) {
    console.warn("Bild-Import fehlgeschlagen (nicht kritisch):", err);
    return null;
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`import-url:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)) },
      },
    );
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingaben.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const keyResult = await resolveGeminiKey(session.user.id);
  if (!keyResult.ok) return keyResult.response;
  const geminiKey = keyResult.key;

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json({ error: "Backend nicht erreichbar." }, { status: 503 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${backendUrl}/import/url`, {
      method: "POST",
      headers: buildAiHeaders(geminiKey),
      body: JSON.stringify({
        ...parsed.data,
        user_id: session.user.id,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    let detail = "URL-Import fehlgeschlagen.";
    try {
      const err = (await backendRes.json()) as { detail?: string };
      if (err.detail) detail = err.detail;
    } catch { /* ignore */ }
    return NextResponse.json({ error: detail }, { status: backendRes.status });
  }

  const result = await backendRes.json() as Record<string, unknown>;

  // Auto-fetch hero image if the backend extracted an image_url
  let imageId: string | null = null;
  if (typeof result.image_url === "string" && result.image_url) {
    // Resolve Gemini key for embedding (best-effort)
    let geminiKeyForEmbed: string | null = null;
    try {
      const userRecord = await db.query.users.findFirst({
        where: eq(users.id, session.user.id),
        columns: { apiKeyEncrypted: true, apiProvider: true },
      });
      if (userRecord?.apiProvider === "gemini" && userRecord.apiKeyEncrypted) {
        geminiKeyForEmbed = decrypt(userRecord.apiKeyEncrypted);
      }
    } catch { /* ignore */ }

    imageId = await fetchAndStoreImage(result.image_url, session.user.id, geminiKeyForEmbed);
  }

  return NextResponse.json({ ...result, imageId });
}
