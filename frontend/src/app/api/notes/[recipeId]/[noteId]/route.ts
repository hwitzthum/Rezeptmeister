import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipeNotes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { USER_ROLE } from "@/lib/auth";

const noteUpdateSchema = z.object({
  content: z.string().min(1).max(5000).optional(),
  noteType: z.enum(["tipp", "variation", "erinnerung", "bewertung", "allgemein"]).optional(),
  rating: z.number().int().min(1).max(5).optional().nullable(),
});

// ── PUT /api/notes/[recipeId]/[noteId] ────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ recipeId: string; noteId: string }> },
) {
  const { noteId } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`notes-update:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const existing = await db.query.recipeNotes.findFirst({
    where: eq(recipeNotes.id, noteId),
    columns: { id: true, userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Notiz nicht gefunden." }, { status: 404 });
  }

  if (existing.userId !== session.user.id && session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = noteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Partial<typeof recipeNotes.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.content !== undefined) updates.content = parsed.data.content;
  if (parsed.data.noteType !== undefined) updates.noteType = parsed.data.noteType;
  if (parsed.data.rating !== undefined) updates.rating = parsed.data.rating ?? null;

  try {
    const [updated] = await db
      .update(recipeNotes)
      .set(updates)
      .where(
        and(
          eq(recipeNotes.id, noteId),
          eq(recipeNotes.userId, session.user.id),
        ),
      )
      .returning();

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Fehler beim Aktualisieren der Notiz:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
}

// ── DELETE /api/notes/[recipeId]/[noteId] ─────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ recipeId: string; noteId: string }> },
) {
  const { noteId } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`notes-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const existing = await db.query.recipeNotes.findFirst({
    where: eq(recipeNotes.id, noteId),
    columns: { id: true, userId: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Notiz nicht gefunden." }, { status: 404 });
  }

  if (existing.userId !== session.user.id && session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  await db.delete(recipeNotes).where(eq(recipeNotes.id, noteId));

  return new Response(null, { status: 204 });
}
