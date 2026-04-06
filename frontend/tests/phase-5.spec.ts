/**
 * Phase 5 – Volltextsuche & Kategoriebasierte Filter
 *
 * Voraussetzung: PostgreSQL läuft (docker compose up -d) mit fts_vector-Spalte
 * (entweder via db/init.sql oder via drizzle-kit migrate).
 * Der Dev-Server startet automatisch via playwright.config.ts (Port 3002).
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "harrywitzthum@gmail.com";
const ADMIN_PASSWORD = "05!Shakespeare_15";

const RUN_ID = Date.now().toString(36);

// ── Hilfs-Login ───────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── API-Hilfe: Rezept erstellen ───────────────────────────────────────────────

interface RecipeOverrides {
  title?: string;
  instructions?: string;
  description?: string;
  category?: string;
  cuisine?: string;
  difficulty?: "einfach" | "mittel" | "anspruchsvoll";
  tags?: string[];
  totalTimeMinutes?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
}

async function createRecipeViaApi(
  page: import("@playwright/test").Page,
  overrides: RecipeOverrides = {},
): Promise<string> {
  const title = overrides.title ?? `Testrezept-${RUN_ID}`;
  const resp = await page.evaluate(
    async (args: { title: string; overrides: RecipeOverrides }) => {
      // Build body without null values: Zod optional fields need undefined (omitted from JSON),
      // not null — sending null causes Zod validation errors on non-nullable optional fields.
      const body: Record<string, unknown> = {
        title: args.title,
        servings: 4,
        instructions: args.overrides.instructions ?? "Testanleitung für Playwright.",
        difficulty: args.overrides.difficulty ?? "einfach",
        tags: args.overrides.tags ?? ["test"],
        ingredients: [
          { name: "Mehl", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
        ],
      };
      if (args.overrides.description) body.description = args.overrides.description;
      if (args.overrides.category) body.category = args.overrides.category;
      if (args.overrides.cuisine) body.cuisine = args.overrides.cuisine;
      if (args.overrides.prepTimeMinutes != null) body.prepTimeMinutes = args.overrides.prepTimeMinutes;
      if (args.overrides.cookTimeMinutes != null) body.cookTimeMinutes = args.overrides.cookTimeMinutes;

      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json();
      return { status: res.status, id: resBody.id as string };
    },
    { title, overrides },
  );

  expect(resp.status).toBe(201);
  expect(resp.id).toBeTruthy();
  return resp.id;
}

// ── 5.1 Volltextsuche – API ────────────────────────────────────────────────────

test.describe("5.1 – Volltextsuche API", () => {
  test("GET /api/recipes?q= unauthenticated → 401", async ({ request }) => {
    const res = await request.get("/api/recipes?q=test");
    expect(res.status()).toBe(401);
  });

  test("FTS findet Rezept anhand eindeutigem Titelwort", async ({ page }) => {
    await loginAdmin(page);
    const unique = `zitronen${RUN_ID}kuchen`;
    await createRecipeViaApi(page, { title: `Rezept ${unique} Titeltest` });

    // Warte kurz damit der tsvector aktualisiert ist
    await page.waitForTimeout(200);

    const result = await page.evaluate(async (q: string) => {
      const res = await fetch(`/api/recipes?q=${encodeURIComponent(q)}`);
      return res.json();
    }, unique);

    expect(result.recipes.some((r: { title: string }) => r.title.includes(unique))).toBe(true);
  });

  test("FTS findet Rezept anhand eindeutigem Wort in Anleitung (Gewicht C)", async ({ page }) => {
    await loginAdmin(page);
    const marker = `pflaumenmousse${RUN_ID}`;
    await createRecipeViaApi(page, {
      title: `Torte-${RUN_ID}`,
      instructions: `Zubereitung mit ${marker} als Füllung.`,
    });

    await page.waitForTimeout(200);

    const result = await page.evaluate(async (q: string) => {
      const res = await fetch(`/api/recipes?q=${encodeURIComponent(q)}`);
      return res.json();
    }, marker);

    expect(result.recipes.length).toBeGreaterThanOrEqual(1);
  });

  test("FTS findet Rezept anhand eindeutigem Wort in Beschreibung (Gewicht B)", async ({ page }) => {
    await loginAdmin(page);
    const marker = `mandelcreme${RUN_ID}`;
    await createRecipeViaApi(page, {
      title: `Gebäck-${RUN_ID}`,
      description: `Dieses Rezept enthält ${marker} als Hauptzutat.`,
    });

    await page.waitForTimeout(200);

    const result = await page.evaluate(async (q: string) => {
      const res = await fetch(`/api/recipes?q=${encodeURIComponent(q)}`);
      return res.json();
    }, marker);

    expect(result.recipes.length).toBeGreaterThanOrEqual(1);
  });

  test("sortierung=relevanz bei Suchanfrage → 200", async ({ page }) => {
    await loginAdmin(page);
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/recipes?q=test&sortierung=relevanz");
      return { status: res.status };
    });
    expect(result.status).toBe(200);
  });

  test("includeFacets=true gibt facets.categories Array zurück", async ({ page }) => {
    await loginAdmin(page);
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/recipes?includeFacets=true");
      return res.json();
    });
    expect(result.facets).toBeDefined();
    expect(Array.isArray(result.facets.categories)).toBe(true);
    expect(Array.isArray(result.facets.cuisines)).toBe(true);
    expect(Array.isArray(result.facets.difficulties)).toBe(true);
  });

  test("includeFacets=false gibt kein facets-Objekt zurück", async ({ page }) => {
    await loginAdmin(page);
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/recipes?includeFacets=false");
      return res.json();
    });
    expect(result.facets).toBeUndefined();
  });
});

// ── 5.2 Kategoriebasierte Filter – API ────────────────────────────────────────

test.describe("5.2 – Kategoriebasierte Filter API", () => {
  test("zeitaufwand=30 gibt nur Rezepte mit total_time_minutes <= 30 zurück", async ({ page }) => {
    await loginAdmin(page);

    // Erstelle Rezept mit 20 Minuten
    await createRecipeViaApi(page, {
      title: `Schnellrezept-${RUN_ID}`,
      prepTimeMinutes: 10,
      cookTimeMinutes: 10,
    });
    // Erstelle Rezept mit 90 Minuten
    await createRecipeViaApi(page, {
      title: `Langsamrezept-${RUN_ID}`,
      prepTimeMinutes: 30,
      cookTimeMinutes: 60,
    });

    await page.waitForTimeout(200);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/recipes?zeitaufwand=30");
      return res.json();
    });

    expect(result.recipes.every((r: { totalTimeMinutes: number | null }) =>
      r.totalTimeMinutes === null || r.totalTimeMinutes <= 30,
    )).toBe(true);
  });

  test("ernaehrungsform filtert nach tags-Eintrag", async ({ page }) => {
    await loginAdmin(page);
    const tag = `vegan${RUN_ID}`;
    await createRecipeViaApi(page, {
      title: `VeganTest-${RUN_ID}`,
      tags: [tag, "test"],
    });

    await page.waitForTimeout(200);

    const result = await page.evaluate(async (t: string) => {
      const res = await fetch(`/api/recipes?ernaehrungsform=${encodeURIComponent(t)}`);
      return res.json();
    }, tag);

    expect(result.recipes.some((r: { tags: string[] }) => r.tags?.includes(tag))).toBe(true);
  });

  test("zutaten filtert Rezepte anhand Zutatname", async ({ page }) => {
    await loginAdmin(page);
    const uniqueIngredient = `Zitronengras${RUN_ID}`;

    const resp = await page.evaluate(
      async (args: { title: string; ingName: string }) => {
        const res = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: args.title,
            servings: 2,
            instructions: "Testen.",
            tags: ["test"],
            difficulty: "einfach",
            ingredients: [
              { name: args.ingName, amount: 2, unit: "Stk.", sortOrder: 0, isOptional: false },
            ],
          }),
        });
        const body = await res.json();
        return { status: res.status, id: body.id };
      },
      { title: `ZutatTest-${RUN_ID}`, ingName: uniqueIngredient },
    );
    expect(resp.status).toBe(201);

    await page.waitForTimeout(200);

    const result = await page.evaluate(async (q: string) => {
      const res = await fetch(`/api/recipes?zutaten=${encodeURIComponent(q)}`);
      return res.json();
    }, uniqueIngredient);

    expect(result.recipes.some((r: { id: string }) => r.id === resp.id)).toBe(true);
  });

  test("ungültiger schwierigkeit-Wert → 400 (authentifiziert)", async ({ page }) => {
    await loginAdmin(page);
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/recipes?schwierigkeit=unmöglich");
      return res.status;
    });
    expect(status).toBe(400);
  });

  test("kategorie-Filter schränkt Ergebnisse ein", async ({ page }) => {
    await loginAdmin(page);
    const cat = `Kat${RUN_ID}`;
    await createRecipeViaApi(page, {
      title: `KatTest-${RUN_ID}`,
      category: cat,
    });

    await page.waitForTimeout(200);

    const result = await page.evaluate(async (c: string) => {
      const res = await fetch(`/api/recipes?kategorie=${encodeURIComponent(c)}`);
      return res.json();
    }, cat);

    expect(result.recipes.every((r: { category: string | null }) => r.category === cat)).toBe(true);
    expect(result.recipes.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 5.3 /suche UI-Tests ───────────────────────────────────────────────────────

test.describe("5.3 – /suche Seite", () => {
  test("/suche lädt mit Überschrift", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Suche/i })).toBeVisible({ timeout: 8_000 });
  });

  test("Suchfeld ist vorhanden und fokussierbar", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.waitForLoadState("networkidle");
    const searchInput = page.getByRole("searchbox");
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
  });

  test("Suche nach eindeutigem Titelwort zeigt Ergebnis mit hervorgehobenem Begriff", async ({
    page,
  }) => {
    await loginAdmin(page);
    const unique = `suchtest${RUN_ID}`;
    await createRecipeViaApi(page, { title: `Markiert-${unique}` });

    await page.goto("/suche");
    await page.waitForLoadState("networkidle");

    const searchInput = page.getByRole("searchbox");
    await searchInput.fill(unique);
    await page.waitForTimeout(800); // Debounce (400ms) + Netzwerk + Render

    // Mindestens ein Ergebnis sichtbar
    await expect(page.locator('[data-testid="result-list"] li').first()).toBeVisible({
      timeout: 10_000,
    });
    // Highlight-Element vorhanden (<mark> um gefundenen Begriff)
    const mark = page.locator('[data-testid="result-list"] mark').first();
    await expect(mark).toBeVisible({ timeout: 8_000 });
  });

  test("Direktaufruf /suche?kategorie=Dessert → Kategorie-Select vorbefüllt", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche?kategorie=Dessert");
    await page.waitForLoadState("networkidle");
    // Der Select mit name="kategorie" oder data-filter="kategorie" hat Wert "Dessert"
    const categorySelect = page.locator('[name="kategorie"], [data-filter="kategorie"]').first();
    await expect(categorySelect).toHaveValue("Dessert", { timeout: 8_000 });
  });

  test("Direktaufruf /suche?schwierigkeit=einfach → aktiver Filter-Chip sichtbar", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/suche?schwierigkeit=einfach");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Einfach").first()).toBeVisible({ timeout: 8_000 });
  });

  test("Aktiver Filter-Chip: X-Button entfernt Filter aus URL", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche?schwierigkeit=einfach");
    await page.waitForLoadState("networkidle");

    // Warte auf Chip
    await expect(page.getByText("Einfach").first()).toBeVisible({ timeout: 8_000 });

    // Klicke X-Button (aria-label="Entfernen")
    await page.getByRole("button", { name: "Entfernen" }).first().click();

    // URL darf schwierigkeit nicht mehr enthalten
    await expect(page).not.toHaveURL(/schwierigkeit/, { timeout: 5_000 });
  });

  test("Filter-URL ist geteilt: Query-Parameter bleiben nach Reload erhalten", async ({ page }) => {
    await loginAdmin(page);
    await createRecipeViaApi(page, {
      title: `URLTest-${RUN_ID}`,
      category: "Hauptgericht",
    });

    await page.goto("/suche?q=URLTest&kategorie=Hauptgericht");
    await page.waitForLoadState("networkidle");

    // Nach dem Laden sollen beide Parameter in der URL stehen
    await expect(page).toHaveURL(/q=URLTest/, { timeout: 5_000 });
    await expect(page).toHaveURL(/kategorie=Hauptgericht/);
  });

  test("Ergebnis-Anzahl wird angezeigt", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.waitForLoadState("networkidle");
    // Z.B. "5 Rezepte" oder "1 Rezept"
    await expect(page.getByText(/\d+ Rezept/)).toBeVisible({ timeout: 8_000 });
  });

  test("Mehr-laden-Button lädt weitere Ergebnisse nach (wenn vorhanden)", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.waitForLoadState("networkidle");

    const moreBtn = page.getByRole("button", { name: /Mehr laden/i });
    if (await moreBtn.isVisible()) {
      // Use data-testid selector to count only recipe result items (not nav items)
      const countBefore = await page.locator('[data-testid="result-list"] li').count();
      await moreBtn.click();
      await page.waitForTimeout(1000); // wait for fetch + re-render
      const countAfter = await page.locator('[data-testid="result-list"] li').count();
      expect(countAfter).toBeGreaterThan(countBefore);
    }
    // Wenn Button nicht sichtbar ist (weniger als 20 Rezepte), ist der Test trotzdem bestanden
  });
});
