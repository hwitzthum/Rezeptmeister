import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { USER_ROLE } from "@/lib/auth";

const updateSchema = z.object({
  status: z.enum(["approved", "rejected", "pending"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
});

async function requireAdmin(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLE.admin) return null;
  return session;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`admin-user-put:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  const { id } = await params;

  let data: z.infer<typeof updateSchema>;
  try {
    const body = await request.json();
    data = updateSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Ungültige Eingaben." }, { status: 400 });
  }

  if (!data.status && !data.role) {
    return NextResponse.json(
      { error: "Mindestens ein Feld muss angegeben werden." },
      { status: 400 },
    );
  }

  // Prevent admin from demoting themselves
  if (id === session.user.id && data.role === USER_ROLE.user) {
    return NextResponse.json(
      { error: "Sie können sich nicht selbst degradieren." },
      { status: 400 },
    );
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Benutzer nicht gefunden." },
      { status: 404 },
    );
  }

  await db
    .update(users)
    .set({ ...(data.status && { status: data.status }), ...(data.role && { role: data.role }) })
    .where(eq(users.id, id));

  return NextResponse.json({ message: "Benutzer aktualisiert." });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`admin-user-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  const { id } = await params;

  // Prevent self-deletion
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Sie können sich nicht selbst löschen." },
      { status: 400 },
    );
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "Benutzer nicht gefunden." },
      { status: 404 },
    );
  }

  await db.delete(users).where(eq(users.id, id));

  return NextResponse.json({ message: "Benutzer gelöscht." });
}
