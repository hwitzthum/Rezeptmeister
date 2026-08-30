/**
 * Kochhistorie gegen eine echte PostgreSQL-Instanz: der Zaehler in der
 * Rezeptliste und das Geschmacksprofil lesen aus `recipe_cook_logs`.
 * Ohne erreichbare Datenbank ueberspringt die Datei sich selbst.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envFile = readFileSync(
      path.resolve(__dirname, "../../../../.env.local"),
      "utf8",
    );
    const match = envFile.match(/^DATABASE_URL=(.*)$/m);
    return match?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const databaseUrl = loadDatabaseUrl();

async function datenbankErreichbar(): Promise<boolean> {
  if (!databaseUrl) return false;
  try {
    const { default: postgres } = await import("postgres");
    const probe = postgres(databaseUrl, { max: 1, connect_timeout: 3 });
    await probe`SELECT 1`;
    await probe.end();
    return true;
  } catch {
    return false;
  }
}

const erreichbar = await datenbankErreichbar();

describe.skipIf(!erreichbar)("Kochhistorie gegen echte Datenbank", () => {
  const userId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const titelOft = `Älplermagronen ${suffix}`;
  const titelNie = `Vermicelles ${suffix}`;

  let listRecipes: typeof import("../list").listRecipes;
  let buildTasteProfile: typeof import("@/lib/ai/taste-profile").buildTasteProfile;
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/db/schema");
  let oftId: string;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ listRecipes } = await import("../list"));
    ({ buildTasteProfile } = await import("@/lib/ai/taste-profile"));
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");

    await db.insert(schema.users).values({
      id: userId,
      email: `cooklog-${suffix}@test.local`,
      passwordHash: "x",
      status: "approved",
    });
    const rows = await db
      .insert(schema.recipes)
      .values([
        { userId, title: titelOft, instructions: "Kochen.", servings: 4 },
        { userId, title: titelNie, instructions: "Kochen.", servings: 4 },
      ])
      .returning({ id: schema.recipes.id, title: schema.recipes.title });
    oftId = rows.find((r) => r.title === titelOft)!.id;
    await db.insert(schema.recipeCookLogs).values([
      { userId, recipeId: oftId, cookedOn: "2026-08-01", servings: 4 },
      { userId, recipeId: oftId, cookedOn: "2026-08-15", servings: 2 },
      { userId, recipeId: oftId, cookedOn: "2026-08-20", servings: 4 },
    ]);
  });

  afterAll(async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.recipes).where(eq(schema.recipes.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  it("liefert den Zaehler je Rezept in der Liste", async () => {
    const result = await listRecipes(userId, {
      includeFacets: "false",
      seite: 1,
      limit: 20,
      sortierung: "alphabetisch",
    });
    const oft = result.recipes.find((r) => r.title === titelOft);
    const nie = result.recipes.find((r) => r.title === titelNie);
    expect(oft?.cookCount).toBe(3);
    expect(nie?.cookCount).toBe(0);
  });

  it("nimmt haeufig Gekochtes ins Geschmacksprofil auf", async () => {
    const profil = await buildTasteProfile(userId);
    expect(profil.haeufigGekochteTitel).toEqual([titelOft]);
  });

  it("loescht die Historie mit dem Rezept (Cascade)", async () => {
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.recipes).where(eq(schema.recipes.id, oftId));
    const rest = await db
      .select()
      .from(schema.recipeCookLogs)
      .where(eq(schema.recipeCookLogs.recipeId, oftId));
    expect(rest).toHaveLength(0);
  });
});
