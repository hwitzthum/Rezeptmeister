/**
 * Phase 15 -- Dashboard (F-UI-05.3)
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

// ── Hilfs-Rezept per API erstellen ───────────────────────────────────────────

async function createRecipeViaApi(
  page: import("@playwright/test").Page,
  suffix: string,
  opts?: { isFavorite?: boolean },
): Promise<string> {
  const resp = await page.evaluate(
    async (args: { title: string }) => {
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
          ingredients: [
            { name: "Mehl", amount: 200, unit: "g", sortOrder: 0, isOptional: false },
          ],
        }),
      });
      if (!res.ok) return { error: await res.text() };
      return res.json();
    },
    { title: `Dashboard-${suffix}-${RUN_ID}` },
  );
  if ("error" in resp) throw new Error(`Rezept erstellen fehlgeschlagen: ${resp.error}`);

  // Set favorite if requested (separate endpoint)
  if (opts?.isFavorite) {
    await page.evaluate(
      async (id: string) => {
        await fetch(`/api/recipes/${id}/favorit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isFavorite: true }),
        });
      },
      resp.id,
    );
  }

  return resp.id;
}

// ── Hilfs: Einkaufslisteneintrag per API erstellen ───────────────────────────

async function addShoppingItemViaApi(
  page: import("@playwright/test").Page,
  name: string,
): Promise<void> {
  await page.evaluate(
    async (args: { name: string }) => {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientName: args.name,
          amount: 1,
          unit: "Stk.",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    { name },
  );
}

// ── Hilfs: Wochenplan-Eintrag per API erstellen ──────────────────────────────

async function addMealPlanViaApi(
  page: import("@playwright/test").Page,
  recipeId: string,
  mealType: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await page.evaluate(
    async (args: { recipeId: string; mealType: string; date: string }) => {
      const res = await fetch("/api/meal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: args.recipeId,
          mealType: args.mealType,
          date: args.date,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    { recipeId, mealType, date: today },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Phase 15 -- Dashboard", () => {
  test.beforeEach(async () => {
    test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD muessen gesetzt sein");
  });

  test("15.1 Dashboard laedt mit Begruessung", async ({ page }) => {
    await loginAdmin(page);
    // Dashboard should be at /
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });
    // Greeting contains one of the Swiss German greetings
    const greeting = page.getByTestId("dashboard-greeting");
    await expect(greeting).toBeVisible();
    const text = await greeting.textContent();
    expect(
      text?.includes("Guete Morge") ||
      text?.includes("Guete Tag") ||
      text?.includes("Guete Abig"),
    ).toBeTruthy();
  });

  test("15.2 Schnellzugriff-Buttons sichtbar", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });

    const quickActions = page.getByTestId("quick-actions");
    await expect(quickActions).toBeVisible();
    await expect(quickActions.getByRole("link", { name: /Neues Rezept/ })).toBeVisible();
    await expect(quickActions.getByRole("link", { name: /Bild hochladen/ })).toBeVisible();
    await expect(quickActions.getByRole("button", { name: /URL importieren/ })).toBeVisible();
  });

  test("15.3 Zuletzt-bearbeitet-Karussell zeigt Rezepte", async ({ page }) => {
    await loginAdmin(page);
    // Create a recipe first
    const recipeId = await createRecipeViaApi(page, "carousel");

    // Reload dashboard
    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });

    const carousel = page.getByTestId("recent-recipes-carousel");
    await expect(carousel).toBeVisible();
    await expect(carousel.getByText(`Dashboard-carousel-${RUN_ID}`)).toBeVisible({ timeout: 8_000 });

    // Clean up
    await page.evaluate(async (id: string) => {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    }, recipeId);
  });

  test("15.4 Favoriten-Widget zeigt Favoriten", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "fav", { isFavorite: true });

    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });

    const favWidget = page.getByTestId("favorites-widget");
    await expect(favWidget).toBeVisible();
    await expect(favWidget.getByText(`Dashboard-fav-${RUN_ID}`)).toBeVisible({ timeout: 8_000 });

    // Clean up
    await page.evaluate(async (id: string) => {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    }, recipeId);
  });

  test("15.5 Einkaufslisten-Widget zeigt offene Eintraege", async ({ page }) => {
    await loginAdmin(page);
    await addShoppingItemViaApi(page, `Testitem-${RUN_ID}`);

    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });

    const shopWidget = page.getByTestId("shopping-list-widget");
    await expect(shopWidget).toBeVisible();
    // Should show count > 0 (not "Einkaufsliste ist leer")
    const countText = await page.getByTestId("shopping-count").textContent();
    expect(countText).not.toContain("ist leer");
  });

  test("15.6 Wochenplan-Vorschau zeigt heutige Mahlzeiten", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "meal");

    // Add meal plan entry for today
    await addMealPlanViaApi(page, recipeId, "mittagessen");

    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });

    const mealWidget = page.getByTestId("meal-plan-widget");
    await expect(mealWidget).toBeVisible();
    await expect(mealWidget.getByText(`Dashboard-meal-${RUN_ID}`)).toBeVisible({ timeout: 8_000 });
    await expect(mealWidget.getByText("Mittagessen")).toBeVisible();

    // Clean up
    await page.evaluate(async (id: string) => {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    }, recipeId);
  });

  test("15.7 KI-Vorschlag ohne API-Schluessel zeigt Hinweis", async ({ page }) => {
    await loginAdmin(page);
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });

    const suggestionWidget = page.getByTestId("daily-suggestion-widget");
    await expect(suggestionWidget).toBeVisible();

    // Either shows the load button (has API key) or the no-key message
    const noKeyHint = page.getByTestId("suggestion-no-key");
    const loadButton = page.getByTestId("suggestion-load-button");
    const hasNoKey = await noKeyHint.isVisible().catch(() => false);
    const hasLoadBtn = await loadButton.isVisible().catch(() => false);

    // One of the two states must be visible
    expect(hasNoKey || hasLoadBtn).toBeTruthy();

    if (hasNoKey) {
      await expect(noKeyHint.getByText(/API-Schl/)).toBeVisible();
    }
  });

  test("15.8 Karussell scrollt horizontal", async ({ page }) => {
    await loginAdmin(page);

    // Create 5 recipes to ensure scrollability
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await createRecipeViaApi(page, `scroll-${i}`));
    }

    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("recent-recipes-carousel")).toBeVisible({ timeout: 8_000 });

    // Verify right scroll button exists and is enabled (cards overflow)
    const rightBtn = page.getByTestId("carousel-right");
    await expect(rightBtn).toBeVisible();

    // Click right to scroll
    await rightBtn.click();
    // Small wait for scroll animation
    await page.waitForTimeout(500);

    // Left button should now be enabled
    const leftBtn = page.getByTestId("carousel-left");
    await expect(leftBtn).toBeEnabled({ timeout: 2_000 });

    // Clean up
    for (const id of ids) {
      await page.evaluate(async (rid: string) => {
        await fetch(`/api/recipes/${rid}`, { method: "DELETE" });
      }, id);
    }
  });
});
