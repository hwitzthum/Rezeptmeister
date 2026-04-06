import { getPublicUrl } from "@/lib/supabase-storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;

  // Validate path segments — only allow alphanumeric, hyphens, dots, underscores
  if (segments.some((s) => !/^[\w\-.]+$/.test(s))) {
    return new Response(null, { status: 404 });
  }

  // storagePath: e.g. "originals/uuid.jpg" or "thumbnails/uuid.webp"
  const storagePath = segments.join("/");
  const publicUrl = getPublicUrl(storagePath);

  // 302 redirect to Supabase Storage CDN
  return new Response(null, {
    status: 302,
    headers: {
      Location: publicUrl,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
