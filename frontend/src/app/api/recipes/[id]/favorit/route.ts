import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`recipes-favorite:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const existing = await db.query.recipes.findFirst({
    where: and(eq(recipes.id, id), eq(recipes.userId, session.user.id)),
    columns: { id: true, isFavorite: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  const newState = !existing.isFavorite;

  await db
    .update(recipes)
    .set({ isFavorite: newState })
    .where(and(eq(recipes.id, id), eq(recipes.userId, session.user.id)));

  return NextResponse.json({ isFavorite: newState });
}
