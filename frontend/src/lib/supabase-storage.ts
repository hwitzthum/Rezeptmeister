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
