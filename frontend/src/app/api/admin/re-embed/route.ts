import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { buildAiHeaders } from "@/lib/backend";
import { checkRateLimit, getClientIp, AI_LIMIT } from "@/lib/rate-limit";
import { USER_ROLE } from "@/lib/auth";

interface JobResult {
  userId: string;
  jobId: string;
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`admin-re-embed:${ip}`, AI_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
      },
    );
  }

  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: "Backend nicht erreichbar." },
      { status: 503 },
    );
  }

  // Alle Benutzer mit Gemini-API-Schlüssel laden
  const geminiUsers = await db
    .select({
      id: users.id,
      apiKeyEncrypted: users.apiKeyEncrypted,
    })
    .from(users)
    .where(
      and(eq(users.apiProvider, "gemini"), isNotNull(users.apiKeyEncrypted)),
    );

  if (geminiUsers.length === 0) {
    return NextResponse.json(
      {
        error:
          "Keine Benutzer mit Gemini API-Schlüssel gefunden. Bitte mindestens einen Schlüssel unter Einstellungen hinterlegen.",
      },
      { status: 400 },
    );
  }

  const jobs: JobResult[] = [];
  let skippedUsers = 0;

  // Pro Benutzer: Schlüssel entschlüsseln und Backend-Job starten
  for (const user of geminiUsers) {
    let geminiKey: string;
    try {
      geminiKey = decrypt(user.apiKeyEncrypted!);
    } catch {
      skippedUsers++;
      continue;
    }

    try {
      const res = await fetch(`${backendUrl}/admin/re-embed-user`, {
        method: "POST",
        headers: buildAiHeaders(geminiKey),
        body: JSON.stringify({ user_id: user.id }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        skippedUsers++;
        continue;
      }

      const data = (await res.json()) as { job_id: string };
      jobs.push({ userId: user.id, jobId: data.job_id });
    } catch {
      skippedUsers++;
    }
  }

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "Kein Re-Embedding-Job konnte gestartet werden." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    jobs,
    totalUsers: geminiUsers.length,
    skippedUsers,
  });
}
