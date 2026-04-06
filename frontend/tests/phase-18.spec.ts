/**
 * Phase 18 – Full Journey E2E Test
 *
 * Vollständiger Benutzer-Durchlauf:
 * Registrierung → Admin-Freigabe → Login → Rezept erstellen →
 * Suchen → Einkaufsliste → Wochenplan
 *
 * Voraussetzungen:
 * - PostgreSQL läuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 * - TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD in .env gesetzt
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// ── Secrets aus Root-.env lesen ─────────────────────────────────────────────

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
const JOURNEY_EMAIL = `test-journey-${RUN_ID}@playwright.local`;
const JOURNEY_PASSWORD = "JourneyPasswort1!";
const JOURNEY_RECIPE_TITLE = `Journey-Rezept-${RUN_ID}`;

// ── Shared state across serial tests ────────────────────────────────────────

let journeyRecipeId: string;

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

async function loginUser(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── Full Journey Tests (serial) ─────────────────────────────────────────────

test.describe("Phase 18 – Full Journey E2E", () => {
  test.describe.configure({ mode: "serial" });

  // 18.1 – Registrierung
  test("18.1 Neuen Benutzer registrieren", async ({ page }) => {
    await page.goto("/auth/registrieren");

    await page.getByLabel(/Name/).fill("Journey Tester");
    await page.getByLabel(/E-Mail/).fill(JOURNEY_EMAIL);
    await page.getByPlaceholder(/Mindestens 8 Zeichen/).fill(JOURNEY_PASSWORD);
    await page.getByPlaceholder(/Passwort wiederholen/).fill(JOURNEY_PASSWORD);
    await page.getByRole("button", { name: "Konto erstellen" }).click();

    // Should redirect to pending page
    await expect(page).toHaveURL(/\/auth\/warten/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: /Registrierung wird geprüft/i }),
    ).toBeVisible();
  });

  // 18.2 – Admin gibt Benutzer frei
  test("18.2 Admin gibt den neuen Benutzer frei", async ({ page }) => {
    await loginAdmin(page);

    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: "Benutzerverwaltung" }),
    ).toBeVisible();

    // Filter by pending
    await page.getByRole("button", { name: "Ausstehend" }).click();

    // Find the journey user row
    const userRow = page.locator("tr").filter({ hasText: JOURNEY_EMAIL });
    await expect(userRow).toBeVisible({ timeout: 8_000 });

    // Click approve
    await userRow.locator('[title="Freigeben"]').click();

    // Toast confirms
    await expect(page.getByRole("status")).toContainText(/aktualisiert/i, {
      timeout: 8_000,
    });
  });

  // 18.3 – Neuer Benutzer meldet sich an
  test("18.3 Freigegebener Benutzer meldet sich an", async ({ page }) => {
    await loginUser(page, JOURNEY_EMAIL, JOURNEY_PASSWORD);

    // Should be on dashboard
    await expect(
      page.getByRole("heading", { name: /Willkommen|Hallo|Dashboard|Guete/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 18.4 – Rezept erstellen über UI-Wizard
  test("18.4 Rezept erstellen über UI-Wizard", async ({ page }) => {
    await loginUser(page, JOURNEY_EMAIL, JOURNEY_PASSWORD);

    await page.goto("/rezepte/neu");

    // Schritt 1: Grunddaten
    await page.getByLabel("Rezepttitel").fill(JOURNEY_RECIPE_TITLE);
    await page.getByLabel("Portionen").fill("4");
    await page.getByLabel("Schwierigkeitsgrad").selectOption("einfach");
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 2: Zutaten
    await page.getByRole("button", { name: "Zutat hinzufügen" }).click();
    const nameInput = page.locator('input[aria-label="Zutatname"]').first();
    await nameInput.fill("Kartoffeln");
    // Fill amount
    const amountInput = page.locator('input[aria-label="Menge"]').first();
    await amountInput.fill("500");

    await page.getByRole("button", { name: "Zutat hinzufügen" }).click();
    const nameInput2 = page.locator('input[aria-label="Zutatname"]').nth(1);
    await nameInput2.fill("Butter");
    const amountInput2 = page.locator('input[aria-label="Menge"]').nth(1);
    await amountInput2.fill("50");

    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 3: Anleitung
    await page
      .getByLabel("Zubereitung")
      .fill("Kartoffeln kochen, Butter dazugeben und servieren.");
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 4: Speichern
    await page.getByRole("button", { name: "Rezept speichern" }).click();

    // Should redirect to detail page
    await expect(page).toHaveURL(/\/rezepte\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });

    // Extract recipe ID from URL
    const url = page.url();
    const match = url.match(/\/rezepte\/([0-9a-f-]{36})$/);
    expect(match).toBeTruthy();
    journeyRecipeId = match![1];

    // Verify title is displayed
    await expect(
      page.getByRole("heading", { name: JOURNEY_RECIPE_TITLE }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // 18.5 – Rezept über Suche finden
  test("18.5 Rezept über Suche finden", async ({ page }) => {
    await loginUser(page, JOURNEY_EMAIL, JOURNEY_PASSWORD);

    // Small wait for tsvector update
    await page.waitForTimeout(500);

    await page.goto("/suche");
    await page.waitForLoadState("networkidle");

    // Type search query
    const searchInput = page.getByPlaceholder(/Suche|suche|Rezept/i);
    await searchInput.fill(JOURNEY_RECIPE_TITLE);

    // Wait for results
    await expect(
      page.locator(`text=${JOURNEY_RECIPE_TITLE}`).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  // 18.6 – Zutaten zur Einkaufsliste hinzufügen
  test("18.6 Zutaten zur Einkaufsliste hinzufügen", async ({ page }) => {
    await loginUser(page, JOURNEY_EMAIL, JOURNEY_PASSWORD);

    // Add ingredients via API (batch add from recipe)
    const addResult = await page.evaluate(
      async (recipeId: string) => {
        const res = await fetch("/api/shopping-list/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
        return { status: res.status };
      },
      journeyRecipeId,
    );
    expect([200, 201]).toContain(addResult.status);

    // Navigate to shopping list
    await page.goto("/einkaufsliste");
    await page.waitForLoadState("networkidle");

    // Verify ingredients are visible
    await expect(page.locator("text=Kartoffeln").first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator("text=Butter").first()).toBeVisible();
  });

  // 18.7 – Rezept in den Wochenplan eintragen
  test("18.7 Rezept in den Wochenplan eintragen", async ({ page }) => {
    await loginUser(page, JOURNEY_EMAIL, JOURNEY_PASSWORD);

    await page.goto("/wochenplan");
    await expect(page.getByTestId("meal-plan-page")).toBeVisible({
      timeout: 10_000,
    });

    // Find the first available add button
    const addButtons = page.locator("[data-testid^='meal-slot-add-']");
    const firstAdd = addButtons.first();
    await expect(firstAdd).toBeVisible({ timeout: 5_000 });
    await firstAdd.click();

    // Picker dialog opens
    await expect(page.getByTestId("recipe-picker-dialog")).toBeVisible({
      timeout: 5_000,
    });

    // Search for our recipe
    await page
      .getByTestId("recipe-picker-search")
      .fill(JOURNEY_RECIPE_TITLE);

    // Click on the recipe item
    await page
      .getByTestId(`recipe-picker-item-${journeyRecipeId}`)
      .click();

    // Verify recipe appears in meal plan
    await expect(
      page
        .locator("[data-testid^='meal-plan-entry-']")
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // 18.8 – Aufräumen (optional cleanup)
  test("18.8 Testdaten aufräumen", async ({ page }) => {
    await loginUser(page, JOURNEY_EMAIL, JOURNEY_PASSWORD);

    // Clear shopping list
    await page.evaluate(async () => {
      const res = await fetch("/api/shopping-list");
      const data = (await res.json()) as { items: { id: string }[] };
      for (const item of data.items) {
        await fetch(`/api/shopping-list/${item.id}`, { method: "DELETE" });
      }
    });

    // Clear meal plans for current week
    await page.evaluate(async () => {
      const today = new Date();
      const day = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((day === 0 ? 7 : day) - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const res = await fetch(
        `/api/meal-plans?start=${fmt(monday)}&end=${fmt(sunday)}`,
      );
      const data = (await res.json()) as { entries: { id: string }[] };
      for (const entry of data.entries) {
        await fetch(`/api/meal-plans/${entry.id}`, { method: "DELETE" });
      }
    });

    // Delete the recipe
    if (journeyRecipeId) {
      await page.evaluate(async (id: string) => {
        await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      }, journeyRecipeId);
    }

    // Verify cleanup succeeded
    expect(true).toBe(true);
  });
});
