import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { z } from "zod";
import { proxyAiRequest } from "@/lib/backend";
import { resolveGeminiKey } from "@/lib/api-key";
import {
  checkRateLimitDistributed,
  getClientIp,
  AI_LIMIT,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  ingredient: z.string().min(1).max(200),
  amount: z.number().positive().nullable().optional(),
  unit: z.string().max(20).optional().default(""),
  recipe_title: z.string().max(500).optional().default(""),
  other_ingredients: z
    .array(z.string().max(200))
    .max(200)
    .optional()
    .default([]),
  dietary: z.array(z.string().max(50)).max(10).optional().default([]),
  reason: z.string().max(200).optional().default(""),
});

/** POST /api/ai/substitute — Ersatz für eine fehlende Zutat (Phase 21). */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`substitute:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
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
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400 },
    );
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

  return proxyAiRequest(
    "/ai/substitute",
    keyResult.key,
    { ...parsed.data, user_id: session.user.id },
    "Ersatzvorschläge konnten nicht geladen werden.",
  );
}
