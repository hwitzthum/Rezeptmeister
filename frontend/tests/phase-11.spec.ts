/**
 * Phase 11 – Wochenplanung (Meal Planning)
 *
 * Voraussetzungen:
 * - PostgreSQL läuft (docker compose up -d)
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

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD müssen in .env oder als Umgebungsvariablen gesetzt sein.",
  );
}

const RUN_ID = Date.now().toString(36);

// ── Hilfs-Login ──────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
}

// ── Hilfs-Rezept erstellen ───────────────────────────────────────────────────

async function createRecipeViaApi(
  page: import("@playwright/test").Page,
  suffix: string,
): Promise<string> {
  const resp = await page.evaluate(
    async (args: { title: string }) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: args.title,
          instructions: "Zutaten mischen und servieren.",
          servings: 4,
          ingredients: [
            {
              name: "Mehl",
              amount: 250,
              unit: "g",
              sortOrder: 0,
              isOptional: false,
            },
          ],
          tags: ["Test"],
          sourceType: "manual",
        }),
      });
      return res.json() as Promise<{ id: string }>;
    },
    { title: `Phase-11-Rezept-${RUN_ID}-${suffix}` },
  );
  return resp.id;
}

// ── Hilfs: Wochenplan leeren ─────────────────────────────────────────────────

async function clearMealPlans(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day === 0 ? 7 : day) - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const res = await fetch(`/api/meal-plans?start=${fmt(monday)}&end=${fmt(sunday)}`);
    const data = await res.json() as { entries: { id: string }[] };
    for (const entry of data.entries) {
      await fetch(`/api/meal-plans/${entry.id}`, { method: "DELETE" });
    }
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Phase 11 – Wochenplanung", () => {
  // 11.1 – Seite sichtbar
  test("11.1 Wochenplan-Seite mit Überschrift und Raster sichtbar", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/wochenplan");

    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("heading", { name: "Wochenplan" }),
    ).toBeVisible();

    // Grid or mobile grid visible
    const desktopGrid = page.getByTestId("meal-plan-grid");
    const mobileGrid = page.getByTestId("meal-plan-grid-mobile");
    const gridVisible = await desktopGrid
      .isVisible()
      .catch(() => false);
    const mobileVisible = await mobileGrid
      .isVisible()
      .catch(() => false);
    expect(gridVisible || mobileVisible).toBe(true);
  });

  // 11.2 – Rezept hinzufügen
  test("11.2 Rezept zum Wochenplan hinzufügen", async ({ page }) => {
    await loginAdmin(page);
    await clearMealPlans(page);
    const recipeId = await createRecipeViaApi(page, "11-2");

    await page.goto("/wochenplan");
    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });

    // Find the first add button on the page
    const addButtons = page.locator("[data-testid^='meal-slot-add-']");
    const firstAdd = addButtons.first();
    await expect(firstAdd).toBeVisible({ timeout: 5_000 });
    await firstAdd.click();

    // Picker dialog should open
    await expect(page.getByTestId("recipe-picker-dialog")).toBeVisible({
      timeout: 5_000,
    });

    // Find the recipe in the picker
    await page.getByTestId("recipe-picker-search").fill(`Phase-11-Rezept-${RUN_ID}-11-2`);

    // Click on the recipe item
    await page.getByTestId(`recipe-picker-item-${recipeId}`).click();

    // Verify entry appears
    await expect(
      page.locator(`[data-testid^="meal-plan-entry-"]`).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Verify recipe title is shown in the grid
    await expect(
      page.getByTestId("meal-plan-grid").getByText(`Phase-11-Rezept-${RUN_ID}-11-2`),
    ).toBeVisible();
  });

  // 11.3 – Eintrag entfernen
  test("11.3 Eintrag aus dem Wochenplan entfernen", async ({ page }) => {
    await loginAdmin(page);
    await clearMealPlans(page);
    const recipeId = await createRecipeViaApi(page, "11-3");

    // Create entry via API to get a known entry ID
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day === 0 ? 7 : day) - 1));
    const dateStr = monday.toISOString().split("T")[0];

    const entry = await page.evaluate(
      async (args: { date: string; recipeId: string }) => {
        const res = await fetch("/api/meal-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: args.date,
            mealType: "abendessen",
            recipeId: args.recipeId,
          }),
        });
        return res.json() as Promise<{ id: string }>;
      },
      { date: dateStr, recipeId },
    );

    await page.goto("/wochenplan");
    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });

    // Verify entry is visible
    const entryCard = page.getByTestId("meal-plan-grid").getByTestId(`meal-plan-entry-${entry.id}`);
    await expect(entryCard).toBeVisible({ timeout: 5_000 });

    // Click remove button (force: true because it is opacity-0 until hover)
    const removeBtn = page.getByTestId("meal-plan-grid").getByTestId(`meal-plan-remove-${entry.id}`);
    await removeBtn.click({ force: true });

    // Verify entry is gone
    await expect(entryCard).not.toBeVisible({ timeout: 5_000 });
  });

  // 11.4 – Wochennavigation
  test("11.4 Wochennavigation: vor/zurück und Heute", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/wochenplan");
    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });

    const label = page.getByTestId("meal-plan-week-label");
    const initialText = await label.textContent();

    // Go to next week
    await page.getByTestId("meal-plan-next-week").click();
    await expect(label).not.toHaveText(initialText!, { timeout: 5_000 });
    const nextText = await label.textContent();
    expect(nextText).not.toBe(initialText);

    // Go back (prev week)
    await page.getByTestId("meal-plan-prev-week").click();
    await expect(label).toHaveText(initialText!, { timeout: 5_000 });

    // Go forward again, then "Heute"
    await page.getByTestId("meal-plan-next-week").click();
    await expect(label).not.toHaveText(initialText!, { timeout: 5_000 });

    await page.getByTestId("meal-plan-today-button").click();
    await expect(label).toHaveText(initialText!, { timeout: 5_000 });
  });

  // 11.5 – Portionen ändern
  test("11.5 Portionen im Wochenplan anpassen", async ({ page }) => {
    await loginAdmin(page);
    await clearMealPlans(page);
    const recipeId = await createRecipeViaApi(page, "11-5");

    // Create entry via API with a known ID
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((day === 0 ? 7 : day) - 1));
    const dateStr = monday.toISOString().split("T")[0];

    const entry = await page.evaluate(
      async (args: { date: string; recipeId: string }) => {
        const res = await fetch("/api/meal-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: args.date,
            mealType: "mittagessen",
            recipeId: args.recipeId,
          }),
        });
        return res.json() as Promise<{ id: string }>;
      },
      { date: dateStr, recipeId },
    );

    await page.goto("/wochenplan");
    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });

    const servingsContainer = page.getByTestId("meal-plan-grid").getByTestId(`meal-plan-servings-${entry.id}`);
    await expect(servingsContainer).toBeVisible({ timeout: 5_000 });

    // Click "+" to increase
    await servingsContainer
      .getByRole("button", { name: "Mehr Portionen" })
      .click();

    // Verify servings increased
    await expect(servingsContainer.locator("span")).toContainText("5 Port.", {
      timeout: 3_000,
    });

    // Click "-" to decrease
    await servingsContainer
      .getByRole("button", { name: "Weniger Portionen" })
      .click();
    await expect(servingsContainer.locator("span")).toContainText("4 Port.", {
      timeout: 3_000,
    });
  });

  // 11.6 – API CRUD direkt
  test("11.6 API CRUD: Eintrag erstellen und abrufen", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "11-6");

    // Create entry via API
    const created = await page.evaluate(
      async (args: { recipeId: string }) => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const dd = String(today.getDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const res = await fetch("/api/meal-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: dateStr,
            mealType: "snack",
            recipeId: args.recipeId,
          }),
        });
        return {
          status: res.status,
          body: (await res.json()) as { id: string; recipeTitle: string },
        };
      },
      { recipeId },
    );

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
    expect(created.body.recipeTitle).toContain(`Phase-11-Rezept-${RUN_ID}-11-6`);

    // GET entries
    const fetched = await page.evaluate(async () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const res = await fetch(
        `/api/meal-plans?start=${dateStr}&end=${dateStr}`,
      );
      return res.json() as Promise<{
        entries: { id: string; mealType: string }[];
      }>;
    });

    expect(fetched.entries.length).toBeGreaterThan(0);
    const found = fetched.entries.find((e) => e.id === created.body.id);
    expect(found).toBeTruthy();
    expect(found!.mealType).toBe("snack");
  });

  // 11.7 – Picker-Suche
  test("11.7 Rezeptauswahl-Dialog filtert bei Suche", async ({ page }) => {
    await loginAdmin(page);
    // Create two recipes with distinct names
    await createRecipeViaApi(page, "11-7-apfel");
    await createRecipeViaApi(page, "11-7-birne");

    await page.goto("/wochenplan");
    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });

    // Open picker
    const addButtons = page.locator("[data-testid^='meal-slot-add-']");
    await addButtons.first().click();
    await expect(page.getByTestId("recipe-picker-dialog")).toBeVisible({
      timeout: 5_000,
    });

    // Both recipes should be visible initially
    await expect(page.getByText(`Phase-11-Rezept-${RUN_ID}-11-7-apfel`)).toBeVisible();
    await expect(page.getByText(`Phase-11-Rezept-${RUN_ID}-11-7-birne`)).toBeVisible();

    // Search for "apfel"
    await page.getByTestId("recipe-picker-search").fill("apfel");

    // Only apfel should be visible
    await expect(page.getByText(`Phase-11-Rezept-${RUN_ID}-11-7-apfel`)).toBeVisible();
    await expect(
      page.getByText(`Phase-11-Rezept-${RUN_ID}-11-7-birne`),
    ).not.toBeVisible({ timeout: 3_000 });

    // Clear and search "birne"
    await page.getByTestId("recipe-picker-search").fill("birne");
    await expect(page.getByText(`Phase-11-Rezept-${RUN_ID}-11-7-birne`)).toBeVisible();
    await expect(
      page.getByText(`Phase-11-Rezept-${RUN_ID}-11-7-apfel`),
    ).not.toBeVisible({ timeout: 3_000 });
  });
});
