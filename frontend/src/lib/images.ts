import path from "path";

// ── MIME / Extension constants ────────────────────────────────────────────────

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export const MIME_TO_EXT: Record<AllowedImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const EXT_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// ── Path utilities ────────────────────────────────────────────────────────────

/**
 * Absolute path to the uploads directory.
 * In Next.js, process.cwd() is the frontend/ directory; uploads/ lives one level up.
 * Computed once at module load — process.cwd() is stable for the process lifetime.
 */
export const UPLOAD_BASE = path.resolve(process.cwd(), "..", "uploads");

/**
 * The URL prefix under which uploaded files are served.
 * Centralised here so every path computation stays consistent.
 */
export const UPLOAD_API_PREFIX = "/api/uploads";

/**
 * Derives the thumbnail API URL from a stored filePath.
 * filePath: /api/uploads/originals/uuid.jpg → /api/uploads/thumbnails/uuid.webp
 */
export function thumbnailUrl(filePath: string): string {
  return filePath
    .replace("/originals/", "/thumbnails/")
    .replace(/\.(jpg|jpeg|png|webp)$/i, ".webp");
}

/**
 * Converts a DB-stored API-relative filePath back to an absolute filesystem path.
 * /api/uploads/originals/uuid.jpg → /abs/path/to/uploads/originals/uuid.jpg
 */
export function fileSystemPath(apiRelativePath: string): string {
  const relative = apiRelativePath.replace(new RegExp(`^${UPLOAD_API_PREFIX}/`), "");
  return path.join(UPLOAD_BASE, relative);
}

/**
 * Strips heavy columns (embedding, extractedText) from a DB image row before
 * serialising it as an API response.
 */
export function stripImageColumns<
  T extends { embedding?: unknown; extractedText?: unknown },
>(image: T): Omit<T, "embedding" | "extractedText"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding: _e, extractedText: _t, ...rest } = image;
  return rest as Omit<T, "embedding" | "extractedText">;
}
