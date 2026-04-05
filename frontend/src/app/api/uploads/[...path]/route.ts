import path from "path";
import fs from "fs";
import { UPLOAD_BASE, EXT_TO_MIME } from "@/lib/images";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filePath = path.resolve(UPLOAD_BASE, ...segments);

  // Path traversal guard
  if (!filePath.startsWith(UPLOAD_BASE + path.sep)) {
    return new Response(null, { status: 404 });
  }

  try {
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = EXT_TO_MIME[ext] ?? "application/octet-stream";

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
