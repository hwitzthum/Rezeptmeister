import { describe, it, expect, vi, beforeEach } from "vitest";

// Der Supabase-Pooler (Transaction-Modus) verträgt keine benannten Prepared
// Statements: postgres.js wiederholt ein fehlgeschlagenes COMMIT still und
// Postgres antwortet in der abgebrochenen Transaktion mit ROLLBACK — die
// Route meldet dann Erfolg für eine Zeile, die nie geschrieben wurde.
const postgresMock = vi.fn<(url: string, options: Record<string, unknown>) => object>(() => ({}));
vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({ query: {} })) }));

describe("db client", () => {
  beforeEach(() => {
    vi.resetModules();
    postgresMock.mockClear();
    const g = globalThis as { pgClient?: unknown; db?: unknown };
    delete g.pgClient;
    delete g.db;
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5434/test";
  });

  it("öffnet die Verbindung ohne Prepared Statements (Pooler-kompatibel)", async () => {
    const { db } = await import("../index");
    // Der Proxy initialisiert erst beim ersten Zugriff.
    void (db as unknown as { query: unknown }).query;
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock.mock.calls[0][1].prepare).toBe(false);
  });
});
