import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  checkRateLimitDistributed,
  getClientIp,
  AUTH_LIMIT,
} from "@/lib/rate-limit";
import { buildBackup, backupFileName } from "@/lib/backup/serialize";

/**
 * GET /api/export — vollständiges JSON-Backup der eigenen Daten.
 * Teuer (alle Tabellen in einem Rutsch), deshalb das strenge AUTH_LIMIT.
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`export:${ip}`, AUTH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const row = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { email: true, name: true },
    with: {
      recipes: {
        columns: {
          embedding: false,
          userId: false,
          sourceImageId: false,
          totalTimeMinutes: false,
        },
        with: {
          ingredients: { orderBy: (f, { asc }) => [asc(f.sortOrder)] },
          images: {
            columns: { embedding: false, extractedText: false },
            orderBy: (f, { desc }) => [desc(f.isPrimary), desc(f.createdAt)],
          },
          recipeNotes: {
            columns: {
              content: true,
              noteType: true,
              rating: true,
              createdAt: true,
            },
            orderBy: (f, { asc }) => [asc(f.createdAt)],
          },
          recipeCookLogs: {
            columns: { cookedOn: true, servings: true, note: true },
            orderBy: (f, { asc }) => [asc(f.cookedOn)],
          },
        },
      },
      collections: {
        with: {
          collectionRecipes: { columns: { recipeId: true, sortOrder: true } },
        },
      },
      mealPlans: {
        columns: {
          date: true,
          mealType: true,
          recipeId: true,
          servingsOverride: true,
          notes: true,
        },
      },
      shoppingListItems: {
        columns: {
          ingredientName: true,
          amount: true,
          unit: true,
          isChecked: true,
          aisleCategory: true,
          sortOrder: true,
          recipeId: true,
        },
      },
    },
  });

  if (!row) {
    return NextResponse.json(
      { error: "Benutzer nicht gefunden." },
      { status: 404 },
    );
  }

  const now = new Date();
  const backup = buildBackup(row, now);

  return new NextResponse(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFileName(now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
