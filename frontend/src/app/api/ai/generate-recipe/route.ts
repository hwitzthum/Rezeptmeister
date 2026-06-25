import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { proxyAiRequest } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import { checkRateLimitDistributed, getClientIp, AI_LIMIT } from "@/lib/rate-limit";

const bodySchema = z.object({
  suggestion_title: z.string().min(1).max(200),
  suggestion_description: z.string().max(500),
  servings: z.number().int().min(1).max(100).default(4),
  cuisine: z.string().max(100).default(""),
  dietary: z.array(z.string().max(50)).max(20).default([]),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`generate-recipe:${ip}`, AI_LIMIT);
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
    "/ai/generate-recipe",
    geminiKey,
    { ...parsed.data, user_id: session.user.id },
    "Rezept konnte nicht generiert werden.",
  );
}
