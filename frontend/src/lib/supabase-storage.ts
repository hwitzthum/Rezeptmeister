import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const BUCKET = "recipe-images";

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
 */
export function getPublicUrl(storagePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}
