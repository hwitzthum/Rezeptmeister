import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = "recipe-images";

/**
 * Storage backend selection, per the documented design:
 *   "Serve uploads via Next.js static route (dev) or Supabase Storage CDN (prod)."
 *
 * Prod (Supabase env vars set)  → Supabase Storage CDN.
 * Dev  (no Supabase config)     → local filesystem under uploads/.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Local upload base. In Next.js process.cwd() is the frontend/ directory;
 * uploads/ lives one level up at the repo root. Computed once at module load —
 * process.cwd() is stable for the process lifetime.
 */
export const UPLOAD_BASE = path.resolve(process.cwd(), "..", "uploads");

/**
 * Resolve a storagePath (e.g. "originals/uuid.jpg") to an absolute local path,
 * rejecting anything that escapes UPLOAD_BASE (path-traversal guard).
 */
export function localStoragePath(storagePath: string): string {
  const resolved = path.resolve(UPLOAD_BASE, storagePath);
  if (
    resolved !== UPLOAD_BASE &&
    !resolved.startsWith(UPLOAD_BASE + path.sep)
  ) {
    throw new Error("Invalid storage path");
  }
  return resolved;
}

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/**
 * Upload a file to the active storage backend.
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
 * Delete a file from the active storage backend.
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
 * Get the public CDN URL for a file in the bucket (Supabase mode only).
 * @param storagePath - e.g. "originals/uuid.jpg"
 */
export function getPublicUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}
