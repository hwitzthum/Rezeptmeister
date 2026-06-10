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

  try {
    // Escape LIKE metacharacters so user input cannot widen the prefix-match pattern.
    const qEscaped = q
      ? q.toLowerCase().trim().replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_")
      : undefined;

    const rows = await db.execute<{ name: string }>(
      sql`
        SELECT DISTINCT LOWER(TRIM(i.name)) AS name
        FROM ingredients i
        JOIN recipes r ON i.recipe_id = r.id
        WHERE r.user_id = ${userId}
        ${qEscaped !== undefined ? sql`AND LOWER(TRIM(i.name)) LIKE ${qEscaped + "%"} ESCAPE '!'` : sql``}
        ORDER BY name
        LIMIT ${limit}
      `,
    );

    const suggestions = [...rows].map((r) => r.name);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Autocomplete-Abfrage fehlgeschlagen:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
