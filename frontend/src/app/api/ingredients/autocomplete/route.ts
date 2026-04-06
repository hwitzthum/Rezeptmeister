import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const querySchema = z.object({
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`ingredients-autocomplete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { q, limit } = parsed.data;
  const userId = session.user.id;

  const rows = await db.execute<{ name: string }>(
    sql`
      SELECT DISTINCT LOWER(TRIM(name)) AS name
      FROM ingredients
      WHERE recipe_id IN (SELECT id FROM recipes WHERE user_id = ${userId})
      ${q ? sql`AND LOWER(TRIM(name)) LIKE ${q.toLowerCase().trim() + "%"}` : sql``}
      ORDER BY name
      LIMIT ${limit}
    `,
  );

  const suggestions = [...rows].map((r) => r.name);

  return NextResponse.json({ suggestions });
}
