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

  // Authorize, then resolve the served path FROM THE OWNED ROW — never from the
  // request. We must not assume the filename stem is the row UUID: AI-generated
  // images are stored as "ai_<hash>", whose stem is neither a UUID nor equal to
  // images.id (assuming so 404'd them). So we look up the user's image whose
  // stored original `file_path` shares this basename stem (the `/<stem>.` needle
  // is anchored by a leading slash and trailing dot — full-basename match only),
  // then derive the canonical original + thumbnail storage paths from the row
  // and require the request to equal one of them exactly. This keeps the
  // authorized artifact and the served artifact coupled, so neither the bucket
  // folder nor the extension can be steered by the request. A 404 is returned
  // for any unowned or non-matching path to avoid leaking whether a file exists.
  const filename = segments.at(-1) ?? "";
  const stem = filename.replace(/\.[^.]+$/, ""); // strip extension
  const needle = `/${stem}.`;

  let ownedOriginalPath: string | null;
  try {
    const rows = await db
      .select({ filePath: images.filePath })
      .from(images)
      .where(
        and(
          eq(images.userId, session.user.id),
          sql`position(${needle} in ${images.filePath}) > 0`,
        ),
      )
      .limit(1);
    ownedOriginalPath = rows[0]?.filePath ?? null;
  } catch {
    return new Response(null, { status: 503 });
  }

  if (!ownedOriginalPath) {
    return new Response(null, { status: 404 });
  }

  // Canonical storage paths derived from the row (handles legacy paths stored
  // without the /api/uploads/ prefix). Original keeps its extension and folder;
  // the thumbnail is always the sibling .webp under thumbnails/, sharing the
  // stem. NB: originalStorage has no leading slash ("originals/<stem>.<ext>"),
  // so the thumbnail path must be rebuilt from the stem — a string replace of
  // "/originals/" would silently no-op and leave it under originals/.
  const originalStorage = ownedOriginalPath.replace(
    /^\/?(api\/)?uploads\//,
    "",
  );
  const rowStem = (originalStorage.split("/").pop() ?? "").replace(
    /\.[^.]+$/,
    "",
  );
  const thumbStorage = `thumbnails/${rowStem}.webp`;

  // The requested path must be exactly the row's original or its derived
  // thumbnail — otherwise the request is steering the served artifact.
  let resolvedPath: string;
  if (storagePath === originalStorage) {
    resolvedPath = originalStorage;
  } else if (storagePath === thumbStorage) {
    resolvedPath = thumbStorage;
  } else {
    return new Response(null, { status: 404 });
  }

  // Dev: stream the file from the local uploads/ directory. The auth + ownership
  // checks above already gated access, so local serving is no less safe than the
  // signed-URL path below.
  if (!isSupabaseConfigured()) {
    let data: Buffer;
    try {
      data = await readLocalStorageFile(resolvedPath);
    } catch {
      return new Response(null, { status: 404 });
    }
    const ext = (resolvedPath.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
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
    signedUrl = await createSignedUrl(resolvedPath, SIGNED_URL_TTL);
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
