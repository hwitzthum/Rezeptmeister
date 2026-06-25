import fs from "fs";
import path from "path";
import { EXT_TO_MIME } from "@/lib/images";
import {
  getPublicUrl,
  isSupabaseConfigured,
  localStoragePath,
} from "@/lib/supabase-storage";

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

  // storagePath: e.g. "originals/uuid.jpg" or "thumbnails/uuid.webp"
  const storagePath = segments.join("/");

  // Prod: 302 redirect to Supabase Storage CDN.
  if (isSupabaseConfigured()) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: getPublicUrl(storagePath),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Dev: stream the file from the local uploads/ directory.
  let filePath: string;
  try {
    filePath = localStoragePath(storagePath);
  } catch {
    return new Response(null, { status: 404 });
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
