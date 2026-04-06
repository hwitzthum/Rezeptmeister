import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shoppingListItems } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getAisleCategory } from "@/lib/shopping/aisle-categories";

const addItemSchema = z.object({
  ingredientName: z.string().min(1).max(255),
  amount: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  recipeId: z.string().uuid().nullable().optional(),
  aisleCategory: z.string().nullable().optional(),
});

// -- GET /api/shopping-list ------------------------------------------------

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-get:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const items = await db.query.shoppingListItems.findMany({
    where: eq(shoppingListItems.userId, session.user.id),
    orderBy: [asc(shoppingListItems.aisleCategory), asc(shoppingListItems.sortOrder)],
  });

  return NextResponse.json({ items });
}

// -- POST /api/shopping-list -----------------------------------------------

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shopping-create:${ip}`);
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
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ingredientName, amount, unit, recipeId, aisleCategory } = parsed.data;

  try {
    const [item] = await db
      .insert(shoppingListItems)
      .values({
        userId: session.user.id,
        ingredientName,
        amount: amount != null ? String(amount) : undefined,
        unit: unit ?? undefined,
        recipeId: recipeId ?? undefined,
        aisleCategory: aisleCategory ?? getAisleCategory(ingredientName),
      })
      .returning();

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error("Fehler beim Erstellen des Einkaufslisten-Eintrags:", err);
    return NextResponse.json({ error: "Interner Serverfehler." }, { status: 500 });
  }
}
