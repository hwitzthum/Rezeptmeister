import { auth } from "@/auth";
import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";
import {
  createSignedUrl,
  isSupabaseConfigured,
  readLocalStorageFile,
} from "@/lib/supabase-storage";
import { EXT_TO_MIME } from "@/lib/images";
import { and, eq, sql } from "drizzle-orm";

// Signed-URL TTL in seconds — must match Cache-Control max-age below.
const SIGNED_URL_TTL = 3600;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // Validate path segments — only allow alphanumeric, hyphens, dots, underscores.
  // Explicitly reject "." and ".." before the regex: ^[\w\-.]+$ matches ".." (two
  // dots), which would assemble a traversal path like "originals/../other-bucket"
  // and redirect to a different Supabase bucket via the normalised Location URL.
  if (segments.some((s) => s === "." || s === ".." || !/^[\w\-.]+$/.test(s))) {
    return new Response(null, { status: 404 });
  }

  // Defense-in-depth session check.  The proxy.ts middleware already enforces
  // authentication on all /api/* routes, so an unauthenticated request would
  // never reach this handler.  This guard ensures the route stays safe even if
  // the middleware matcher is adjusted in future.
  const session = await auth();
  if (!session?.user) {
    return new Response(null, { status: 401 });
  }

  // storagePath: e.g. "originals/uuid.jpg" or "thumbnails/uuid.webp"
  const storagePath = segments.join("/");

  // Ownership check — only the image owner may obtain a signed URL.
  // Authorize by matching the requested file's basename stem against the stem
  // of the stored original `file_path`. An original and its thumbnail share the
  // stem (e.g. "originals/<stem>.jpg" ↔ "thumbnails/<stem>.webp") and only the
  // original path is stored, so the stem is the common key. We must NOT assume
  // the stem is the row UUID: AI-generated images are stored as "ai_<hash>",
  // whose stem is neither a UUID nor equal to images.id — assuming so 404'd them.
  // The `/<stem>.` needle is bounded by a leading slash and trailing dot, so it
  // matches the full basename only (no prefix collisions), and the userId filter
  // preserves the IDOR protection. A 404 is returned for any unowned or
  // non-existent path to avoid leaking whether a file exists.
  const filename = segments.at(-1) ?? "";
  const stem = filename.replace(/\.[^.]+$/, ""); // strip extension
  const needle = `/${stem}.`;

  let owned: boolean;
  try {
    const rows = await db
      .select({ id: images.id })
      .from(images)
      .where(
        and(
          eq(images.userId, session.user.id),
          sql`position(${needle} in ${images.filePath}) > 0`,
        ),
      )
      .limit(1);
    owned = rows.length > 0;
  } catch {
    return new Response(null, { status: 503 });
  }

  if (!owned) {
    return new Response(null, { status: 404 });
  }

  // Dev: stream the file from the local uploads/ directory. The auth + ownership
  // checks above already gated access, so local serving is no less safe than the
  // signed-URL path below.
  if (!isSupabaseConfigured()) {
    let data: Buffer;
    try {
      data = await readLocalStorageFile(storagePath);
    } catch {
      return new Response(null, { status: 404 });
    }
    const ext = (filename.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
    const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `private, max-age=${SIGNED_URL_TTL}`,
      },
    });
  }

  let signedUrl: string;
  try {
    signedUrl = await createSignedUrl(storagePath, SIGNED_URL_TTL);
  } catch {
    // SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured, or signing failed
    return new Response(null, { status: 503 });
  }

  // 302 redirect to a time-limited Supabase Storage signed URL.
  // Cache-Control is private (no shared-cache) with max-age matching the signed
  // URL TTL so the browser revalidates before the URL expires.
  return new Response(null, {
    status: 302,
    headers: {
      Location: signedUrl,
      "Cache-Control": `private, max-age=${SIGNED_URL_TTL}, s-maxage=0`,
    },
  });
}
