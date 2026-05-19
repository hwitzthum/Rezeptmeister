import "@/lib/env-check";
import { NextResponse } from "next/server";

export async function GET() {
  // Perform checks internally but only expose aggregate status to the caller.
  // Detailed check names are intentionally omitted from the response to avoid
  // leaking configuration details (e.g. which env vars are missing) to
  // unauthenticated callers or external probes.
  let dbOk = true;

  if (process.env.DATABASE_URL) {
    try {
      const { db } = await import("@/lib/db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1`);
    } catch (err) {
      console.error("DB-Verbindungsfehler:", err);
      dbOk = false;
    }
  }

  const hasError = !dbOk;

  // "degraded" (not 5xx) so load-balancers still route to the app during DB outages
  return NextResponse.json(
    { status: hasError ? "degraded" : "ok" },
    { status: 200 },
  );
}