/**
 * Phase 14 -- Einheitenumrechner (F-CONV-01)
 *
 * Voraussetzungen:
 * - PostgreSQL laeuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
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

// ── Hilfs-Login ──────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
}

test.describe("Phase 14 -- Einheitenumrechner", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD muessen gesetzt sein");
    await loginAdmin(page);
    await page.goto("/werkzeuge");
    await expect(page.getByRole("heading", { name: /Einheitenumrechner/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("14.1 Seite lädt mit Überschrift und Konverter", async ({ page }) => {
    await expect(page.getByTestId("converter-amount-input")).toBeVisible();
    await expect(page.getByTestId("converter-from-unit")).toBeVisible();
    await expect(page.getByTestId("converter-to-unit")).toBeVisible();
    await expect(page.getByTestId("converter-result")).toBeVisible();
    await expect(page.getByTestId("converter-swap-button")).toBeVisible();
  });

  test("14.2 Volumen: 1 Cup → ~2.37 dl", async ({ page }) => {
    // Default category is Volumen, default pair is cup → dl
    await page.getByTestId("converter-amount-input").fill("1");
    const result = page.getByTestId("converter-result");
    await expect(result).toContainText("2.37");
    await expect(result).toContainText("dl");
  });

  test("14.3 Gewicht: 1 lb → ~454 g", async ({ page }) => {
    await page.getByTestId("converter-category-gewicht").click();
    await page.getByTestId("converter-from-unit").selectOption("lb");
    await page.getByTestId("converter-to-unit").selectOption("g");
    await page.getByTestId("converter-amount-input").fill("1");

    const result = page.getByTestId("converter-result");
    await expect(result).toContainText("454");
    await expect(result).toContainText("g");
  });

  test("14.4 Temperatur: 350 °F → 177 °C", async ({ page }) => {
    await page.getByTestId("converter-category-temperatur").click();
    await page.getByTestId("converter-amount-input").fill("350");

    const result = page.getByTestId("converter-result");
    await expect(result).toContainText("177");
    await expect(result).toContainText("°C");
  });

  test("14.5 Zutatenbewusst: 2 Cups Mehl → 250 g", async ({ page }) => {
    // Switch from-unit to cup, to-unit to g (cross volume→weight)
    await page.getByTestId("converter-from-unit").selectOption("cup");
    await page.getByTestId("converter-to-unit").selectOption("g");

    // Ingredient selector should now be visible
    const ingredientSelect = page.getByTestId("converter-ingredient-select");
    await expect(ingredientSelect).toBeVisible({ timeout: 3_000 });

    // Select Mehl
    await ingredientSelect.selectOption("mehl");

    // Enter 2 cups
    await page.getByTestId("converter-amount-input").fill("2");

    const result = page.getByTestId("converter-result");
    await expect(result).toContainText("250");
    await expect(result).toContainText("g");
  });

  test("14.6 Tausch-Button vertauscht Einheiten", async ({ page }) => {
    // Start: cup → dl with amount 1
    await page.getByTestId("converter-amount-input").fill("1");
    await expect(page.getByTestId("converter-result")).toContainText("2.37");

    // Swap
    await page.getByTestId("converter-swap-button").click();

    // Now: dl → cup, 1 dl should give ~0.42 cups
    const fromUnit = page.getByTestId("converter-from-unit");
    const toUnit = page.getByTestId("converter-to-unit");
    await expect(fromUnit).toHaveValue("dl");
    await expect(toUnit).toHaveValue("cup");

    const result = page.getByTestId("converter-result");
    await expect(result).toContainText("Cup");
  });

  test("14.7 Andere Zutat ändert Ergebnis (Zucker vs Mehl)", async ({ page }) => {
    // Set up cross-category conversion: cup → g
    await page.getByTestId("converter-from-unit").selectOption("cup");
    await page.getByTestId("converter-to-unit").selectOption("g");
    await page.getByTestId("converter-amount-input").fill("1");

    const ingredientSelect = page.getByTestId("converter-ingredient-select");
    await expect(ingredientSelect).toBeVisible({ timeout: 3_000 });

    // Mehl: 1 cup = 125 g
    await ingredientSelect.selectOption("mehl");
    await expect(page.getByTestId("converter-result")).toContainText("125");

    // Zucker: 1 cup = 200 g
    await ingredientSelect.selectOption("zucker");
    await expect(page.getByTestId("converter-result")).toContainText("200");
  });
});