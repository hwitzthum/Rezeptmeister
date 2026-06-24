import { auth } from "@/auth";
import { createSignedUrl } from "@/lib/supabase-storage";

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
