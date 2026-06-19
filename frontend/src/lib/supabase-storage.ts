import { createClient } from "@supabase/supabase-js";

const BUCKET = "recipe-images";

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
  const { error } = await getClient().storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error(`Supabase Storage delete failed: ${error.message}`);
  }
}

/**
 * Get the public URL for a file in the bucket.
 * @param storagePath - e.g. "originals/uuid.jpg"
 *
 * Reads SUPABASE_URL at call time (not at module load time) so that a missing
 * or late-set env var is detected immediately and never silently produces an
 * "undefined/..." URL string that would become a malformed Location header.
 */
export function getPublicUrl(storagePath: string): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL must be set");
  }
  return `${url}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}
