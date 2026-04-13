// ── MIME / Extension constants ────────────────────────────────────────────────

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export const MIME_TO_EXT: Record<AllowedImageMime, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// ── Path utilities ────────────────────────────────────────────────────────────

/**
 * The URL prefix under which uploaded files are served.
 * Centralised here so every path computation stays consistent.
 */
export const UPLOAD_API_PREFIX = "/api/uploads";

/**
 * Derives the thumbnail API URL from a stored filePath.
 * filePath: /api/uploads/originals/uuid.jpg → /api/uploads/thumbnails/uuid.webp
 *
 * Also normalises legacy paths stored without leading /api/uploads/ prefix
 * (e.g. "uploads/originals/..." from older AI-generated images).
 */
export function thumbnailUrl(filePath: string): string {
  let normalised = filePath;
  if (!normalised.startsWith("/")) {
    normalised = `/${normalised}`;
  }
  if (normalised.startsWith("/uploads/")) {
    normalised = `/api${normalised}`;
  }
  return normalised
    .replace("/originals/", "/thumbnails/")
    .replace(/\.(jpg|jpeg|png|webp)$/i, ".webp");
}

/**
 * Normalises a DB-stored image path so it is valid as a next/image src.
 * Handles legacy paths stored without the /api/uploads/ prefix.
 */
export function normaliseImageSrc(filePath: string): string {
  let normalised = filePath;
  if (!normalised.startsWith("/")) {
    normalised = `/${normalised}`;
  }
  if (normalised.startsWith("/uploads/")) {
    normalised = `/api${normalised}`;
  }
  return normalised;
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
