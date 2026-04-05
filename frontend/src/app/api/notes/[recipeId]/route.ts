import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipeNotes } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { recipeOwnerCondition } from "@/lib/db/helpers";

const noteBodySchema = z.object({
  content: z.string().min(1).max(5000),
  noteType: z.enum(["tipp", "variation", "erinnerung", "bewertung", "allgemein"]).default("allgemein"),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

// ── GET /api/notes/[recipeId] ─────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`notes-get:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Verify the recipe belongs to this user (or user is admin)
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(recipeId, session.user.id, session.user.role),
    columns: { id: true },
  });
  if (!recipe) {
    return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
  }

  const notes = await db.query.recipeNotes.findMany({
    where: and(
      eq(recipeNotes.recipeId, recipeId),
      eq(recipeNotes.userId, session.user.id),
    ),
    orderBy: [asc(recipeNotes.createdAt)],
  });

  return NextResponse.json({ notes });
}

// ── POST /api/notes/[recipeId] ────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ recipeId: string }> },
) {
  const { recipeId } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`notes-create:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  // Verify the recipe is accessible
  const recipe = await db.query.recipes.findFirst({
    where: recipeOwnerCondition(recipeId, session.user.id, session.user.role),
    columns: { id: true },
  });
  if (!recipe) {
    return NextResponse.json({ error: "Rezept nicht gefunden." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = noteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { content, noteType, rating } = parsed.data;

  try {
    const [note] = await db
      .insert(recipeNotes)
      .values({
        recipeId,
        userId: session.user.id,
        content,
        noteType,
        rating: rating ?? null,
      })
      .returning();

    return NextResponse.json(note, { status: 201 });
  } catch (err) {
    console.error("Fehler beim Erstellen der Notiz:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
}
