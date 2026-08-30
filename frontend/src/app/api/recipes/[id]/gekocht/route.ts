import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipeCookLogs } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { recipeOwnerCondition } from "@/lib/db/helpers";
import { checkRateLimitDistributed, getClientIp } from "@/lib/rate-limit";
import { zurichDateISO } from "@/lib/format";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cookLogBodySchema = z.object({
  cookedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ungültiges Datumsformat.")
    .optional(),
  servings: z.number().int().min(1).max(999).optional(),
  note: z.string().max(500).optional(),
});

/** Kochhistorie eines Rezepts: neueste zuerst, dazu Zähler und letztes Datum. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Ungültige ID." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`cook-log-get:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { id: true },
  });
  if (!recipe) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  const [logs, [stats]] = await Promise.all([
    db
      .select({
        id: recipeCookLogs.id,
        cookedOn: recipeCookLogs.cookedOn,
        servings: recipeCookLogs.servings,
        note: recipeCookLogs.note,
        createdAt: recipeCookLogs.createdAt,
      })
      .from(recipeCookLogs)
      .where(
        and(
          eq(recipeCookLogs.recipeId, id),
          eq(recipeCookLogs.userId, session.user.id),
        ),
      )
      .orderBy(desc(recipeCookLogs.cookedOn), desc(recipeCookLogs.createdAt))
      .limit(50),
    db
      .select({
        count: sql<number>`count(*)::int`,
        lastCookedOn: sql<string | null>`max(${recipeCookLogs.cookedOn})`,
      })
      .from(recipeCookLogs)
      .where(
        and(
          eq(recipeCookLogs.recipeId, id),
          eq(recipeCookLogs.userId, session.user.id),
        ),
      ),
  ]);

  return NextResponse.json({
    logs,
    count: stats?.count ?? 0,
    lastCookedOn: stats?.lastCookedOn ?? null,
  });
}

/** «Gekocht am» eintragen. Ohne Datum gilt der heutige Tag in Europe/Zurich. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Ungültige ID." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`cook-log-create:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(id, session.user.id, session.user.role),
    columns: { id: true },
  });
  if (!recipe) {
    return NextResponse.json(
      { error: "Rezept nicht gefunden." },
      { status: 404 },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: "Ungültiger JSON-Body." },
      { status: 400 },
    );
  }

  const parsed = cookLogBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const cookedOn = parsed.data.cookedOn ?? zurichDateISO();
  // Kein Eintrag in der Zukunft — das wäre kein «gekocht», sondern ein Plan.
  if (cookedOn > zurichDateISO()) {
    return NextResponse.json(
      { error: "Datum liegt in der Zukunft." },
      { status: 400 },
    );
  }

  try {
    const [log] = await db
      .insert(recipeCookLogs)
      .values({
        recipeId: id,
        userId: session.user.id,
        cookedOn,
        servings: parsed.data.servings ?? null,
        note: parsed.data.note?.trim() || null,
      })
      .returning();
    return NextResponse.json(log, { status: 201 });
  } catch (err) {
    console.error("Kochhistorie-Eintrag fehlgeschlagen:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}

