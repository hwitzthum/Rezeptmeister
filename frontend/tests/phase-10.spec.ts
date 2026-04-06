/**
 * Phase 10 -- Einkaufsliste (Shopping List)
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
    const m = fs.readFileSync(envPath, "utf-8").match(new RegExp(`^${varName}=(.+)$`, "m"));
    if (m) return m[1].trim();
  }
  return "";
}

const ADMIN_EMAIL = loadEnvVar("TEST_ADMIN_EMAIL");
const ADMIN_PASSWORD = loadEnvVar("TEST_ADMIN_PASSWORD");

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD muessen in .env oder als Umgebungsvariablen gesetzt sein.",
  );
}

const RUN_ID = Date.now().toString(36);

// -- Hilfs-Login ----------------------------------------------------------

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// -- Hilfs-Rezept erstellen -----------------------------------------------

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
            { name: "Mehl", amount: 300, unit: "g", sortOrder: 0, isOptional: false },
            { name: "Milch", amount: 5, unit: "dl", sortOrder: 1, isOptional: false },
            { name: "Eier", amount: 3, unit: "Stk.", sortOrder: 2, isOptional: false },
          ],
          tags: ["Test"],
          sourceType: "manual",
        }),
      });
      return res.json() as Promise<{ id: string }>;
    },
    { title: `Phase-10-Rezept-${RUN_ID}-${suffix}` },
  );
  return resp.id;
}

// -- Hilfs-Cleanup: alle Items dieses Users loeschen ----------------------

async function clearShoppingList(page: import("@playwright/test").Page) {
  // Check all, then clear checked
  await page.evaluate(async () => {
    await fetch("/api/shopping-list/batch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check-all" }),
    });
    await fetch("/api/shopping-list/batch", { method: "DELETE" });
  });
}

// -- Tests ----------------------------------------------------------------

test.describe("Phase 10 -- Einkaufsliste", () => {
  // 10.1 -- Page sichtbar
  test("10.1 Einkaufsliste-Seite sichtbar", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/einkaufsliste");
    await expect(page.getByTestId("shopping-list-page")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("heading", { name: /Einkaufsliste/i })).toBeVisible();
  });

  // 10.2 -- Manueller Eintrag
  test("10.2 Manueller Eintrag hinzufuegen", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);
    await page.goto("/einkaufsliste");
    await expect(page.getByTestId("shopping-list-add-form")).toBeVisible({ timeout: 8_000 });

    await page.getByTestId("shopping-list-ingredient-input").fill(`Tomaten-${RUN_ID}`);
    await page.getByTestId("shopping-list-amount-input").fill("500");
    await page.getByTestId("shopping-list-unit-select").selectOption("g");
    await page.getByTestId("shopping-list-add-button").click();

    // Item appears
    await expect(page.getByText(`Tomaten-${RUN_ID}`)).toBeVisible({ timeout: 5_000 });
  });

  // 10.3 -- Item abhaken
  test("10.3 Item abhaken", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);

    // Add item via API
    const itemData = await page.evaluate(
      async (name: string) => {
        const res = await fetch("/api/shopping-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredientName: name, amount: 1, unit: "kg" }),
        });
        return res.json() as Promise<{ id: string }>;
      },
      `Check-Test-${RUN_ID}`,
    );

    await page.goto("/einkaufsliste");
    const checkbox = page.getByTestId(`shopping-list-checkbox-${itemData.id}`);
    await expect(checkbox).toBeVisible({ timeout: 8_000 });

    // Click to check
    await checkbox.click();
    await expect(checkbox).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });
  });

  // 10.4 -- Item loeschen
  test("10.4 Item loeschen", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);

    // Add item via API
    const itemData = await page.evaluate(
      async (name: string) => {
        const res = await fetch("/api/shopping-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredientName: name }),
        });
        return res.json() as Promise<{ id: string }>;
      },
      `Delete-Test-${RUN_ID}`,
    );

    await page.goto("/einkaufsliste");
    const deleteBtn = page.getByTestId(`shopping-list-delete-${itemData.id}`);
    await expect(deleteBtn).toBeVisible({ timeout: 8_000 });

    await deleteBtn.click();
    await expect(page.getByText(`Delete-Test-${RUN_ID}`)).not.toBeVisible({ timeout: 5_000 });
  });

  // 10.5 -- Batch-Add von Rezept
  test("10.5 Batch-Add von Rezept", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);
    const recipeId = await createRecipeViaApi(page, "10-5");

    // Batch add via API
    const result = await page.evaluate(
      async (id: string) => {
        const res = await fetch("/api/shopping-list/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId: id }),
        });
        return res.json() as Promise<{ added: number; merged: number; total: number }>;
      },
      recipeId,
    );

    expect(result.added).toBe(3);

    // Verify on page
    await page.goto("/einkaufsliste");
    await expect(page.getByText("g Mehl")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("dl Milch")).toBeVisible();
    await expect(page.getByText("Eier")).toBeVisible();
  });

  // 10.6 -- Duplikate zusammenfuehren
  test("10.6 Duplikate zusammenfuehren", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);

    // Manually add "Mehl 250g"
    await page.evaluate(async () => {
      await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName: "Mehl", amount: 250, unit: "g" }),
      });
    });

    // Create recipe with "Mehl 300g"
    const recipeId = await createRecipeViaApi(page, "10-6");

    // Batch add -- should merge Mehl (250+300=550), add Milch + Eier
    const result = await page.evaluate(
      async (id: string) => {
        const res = await fetch("/api/shopping-list/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId: id }),
        });
        return res.json() as Promise<{ added: number; merged: number; total: number }>;
      },
      recipeId,
    );

    expect(result.merged).toBeGreaterThanOrEqual(1);

    // Verify merged amount on page
    await page.goto("/einkaufsliste");
    await expect(page.getByTestId("shopping-list-page")).toBeVisible({ timeout: 8_000 });

    // Find the Mehl item and check the amount is 550
    await expect(page.getByText("550")).toBeVisible({ timeout: 5_000 });
  });

  // 10.7 -- Alle abhaken / Zuruecksetzen
  test("10.7 Alle abhaken und zuruecksetzen", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);

    // Add two items
    await page.evaluate(async () => {
      await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName: "Zucker", amount: 200, unit: "g" }),
      });
      await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName: "Salz", amount: 10, unit: "g" }),
      });
    });

    await page.goto("/einkaufsliste");
    await expect(page.getByText("Zucker")).toBeVisible({ timeout: 8_000 });

    // Click "Alle abhaken"
    await page.getByRole("button", { name: /Alle abhaken/i }).click();

    // Wait for all checkboxes to be checked
    const checkboxes = page.locator('[role="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });
    }

    // Click "Zuruecksetzen"
    await page.getByRole("button", { name: /cksetzen/i }).click();

    // All should be unchecked
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toHaveAttribute("aria-checked", "false", { timeout: 3_000 });
    }
  });

  // 10.8 -- Erledigte loeschen
  test("10.8 Erledigte loeschen", async ({ page }) => {
    await loginAdmin(page);
    await clearShoppingList(page);

    // Add two items via API
    const items = await page.evaluate(async () => {
      const r1 = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName: "Bleibt", amount: 1, unit: "Stk." }),
      });
      const r2 = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredientName: "WirdGeloescht", amount: 1, unit: "Stk." }),
      });
      return {
        keep: (await r1.json()) as { id: string },
        remove: (await r2.json()) as { id: string },
      };
    });

    await page.goto("/einkaufsliste");
    await expect(page.getByText("WirdGeloescht")).toBeVisible({ timeout: 8_000 });

    // Check the item to be removed
    await page.getByTestId(`shopping-list-checkbox-${items.remove.id}`).click();
    await expect(
      page.getByTestId(`shopping-list-checkbox-${items.remove.id}`),
    ).toHaveAttribute("aria-checked", "true", { timeout: 3_000 });

    // Click "Erledigte loeschen"
    await page.getByRole("button", { name: /Erledigte/i }).click();

    // "WirdGeloescht" should be gone, "Bleibt" should remain
    await expect(page.getByText("WirdGeloescht")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Bleibt")).toBeVisible();
  });
});
