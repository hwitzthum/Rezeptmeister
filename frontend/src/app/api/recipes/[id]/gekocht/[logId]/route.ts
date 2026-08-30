import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipeCookLogs } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { checkRateLimitDistributed, getClientIp } from "@/lib/rate-limit";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fehleingabe zurücknehmen. Nur eigene Einträge — Admins bearbeiten keine fremde Historie. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  const { id, logId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(logId)) {
    return NextResponse.json({ error: "Ungültige ID." }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`cook-log-delete:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  try {
    const deleted = await db
      .delete(recipeCookLogs)
      .where(
        and(
          eq(recipeCookLogs.id, logId),
          eq(recipeCookLogs.recipeId, id),
          eq(recipeCookLogs.userId, session.user.id),
        ),
      )
      .returning({ id: recipeCookLogs.id });
    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Eintrag nicht gefunden." },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Kochhistorie-Löschung fehlgeschlagen:", err);
    return NextResponse.json(
      { error: "Interner Serverfehler." },
      { status: 500 },
    );
  }
}
