import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/auth";
import { z } from "zod";
import {
  buildAiHeaders,
  buildBackendHeaders,
  fetchBackendWithRetry,
} from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimitDistributed, getClientIp, AI_LIMIT } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { images, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  MIME_TO_EXT,
  UPLOAD_API_PREFIX,
  type AllowedImageMime,
} from "@/lib/images";
import { uploadToStorage } from "@/lib/supabase-storage";
import { isSafeExternalUrl, pinnedGet, type PinnedResponse } from "@/lib/ssrf-guard";

/**
 * Ist die Seite gegen serverseitige Abrufe geschützt (Cloudflare & Co.), holt das
 * Backend den Inhalt über Geminis url_context-Tool und extrahiert ihn danach
 * strukturiert — zwei KI-Aufrufe nacheinander. Ohne angehobene Funktionslaufzeit
 * würde die Plattform den Aufruf vor dem 120-s-Proxy-Timeout abschneiden.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  url: z.string().url().max(2048),
});

/** Fetch an external image URL, store it locally, return the imageId or null on failure. */
async function fetchAndStoreImage(
  imageUrl: string,
  userId: string,
  geminiKey: string | null,
): Promise<string | null> {
  try {
    // SSRF guard: reject private/internal addresses before making any request
    if (!(await isSafeExternalUrl(imageUrl))) {
      console.warn(
        "fetchAndStoreImage: blocked SSRF attempt for URL:",
        imageUrl,
      );
      return null;
    }

    // pinnedGet() pins DNS resolution to the address validated at actual
    // connect time (see lib/ssrf-guard.ts) instead of relying solely on the
    // isSafeExternalUrl() check above — closing the DNS-rebinding TOCTOU
    // window a plain fetch() after a separate validation lookup would leave
    // open (an attacker's nameserver could answer the validation lookup with
    // a public address and the connection lookup with an internal one).
    const res = await pinnedGet(imageUrl, {
      "User-Agent": "Mozilla/5.0 (compatible; Rezeptmeister/1.0)",
    });

    // Follow at most one redirect, but only to the same hostname.
    // Cross-host redirects are blocked entirely: they require a fresh DNS
    // resolution for a new hostname, which opens a TOCTOU window that a
    // DNS-rebinding attack can exploit (initial DNS check passes for a
    // public IP; attacker flips DNS to a private address before the
    // subsequent fetch resolves the same name).  Same-host redirects
    // (e.g. HTTP → HTTPS) are safe because pinnedGet() re-validates and pins
    // DNS on every call, including this one.
    if (res.status >= 300 && res.status < 400) {
      const location = res.getHeader("location");
      if (!location) return null;
      const redirectUrl = location.startsWith("http")
        ? location
        : new URL(location, imageUrl).href;

      let redirectHostname: string;
      try {
        redirectHostname = new URL(redirectUrl).hostname;
      } catch {
        return null;
      }
      if (redirectHostname !== new URL(imageUrl).hostname) {
        console.warn(
          "fetchAndStoreImage: cross-host redirect blocked:",
          redirectUrl,
        );
        return null;
      }

      const finalRes = await pinnedGet(redirectUrl, {
        "User-Agent": "Mozilla/5.0 (compatible; Rezeptmeister/1.0)",
      });
      if (!finalRes.ok) return null;
      return fetchImageResponse(finalRes, userId, geminiKey);
    }

    if (!res.ok) return null;
    return fetchImageResponse(res, userId, geminiKey);
  } catch (err) {
    console.warn("Bild-Import fehlgeschlagen (nicht kritisch):", err);
    return null;
  }
}

