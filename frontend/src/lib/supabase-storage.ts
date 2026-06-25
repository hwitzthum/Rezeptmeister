import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const BUCKET = "recipe-images";

/**
 * Storage backend selection.
 *   Prod (Supabase env vars set) → Supabase Storage with signed URLs.
 *   Dev  (no Supabase config)    → local filesystem under uploads/,
 *                                  served same-origin via /api/uploads.
 * This mirrors the documented design ("Next.js static route in dev, Supabase
 * CDN in prod") without forcing every developer to provision a Supabase bucket.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Local upload base. In Next.js process.cwd() is the frontend/ directory;
 * uploads/ lives one level up at the repo root.
 */
const UPLOAD_BASE = path.resolve(process.cwd(), "..", "uploads");

/**
 * Resolve a storagePath (e.g. "originals/uuid.jpg") to an absolute local path,
 * rejecting anything that escapes UPLOAD_BASE (path-traversal guard).
 */
function localStoragePath(storagePath: string): string {
  const resolved = path.resolve(UPLOAD_BASE, storagePath);
  if (
    resolved !== UPLOAD_BASE &&
    !resolved.startsWith(UPLOAD_BASE + path.sep)
  ) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

/**
 * Read a file from local storage (dev only). Throws ENOENT if missing.
 * @param storagePath - e.g. "originals/uuid.jpg" or "thumbnails/uuid.webp"
 */
export async function readLocalStorageFile(
  storagePath: string,
): Promise<Buffer> {
  return fs.promises.readFile(localStoragePath(storagePath));
}

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    // Read env vars at call time, not at module load time.  Capturing them in
    // top-level constants would produce stale/undefined values when the module
    // is imported during `next build` before the runtime env is available.
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/**
 * Upload a file to Supabase Storage.
 * @param storagePath - e.g. "originals/uuid.jpg" or "thumbnails/uuid.webp"
 * @param buffer - file contents
 * @param contentType - MIME type
 */
export async function uploadToStorage(
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    const dest = localStoragePath(storagePath);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, buffer);
    return;
  }
  const { error } = await getClient()
    .storage.from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
    });
  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromStorage(storagePath: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    await fs.promises.unlink(localStoragePath(storagePath)).catch(() => {
      /* a storage leak is preferable to a broken DB record */
    });
    return;
  }
  const { error } = await getClient()
    .storage.from(BUCKET)
    .remove([storagePath]);
  if (error) {
    console.error(`Supabase Storage delete failed: ${error.message}`);
  }
}

/**
 * Create a short-lived signed URL for a file in the bucket.
 *
 * Signed URLs are scoped to a single path and expire after `expiresIn` seconds
 * (default 3600 = 1 hour), so an attacker who learns the URL cannot use it
 * after expiry.  The service-role key (held server-side only) is required to
 * sign — the browser never receives it.
 *
 * @param storagePath - e.g. "originals/uuid.jpg"
 * @param expiresIn   - seconds until expiry (default 3600)
 */
export async function createSignedUrl(
  storagePath: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await getClient()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Supabase Storage signed URL failed: ${error?.message ?? "no URL returned"}`,
    );
  }
  return data.signedUrl;
}
