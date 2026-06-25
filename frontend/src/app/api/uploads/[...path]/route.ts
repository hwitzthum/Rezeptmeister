import { auth } from "@/auth";
import { db } from "@/lib/db";
import { images } from "@/lib/db/schema";
import { createSignedUrl } from "@/lib/supabase-storage";
import { and, eq } from "drizzle-orm";

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
  if (
    segments.some(
      (s) => s === "." || s === ".." || !/^[\w\-.]+$/.test(s),
    )
  ) {
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
  // The image UUID is encoded as the filename stem (e.g. "originals/<uuid>.jpg"
  // → stem "<uuid>"), and `images.id` stores that same UUID, so we look up
  // purely by id + userId — no extension guessing needed for thumbnails.
  // A 404 is returned for any unowned or non-existent path to avoid leaking
  // whether a UUID exists.
  const filename = segments.at(-1) ?? "";
  const imageId = filename.replace(/\.[^.]+$/, ""); // strip extension

  // Validate that the extracted stem looks like a UUID before hitting the DB.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(imageId)) {
    return new Response(null, { status: 404 });
  }

  let owned: boolean;
  try {
    const rows = await db
      .select({ id: images.id })
      .from(images)
      .where(and(eq(images.id, imageId), eq(images.userId, session.user.id)))
      .limit(1);
    owned = rows.length > 0;
  } catch {
    return new Response(null, { status: 503 });
  }

  if (!owned) {
    return new Response(null, { status: 404 });
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
