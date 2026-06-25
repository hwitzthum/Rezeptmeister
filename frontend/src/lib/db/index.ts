import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Singleton für Dev-Hot-Reload
const globalForDb = globalThis as unknown as {
  pgClient: ReturnType<typeof postgres> | undefined;
  db: ReturnType<typeof drizzle> | undefined;
};

function getDb() {
  if (globalForDb.db) return globalForDb.db;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL ist nicht gesetzt. Bitte .env.local konfigurieren.",
    );
  }

  // Cache the client/db singleton on globalThis in ALL environments. Under
  // serverless (Vercel) globalThis persists across invocations on a warm
  // instance, so this lets connections be reused instead of opening a fresh
  // pool per invocation — which otherwise exhausts Postgres connections.
  const client =
    globalForDb.pgClient ??
    postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
  globalForDb.pgClient = client;

  const instance = globalForDb.db ?? drizzle(client, { schema });
  globalForDb.db = instance;

  return instance;
}

// Lazily-initialised proxy: throws only when a query is actually executed
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type DB = ReturnType<typeof drizzle<typeof schema>>;
