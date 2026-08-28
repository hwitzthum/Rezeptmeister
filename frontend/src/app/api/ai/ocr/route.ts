import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { proxyAiRequest } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimitDistributed, getClientIp, AI_LIMIT } from "@/lib/rate-limit";

/**
 * Mehrseitiges OCR (bis zu 10 Buchseiten in einem Gemini-Aufruf) braucht deutlich
 * mehr Zeit als ein Einzelbild. Ohne angehobene Funktionslaufzeit würde die
 * Plattform den Aufruf vor dem 120-s-Proxy-Timeout abschneiden.
 */
export const maxDuration = 300;

/** Vertrag 4.1: `imageIds` (Reihenfolge = Seitenreihenfolge), `imageId` bleibt gültig. */
const bodySchema = z
  .object({
    imageId: z.string().uuid().optional(),
    imageIds: z.array(z.string().uuid()).min(1).max(10).optional(),
  })
  .refine((v) => v.imageIds !== undefined || v.imageId !== undefined, {
    message: "imageIds oder imageId ist erforderlich.",
  })
  .transform((v) => ({ imageIds: v.imageIds ?? [v.imageId as string] }));

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`ocr:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)) },
      },
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültige Eingaben.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const keyResult = await resolveGeminiKey(session.user.id);
  if (!keyResult.ok) return keyResult.response;
  const geminiKey = keyResult.key;

  return proxyAiRequest(
    "/ocr/extract",
    geminiKey,
    { image_ids: parsed.data.imageIds, user_id: session.user.id },
    "OCR-Extraktion fehlgeschlagen.",
    120_000,
  );
}
