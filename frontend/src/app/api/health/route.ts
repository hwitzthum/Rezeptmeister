import "@/lib/env-check";
import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, string> = {
    app: "ok",
    env_nextauth_secret: process.env.NEXTAUTH_SECRET ? "ok" : "missing",
    env_database_url: process.env.DATABASE_URL ? "ok" : "missing",
  };

  if (process.env.DATABASE_URL) {
    try {
      const { db } = await import("@/lib/db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`SELECT 1`);
      checks.database = "ok";
    } catch (err) {
      console.error("DB-Verbindungsfehler:", err);
      checks.database = "error";
    }
  } else {
    checks.database = "skipped (no DATABASE_URL)";
  }

  const hasError = Object.values(checks).some((v) => v === "error");

  // "degraded" (not 5xx) so load-balancers still route to the app during DB outages
  return NextResponse.json(
    { status: hasError ? "degraded" : "ok", checks },
    { status: 200 },
  );
}