/** Process a successful image fetch response, store it, and return imageId. */
async function fetchImageResponse(
  res: PinnedResponse,
  userId: string,
  geminiKey: string | null,
): Promise<string | null> {
  const contentType = (res.getHeader("content-type") ?? "")
    .split(";")[0]
    .trim();
  if (!ALLOWED_IMAGE_MIME.includes(contentType as AllowedImageMime))
    return null;

  const contentLength = Number(res.getHeader("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) return null;

  const imageId = crypto.randomUUID();
  const ext = MIME_TO_EXT[contentType as AllowedImageMime] ?? ".jpg";
  const originalFileName = `${imageId}${ext}`;
  const thumbFileName = `${imageId}.webp`;

  const s = sharp(buffer);
  const [meta, thumbBuffer] = await Promise.all([
    s.metadata(),
    s
      .clone()
      .resize(300, 300, { fit: "cover", position: "centre" })
      .webp({ quality: 80 })
      .toBuffer(),
  ]);

  // Defense-in-depth: validate actual image format detected by Sharp
  const allowedFormats = ["jpeg", "png", "webp"];
  if (!meta.format || !allowedFormats.includes(meta.format)) return null;

  await Promise.all([
    uploadToStorage(`originals/${originalFileName}`, buffer, contentType),
    uploadToStorage(`thumbnails/${thumbFileName}`, thumbBuffer, "image/webp"),
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
    const headers = geminiKey
      ? buildAiHeaders(geminiKey)
      : buildBackendHeaders();
    fetch(`${backendUrl}/embed/image`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image_id: imageId }),
      signal: AbortSignal.timeout(60_000),
    }).catch(() => {});
  }

  return imageId;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`import-url:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
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
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400 },
    );
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

  // SSRF guard: validate the user-supplied recipe URL in the Next.js proxy
  // before forwarding to the FastAPI backend. The backend has its own
  // connect-time guard (_SafeTransport), but we check here as well so that
  // internal-network URLs are rejected at the outermost layer and never
  // reach the container network.
  if (!(await isSafeExternalUrl(parsed.data.url))) {
    return NextResponse.json(
      { error: "URL nicht erlaubt oder nicht erreichbar." },
      { status: 400 },
    );
  }

  const backendRes = await fetchBackendWithRetry(
    "/import/url",
    {
      method: "POST",
      headers: buildAiHeaders(geminiKey),
      body: JSON.stringify({ ...parsed.data, user_id: session.user.id }),
    },
    // Der Umweg über Gemini (Seitenabruf + strukturierte Extraktion) braucht
    // regelmässig mehr als die 30 s Standard-Timeout.
    120_000,
  );
  if (!backendRes) {
    return NextResponse.json(
      { error: "Verbindung zum KI-Backend fehlgeschlagen." },
      { status: 503 },
    );
  }

  if (!backendRes.ok) {
    const safeMessages: Record<number, string> = {
      400: "Ungültige URL oder nicht unterstütztes Format.",
      422: "Ungültige Eingabedaten.",
      429: "Zu viele Anfragen.",
    };
    // Das Backend markiert für die Nutzerin bestimmte Abbrüche (Bezahlschranke,
    // Bot-Schutz, kein Rezept auf der Seite) mit einem `detail`-Objekt, das eine
    // kuratierte deutsche Meldung trägt. Nur diese Form wird durchgereicht —
    // FastAPIs eigene Validierungsfehler liefern `detail` als Array, rohe
    // Ausnahmen als String; beides bleibt hinter der generischen Meldung, damit
    // keine internen Details ins UI gelangen.
    let curated: string | null = null;
    try {
      const payload = (await backendRes.json()) as { detail?: unknown };
      const detailObj = payload.detail;
      if (
        detailObj &&
        typeof detailObj === "object" &&
        !Array.isArray(detailObj) &&
        typeof (detailObj as { message?: unknown }).message === "string"
      ) {
        curated = (detailObj as { message: string }).message;
      }
    } catch {
      /* kein JSON-Body — generische Meldung verwenden */
    }
    const detail =
      curated ?? safeMessages[backendRes.status] ?? "URL-Import fehlgeschlagen.";
    return NextResponse.json({ error: detail }, { status: backendRes.status });
  }

  const result = (await backendRes.json()) as Record<string, unknown>;

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
    } catch {
      /* ignore */
    }

    imageId = await fetchAndStoreImage(
      result.image_url,
      session.user.id,
      geminiKeyForEmbed,
    );
  }

  return NextResponse.json({ ...result, imageId });
}
