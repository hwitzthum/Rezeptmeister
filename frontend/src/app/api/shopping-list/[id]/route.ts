import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shoppingListItems } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const updateItemSchema = z.object({
  ingredientName: z.string().min(1).max(255).optional(),
  amount: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  isChecked: z.boolean().optional(),
  aisleCategory: z.string().nullable().optional(),
});

// -- PUT /api/shopping-list/[id] -------------------------------------------

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-update:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }

  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates: Partial<typeof shoppingListItems.$inferInsert> = {};
  const data = parsed.data;

  if (data.ingredientName !== undefined) updates.ingredientName = data.ingredientName;
  if (data.amount !== undefined) updates.amount = data.amount != null ? String(data.amount) : null;
  if (data.unit !== undefined) updates.unit = data.unit;
  if (data.isChecked !== undefined) updates.isChecked = data.isChecked;
  if (data.aisleCategory !== undefined) updates.aisleCategory = data.aisleCategory;

  try {
    const [updated] = await db
      .update(shoppingListItems)
      .set(updates)
      .where(
        and(
          eq(shoppingListItems.id, id),
          eq(shoppingListItems.userId, session.user.id),
        ),
      )
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Fehler beim Aktualisieren des Einkaufslisten-Eintrags:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
}

// -- DELETE /api/shopping-list/[id] ----------------------------------------

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const [deleted] = await db
      .delete(shoppingListItems)
      .where(
        and(
          eq(shoppingListItems.id, id),
          eq(shoppingListItems.userId, session.user.id),
        ),
      )
      .returning();

    if (!deleted) {
      return NextResponse.json({ error: "Eintrag nicht gefunden." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Fehler beim Loeschen des Einkaufslisten-Eintrags:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
}
