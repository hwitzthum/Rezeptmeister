/**
 * Suchintegration gegen eine echte PostgreSQL-Instanz.
 *
 * Bewusst nicht gegen eine leichtere Datenbank oder ein Mock: die Suche steht
 * und faellt mit `to_tsquery`, `word_similarity` und der Funktion
 * `rm_normalize` aus der Migration. Ein Mock wuerde genau die Stelle
 * ueberspringen, die geprueft werden soll.
 *
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

describe.skipIf(!erreichbar)("Rezeptsuche gegen echte Datenbank", () => {
  const userId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const titel = {
    zopf: `Butterzopf ${suffix}`,
    risotto: `Risotto Milanese ${suffix}`,
    roesti: `Berner Rösti ${suffix}`,
    suppe: `Basler Mehlsuppe ${suffix}`,
    curry: `Gemüsecurry ${suffix}`,
  };

  let listRecipes: typeof import("../list").listRecipes;
  let db: typeof import("@/lib/db").db;
  let schema: typeof import("@/lib/db/schema");

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    ({ listRecipes } = await import("../list"));
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");

    await db.insert(schema.users).values({
      id: userId,
      email: `suchtest-${suffix}@example.test`,
      passwordHash: "x",
      name: "Suchtest",
      status: "approved",
    });

    const [zopf, risotto, roesti, suppe] = await db
      .insert(schema.recipes)
      .values([
        {
          userId,
          title: titel.zopf,
          category: "Backen",
          cuisine: "Schweizer",
          description: "Geflochtenes Butterbrot für den Sonntag.",
          instructions: "Teig kneten, gehen lassen, flechten, backen.",
          servings: 4,
        },
        {
          userId,
          title: titel.risotto,
          category: "Hauptgericht",
          cuisine: "Italienisch",
          description: "Cremiger Reis aus der Lombardei.",
          instructions: "Reis anschwitzen, ablöschen, rühren.",
          servings: 4,
        },
        {
          userId,
          title: titel.roesti,
          category: "Hauptgericht",
          cuisine: "Schweizer",
          description: "Knusprige Kartoffelfladen.",
          instructions: "Kartoffeln raffeln und braten.",
          tags: ["Vegetarisch", "Geflügel"],
          servings: 2,
        },
        {
          userId,
          title: titel.suppe,
          description: "Mehlsuppe für die Fasnacht.",
          instructions: "Mehl rösten, Bouillon zugeben.",
          servings: 4,
        },
        {
          userId,
          title: titel.curry,
          category: "Hauptgericht",
          cuisine: "Asiatisch",
          instructions: "Gemüse mit Currypaste kochen.",
          tags: ["Asiatisch", "Vegetarisch"],
          servings: 2,
        },
      ])
      .returning({ id: schema.recipes.id });

    await db.insert(schema.ingredients).values([
      { recipeId: zopf.id, name: "Butter", sortOrder: 0 },
      { recipeId: risotto.id, name: "Safranfäden", sortOrder: 0 },
      { recipeId: roesti.id, name: "Kartoffeln", sortOrder: 0 },
      { recipeId: suppe.id, name: "Weissmehl", sortOrder: 0 },
    ]);
  });

  afterAll(async () => {
    if (!erreichbar) return;
    const { eq } = await import("drizzle-orm");
    await db.delete(schema.recipes).where(eq(schema.recipes.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  });

  async function suche(q: string) {
    const ergebnis = await listRecipes(userId, {
      q,
      includeFacets: "false",
      seite: 1,
      limit: 20,
      sortierung: "relevanz",
    });
    return ergebnis.recipes.map((r) => r.title);
  }

  async function filterSuche(
    filters: Partial<import("../list").RecipeListParams> = {},
    ownerId = userId,
  ) {
    return listRecipes(ownerId, {
      includeFacets: "true",
      seite: 1,
      limit: 1,
      sortierung: "neueste",
      ...filters,
    });
  }

  it("liefert gespeicherte Filteroptionen unabhängig von der Ergebnisseite", async () => {
    const result = await filterSuche();
    expect(result.recipes).toHaveLength(1);
    expect(result.facets?.categories).toEqual([
      { value: "Backen", count: 1 },
      { value: "Hauptgericht", count: 3 },
    ]);
    expect(result.facets?.cuisines).toEqual([
      { value: "Asiatisch", count: 1 },
      { value: "Italienisch", count: 1 },
      { value: "Schweizer", count: 2 },
    ]);
  });

  it("behält Kategorien und Küchen bei einer Suche ohne Treffer bei", async () => {
    const result = await filterSuche({ q: "quantenphysik" });
    expect(result.recipes).toEqual([]);
    expect(result.facets?.categories).toEqual([
      { value: "Backen", count: 0 },
      { value: "Hauptgericht", count: 0 },
    ]);
    expect(result.facets?.cuisines).toEqual([
      { value: "Asiatisch", count: 0 },
      { value: "Italienisch", count: 0 },
      { value: "Schweizer", count: 0 },
    ]);
  });

  it("behält Optionen bei kombinierten Filtern und zählt ohne den eigenen Filter", async () => {
    const result = await filterSuche({
      kategorie: "Backen",
      kueche: "Asiatisch",
    });
    expect(result.recipes).toEqual([]);
    expect(result.facets?.categories).toEqual([
      { value: "Backen", count: 0 },
      { value: "Hauptgericht", count: 1 },
    ]);
    expect(result.facets?.cuisines).toEqual([
      { value: "Asiatisch", count: 0 },
      { value: "Italienisch", count: 0 },
      { value: "Schweizer", count: 1 },
    ]);

    const selected = await filterSuche({ kueche: "Asiatisch" });
    expect(selected.recipes.map((r) => r.title)).toEqual([titel.curry]);
  });

  it("zeigt keine Kategorien oder Küchen anderer Nutzer", async () => {
    const result = await filterSuche({}, randomUUID());
    expect(result.facets?.categories).toEqual([]);
    expect(result.facets?.cuisines).toEqual([]);
  });

  it("findet Rezepte über ihre Tags, auch ab dem Wortanfang und ohne Umlautschreibung", async () => {
    expect(await suche("asiatisch")).toEqual([titel.curry]);
    expect(await suche("asia")).toEqual([titel.curry]);
    expect(await suche("gefluegel")).toEqual([titel.roesti]);
  });

  it("verzeiht Tippfehler bei Tags, ohne fremde Tags zu treffen", async () => {
    expect(await suche("asiatich")).toEqual([titel.curry]);
    expect(await suche("vegetarsch")).toEqual(
      expect.arrayContaining([titel.curry, titel.roesti]),
    );
    // Ein fremdes Wort darf über die Ähnlichkeit keinen Tag treffen.
    expect(await suche("schnell")).toEqual([]);
  });

  it("filtert exakt nach einem Tag und kombiniert ihn mit anderen Filtern", async () => {
    const asiatisch = await filterSuche({ tag: "Asiatisch" });
    expect(asiatisch.recipes.map((r) => r.title)).toEqual([titel.curry]);

    const vegetarisch = await filterSuche({ tag: "Vegetarisch", limit: 10 });
    expect(vegetarisch.recipes.map((r) => r.title).sort()).toEqual(
      [titel.curry, titel.roesti].sort(),
    );

    const kombi = await filterSuche({ tag: "Vegetarisch", kueche: "Asiatisch" });
    expect(kombi.recipes.map((r) => r.title)).toEqual([titel.curry]);
  });

  it("liefert Tag-Facetten mit Zählung, auch bei einer Suche ohne Treffer", async () => {
    const alle = await filterSuche();
    expect(alle.facets?.tags).toEqual([
      { value: "Asiatisch", count: 1 },
      { value: "Geflügel", count: 1 },
      { value: "Vegetarisch", count: 2 },
    ]);

    const ohneTreffer = await filterSuche({ q: "quantenphysik" });
    expect(ohneTreffer.facets?.tags).toEqual([
      { value: "Asiatisch", count: 0 },
      { value: "Geflügel", count: 0 },
      { value: "Vegetarisch", count: 0 },
    ]);

    const mitTag = await filterSuche({ tag: "Asiatisch", kueche: "Schweizer" });
    expect(mitTag.facets?.tags).toEqual([
      { value: "Asiatisch", count: 0 },
      { value: "Geflügel", count: 1 },
      { value: "Vegetarisch", count: 1 },
    ]);
    // Die Küche-Zählung berücksichtigt den gewählten Tag.
    expect(mitTag.facets?.cuisines).toEqual([
      { value: "Asiatisch", count: 1 },
      { value: "Italienisch", count: 0 },
      { value: "Schweizer", count: 0 },
    ]);
  });

  it("findet ein Rezept ab dem Wortanfang — das war der gemeldete Fehler", async () => {
    expect(await suche("butterzop")).toContain(titel.zopf);
    expect(await suche("risot")).toContain(titel.risotto);
  });

  it("verzeiht Tippfehler", async () => {
    expect(await suche("risoto")).toContain(titel.risotto);
    expect(await suche("mehlsuppe")).toContain(titel.suppe);
  });

  it("findet Umlaute in beiden Schreibweisen", async () => {
    expect(await suche("Rösti")).toContain(titel.roesti);
    expect(await suche("Roesti")).toContain(titel.roesti);
  });

  it("findet Rezepte ueber ihre Zutaten", async () => {
    expect(await suche("safran")).toContain(titel.risotto);
    expect(await suche("weissmehl")).toContain(titel.suppe);
  });

  it("sortiert den besten Treffer nach vorn", async () => {
    const treffer = await suche("mehlsuppe");
    expect(treffer[0]).toBe(titel.suppe);
  });

  it("liefert bei unpassender Eingabe nichts", async () => {
    expect(await suche("quantenphysik")).toHaveLength(0);
  });

  it("laesst eine Eingabe aus reinen Satzzeichen wirkungslos", async () => {
    // Kein verwertbares Token: die Liste darf dadurch nicht leer werden.
    const alle = await suche("!!! ???");
    expect(alle.length).toBeGreaterThanOrEqual(4);
  });
});
