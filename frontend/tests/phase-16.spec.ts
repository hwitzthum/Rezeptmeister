/**
 * Phase 16 -- "Was kann ich kochen?" (F-SEARCH-04)
 *
 * Voraussetzungen:
 * - PostgreSQL laeuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 *
 * Alle Tests sind self-contained (erstellen ihre eigenen Daten).
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// Test-Secrets aus Root-.env lesen
function loadEnvVar(varName: string): string {
  if (process.env[varName]) return process.env[varName]!;
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const m = fs
      .readFileSync(envPath, "utf-8")
      .match(new RegExp(`^${varName}=(.+)$`, "m"));
    if (m) return m[1].trim();
  }
  return "";
}

const ADMIN_EMAIL = loadEnvVar("TEST_ADMIN_EMAIL");
const ADMIN_PASSWORD = loadEnvVar("TEST_ADMIN_PASSWORD");
const CREDS_AVAILABLE = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const RUN_ID = Date.now().toString(36);

// ── Hilfs-Login ──────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── Hilfs-Rezept per API erstellen (mit spezifischen Zutaten) ───────────────

async function createRecipeViaApi(
  page: import("@playwright/test").Page,
  suffix: string,
  ingredientList: { name: string; amount: number; unit: string; isOptional?: boolean }[],
): Promise<string> {
  const resp = await page.evaluate(
    async (args: {
      title: string;
      ingredients: { name: string; amount: number; unit: string; sortOrder: number; isOptional: boolean }[];
    }) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: args.title,
          instructions: "Zubereitung: Alle Zutaten mischen und servieren.",
          servings: 4,
          totalTimeMinutes: 30,
          difficulty: "einfach",
          category: "Hauptgericht",
          ingredients: args.ingredients,
        }),
      });
      if (!res.ok) return { error: await res.text() };
      return res.json();
    },
    {
      title: `Phase16-${suffix}-${RUN_ID}`,
      ingredients: ingredientList.map((ing, idx) => ({
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        sortOrder: idx,
        isOptional: ing.isOptional ?? false,
      })),
    },
  );
  if ("error" in resp) throw new Error(`Rezept erstellen fehlgeschlagen: ${resp.error}`);
  return (resp as { id: string }).id;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Phase 16 – Was kann ich kochen?", () => {
  test.skip(!CREDS_AVAILABLE, "Test-Credentials nicht verfuegbar");

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("Zutaten-Tab ist sichtbar und wechselbar", async ({ page }) => {
    await page.goto("/suche");

    const toggle = page.getByTestId("zutaten-suche-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText("Zutaten");

    await toggle.click();

    // Ingredient input should now be visible
    await expect(page.getByTestId("ingredient-tag-input")).toBeVisible();
    // "Was kann ich kochen?" heading
    await expect(page.getByText("Was kann ich kochen?")).toBeVisible();
  });

  test("Autocomplete zeigt Vorschlaege", async ({ page }) => {
    // Create a recipe with known ingredients
    await createRecipeViaApi(page, "autocomplete", [
      { name: "Kartoffeln", amount: 500, unit: "g" },
      { name: "Zwiebeln", amount: 2, unit: "Stk." },
    ]);

    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");
    await input.fill("kart");

    // Wait for autocomplete dropdown
    const dropdown = page.getByTestId("autocomplete-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 5_000 });

    // Should contain "kartoffeln" (lowercase normalized)
    await expect(dropdown.getByRole("option").first()).toContainText(/kartoffeln/i);
  });

  test("Zutaten-Chips werden angezeigt und entfernt", async ({ page }) => {
    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");

    // Add ingredients via free-form text
    await input.fill("Mehl");
    await input.press("Enter");
    await input.fill("Butter");
    await input.press("Enter");

    const container = page.getByTestId("ingredient-tag-input");

    // Verify chips are visible
    await expect(container.getByText("Mehl")).toBeVisible();
    await expect(container.getByText("Butter")).toBeVisible();

    // Remove "Mehl" chip
    await container.getByLabel("Mehl entfernen").click();
    await expect(container.getByText("Mehl")).not.toBeVisible();
    await expect(container.getByText("Butter")).toBeVisible();
  });

  test("Matching-Ergebnisse nach Uebereinstimmung sortiert", async ({ page }) => {
    // Use unique ingredient names to avoid collisions with other test data
    const u = RUN_ID;
    // Recipe A: 2 of 3 match → 67%
    await createRecipeViaApi(page, "match-hoch", [
      { name: `Zutat-A-${u}`, amount: 500, unit: "g" },
      { name: `Zutat-B-${u}`, amount: 50, unit: "g" },
      { name: `Zutat-C-${u}`, amount: 2, unit: "dl" },
    ]);

    // Recipe B: 1 of 4 match → 25%
    await createRecipeViaApi(page, "match-tief", [
      { name: `Zutat-A-${u}`, amount: 300, unit: "g" },
      { name: `Zutat-D-${u}`, amount: 400, unit: "g" },
      { name: `Zutat-E-${u}`, amount: 2, unit: "dl" },
      { name: `Zutat-F-${u}`, amount: 3, unit: "Stk." },
    ]);

    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");
    await input.fill(`Zutat-A-${u}`);
    await input.press("Enter");
    await input.fill(`Zutat-B-${u}`);
    await input.press("Enter");

    // Wait for results
    const resultList = page.getByTestId("zutaten-result-list");
    await expect(resultList).toBeVisible({ timeout: 10_000 });

    // The high-match recipe (67%) should appear before the low-match one (25%)
    const items = resultList.locator("li");
    await expect(items.first()).toContainText(/match-hoch/i);
    await expect(items.nth(1)).toContainText(/match-tief/i);
  });

  test("Match-Info zeigt 'X von Y Zutaten vorhanden'", async ({ page }) => {
    await createRecipeViaApi(page, "matchinfo", [
      { name: "Reis", amount: 300, unit: "g" },
      { name: "Sojasauce", amount: 3, unit: "EL" },
      { name: "Ingwer", amount: 1, unit: "Stk." },
    ]);

    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");
    await input.fill("Reis");
    await input.press("Enter");
    await input.fill("Sojasauce");
    await input.press("Enter");

    // Wait for results
    await expect(page.getByTestId("zutaten-result-list")).toBeVisible({ timeout: 10_000 });

    // Check match info text
    const matchInfo = page.getByTestId("match-info").first();
    await expect(matchInfo).toContainText("2 von 3");
    await expect(matchInfo).toContainText("Zutaten vorhanden");
  });

  test("Fehlende Zutaten zur Einkaufsliste hinzufuegen", async ({ page }) => {
    const recipeId = await createRecipeViaApi(page, "einkauf", [
      { name: "Tomaten", amount: 400, unit: "g" },
      { name: "Basilikum", amount: 1, unit: "Bund" },
      { name: "Mozzarella", amount: 200, unit: "g" },
    ]);

    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");
    await input.fill("Tomaten");
    await input.press("Enter");

    // Wait for results
    await expect(page.getByTestId("zutaten-result-list")).toBeVisible({ timeout: 10_000 });

    // Expand details
    await page.getByText("Details").first().click();

    // Click "Fehlende zur Einkaufsliste"
    const addBtn = page.getByTestId("add-missing-to-list").first();
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Expect success toast
    await expect(page.getByText(/zur Einkaufsliste hinzugefügt/i)).toBeVisible({ timeout: 5_000 });

    // Verify via API that items were added
    const shopItems = await page.evaluate(async () => {
      const res = await fetch("/api/shopping-list");
      if (!res.ok) return [];
      const data = await res.json();
      return data.items as { ingredientName: string }[];
    });

    const names = shopItems.map((i) => i.ingredientName.toLowerCase());
    expect(names).toContain("basilikum");
    expect(names).toContain("mozzarella");
  });

  test("Keine Ergebnisse bei unbekannter Zutat", async ({ page }) => {
    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");
    await input.fill("Xylofonadenwurst");
    await input.press("Enter");

    // Should show empty state
    await expect(page.getByTestId("zutaten-empty")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Keine passenden Rezepte")).toBeVisible();
  });

  test("Ergebnisse aktualisieren bei Chip-Entfernung", async ({ page }) => {
    await createRecipeViaApi(page, "chip-remove", [
      { name: "Eier", amount: 4, unit: "Stk." },
      { name: "Speck", amount: 100, unit: "g" },
    ]);

    await page.goto("/suche");
    await page.getByTestId("zutaten-suche-toggle").click();

    const input = page.getByTestId("ingredient-input");
    const container = page.getByTestId("ingredient-tag-input");

    // Add both ingredients
    await input.fill("Eier");
    await input.press("Enter");
    await input.fill("Speck");
    await input.press("Enter");

    // Wait for 100% match result
    await expect(page.getByTestId("zutaten-result-list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("match-info").first()).toContainText("2 von 2");

    // Remove "Speck"
    await container.getByLabel("Speck entfernen").click();

    // Wait for results to update — now only 1 of 2
    await expect(page.getByTestId("match-info").first()).toContainText("1 von 2", { timeout: 5_000 });
  });

  test("API: /api/recipes/ingredient-match gibt korrekte Struktur", async ({ page }) => {
    await createRecipeViaApi(page, "api-test", [
      { name: "Mehl", amount: 500, unit: "g" },
      { name: "Zucker", amount: 200, unit: "g" },
      { name: "Eier", amount: 3, unit: "Stk." },
    ]);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/recipes/ingredient-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: ["Mehl", "Zucker"] }),
      });
      return res.json();
    });

    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.recipes.length).toBeGreaterThanOrEqual(1);

    const recipe = result.recipes[0];
    expect(recipe).toHaveProperty("matchedCount");
    expect(recipe).toHaveProperty("matchPercentage");
    expect(recipe).toHaveProperty("totalIngredients");
    expect(recipe).toHaveProperty("matchedIngredients");
    expect(recipe).toHaveProperty("missingIngredients");
    expect(recipe.matchedCount).toBeGreaterThanOrEqual(1);
    expect(recipe.matchPercentage).toBeGreaterThan(0);
  });

  // ── Adversarial-Review Regressionstests ──────────────────────────────────

  test("batch-missing erzeugt keine Duplikate bei Doppelaufruf", async ({ page }) => {
    const u = RUN_ID;

    const recipeId = await createRecipeViaApi(page, "dupcheck", [
      { name: `DupA-${u}`, amount: 200, unit: "g" },
      { name: `DupB-${u}`, amount: 100, unit: "ml" },
    ]);

    // Einkaufsliste leeren
    await page.evaluate(async () => {
      await fetch("/api/shopping-list/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-all" }),
      });
      await fetch("/api/shopping-list/batch", { method: "DELETE" });
    });

    const callBatchMissing = (rid: string) =>
      page.evaluate(async (id: string) => {
        const res = await fetch("/api/shopping-list/batch-missing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId: id, availableIngredients: [] }),
        });
        return res.json() as Promise<{ added: number; merged: number; total: number }>;
      }, rid);

    const r1 = await callBatchMissing(recipeId);
    expect(r1.added).toBe(2);

    const r2 = await callBatchMissing(recipeId);
    expect(r2.added).toBe(0);
    expect(r2.merged).toBe(2);

    // Verify actual item count via API
    const items = await page.evaluate(async () => {
      const res = await fetch("/api/shopping-list");
      const data = await res.json();
      return data.items as { ingredientName: string }[];
    });
    const relevant = items.filter((i) => i.ingredientName.startsWith("Dup"));
    expect(relevant).toHaveLength(2);
  });

  test("'ei' als verfuegbare Zutat unterdrueckt 'Reis' nicht", async ({ page }) => {
    const u = RUN_ID;

    const recipeId = await createRecipeViaApi(page, "ei-reis", [
      { name: "Reis", amount: 300, unit: "g" },
      { name: "Eier", amount: 3, unit: "Stk." },
      { name: `Marker-${u}`, amount: 1, unit: "Stk." },
    ]);

    // Einkaufsliste leeren
    await page.evaluate(async () => {
      await fetch("/api/shopping-list/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-all" }),
      });
      await fetch("/api/shopping-list/batch", { method: "DELETE" });
    });

    // "ei" ist kein exakter Match fuer "Reis" oder "Eier" — alle 3 muessen hinzugefuegt werden
    const r1 = await page.evaluate(async (id: string) => {
      const res = await fetch("/api/shopping-list/batch-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: id, availableIngredients: ["ei"] }),
      });
      return res.json() as Promise<{ added: number }>;
    }, recipeId);
    expect(r1.added).toBe(3);

    // Aufraeumen
    await page.evaluate(async () => {
      await fetch("/api/shopping-list/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-all" }),
      });
      await fetch("/api/shopping-list/batch", { method: "DELETE" });
    });

    // "Eier" exakt → nur Eier wird gefiltert, Reis + Marker bleiben
    const r2 = await page.evaluate(async (id: string) => {
      const res = await fetch("/api/shopping-list/batch-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId: id, availableIngredients: ["Eier"] }),
      });
      return res.json() as Promise<{ added: number }>;
    }, recipeId);
    expect(r2.added).toBe(2);
  });

  test("API: /api/ingredients/autocomplete gibt Vorschlaege", async ({ page }) => {
    await createRecipeViaApi(page, "ac-api", [
      { name: "Paprika", amount: 2, unit: "Stk." },
    ]);

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/ingredients/autocomplete?q=pap");
      return res.json();
    });

    expect(result.suggestions).toBeDefined();
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(result.suggestions.some((s: string) => s.includes("paprika"))).toBe(true);
  });
});
