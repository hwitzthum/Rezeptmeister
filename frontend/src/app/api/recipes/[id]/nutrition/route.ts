import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const bodySchema = z.object({
  nutritionInfo: z.object({
    kcal: z.number().int(),
    protein_g: z.number(),
    fat_g: z.number(),
    carbs_g: z.number(),
    fiber_g: z.number(),
    confidence: z.string().default("ca."),
    label: z.string(),
  }),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`nutrition-patch:${ip}`);
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

  const updated = await db
    .update(recipes)
    .set({
      nutritionInfo: parsed.data.nutritionInfo,
      updatedAt: new Date(),
    })
    .where(and(eq(recipes.id, id), eq(recipes.userId, session.user.id)))
    .returning({ id: recipes.id });

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden oder nicht autorisiert." },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true });
}
