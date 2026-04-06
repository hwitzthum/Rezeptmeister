/**
 * Phase 13 -- Kochmodus & Drucken / PDF-Export
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

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error(
    "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD muessen in .env oder als Umgebungsvariablen gesetzt sein.",
  );
}

const RUN_ID = Date.now().toString(36);

// ── Hilfs-Login ──────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── Hilfs-Rezept erstellen (mit nummerierten Schritten und Zeitangaben) ─────

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
          instructions: [
            "1. Zwiebeln fein hacken und in Olivenoel anbraten.",
            "2. Tomaten hinzufuegen und 20 Minuten koecheln lassen.",
            "3. Mit Salz und Pfeffer abschmecken.",
            "4. Pasta al dente kochen (8-10 Minuten).",
            "5. Alles zusammen servieren.",
          ].join("\n"),
          servings: 4,
          prepTimeMinutes: 15,
          cookTimeMinutes: 30,
          totalTimeMinutes: 45,
          difficulty: "mittel",
          category: "Hauptgericht",
          ingredients: [
            { name: "Zwiebeln", amount: 2, unit: "Stk.", sortOrder: 0, isOptional: false },
            { name: "Tomaten", amount: 400, unit: "g", sortOrder: 1, isOptional: false },
            { name: "Olivenoel", amount: 3, unit: "EL", sortOrder: 2, isOptional: false },
            { name: "Pasta", amount: 500, unit: "g", sortOrder: 3, isOptional: false },
            { name: "Parmesan", amount: 50, unit: "g", sortOrder: 4, isOptional: true },
          ],
          tags: ["Test", "Phase-13"],
          sourceType: "manual",
        }),
      });
      return res.json() as Promise<{ id: string }>;
    },
    { title: `Phase-13-Rezept-${RUN_ID}-${suffix}` },
  );
  return resp.id;
}

// =============================================================================
// 13.1 Kochmodus
// =============================================================================

test.describe("13.1 Kochmodus", () => {
  test("13.1a Kochmodus-Button sichtbar und startet Kochmodus", async ({
    page,
  }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "cook-a");

    await page.goto(`/rezepte/${recipeId}`);
    await expect(page.getByTestId("cooking-mode-button")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByTestId("cooking-mode-button").click();
    await expect(page.getByTestId("cooking-mode")).toBeVisible({
      timeout: 8_000,
    });

    // Erster Schritt sichtbar
    await expect(page.getByTestId("step-counter")).toContainText(
      "Schritt 1 von 5",
    );
    await expect(page.getByTestId("step-text")).toContainText("Zwiebeln");
  });

  test("13.1b Steps durchnavigieren (Weiter/Zurueck)", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "cook-b");

    await page.goto(`/rezepte/${recipeId}/kochmodus`);
    await expect(page.getByTestId("cooking-mode")).toBeVisible({
      timeout: 8_000,
    });

    // Schritt 1
    await expect(page.getByTestId("step-counter")).toContainText(
      "Schritt 1 von 5",
    );

    // Weiter klicken
    await page.getByTestId("next-step").click();
    await expect(page.getByTestId("step-counter")).toContainText(
      "Schritt 2 von 5",
    );
    await expect(page.getByTestId("step-text")).toContainText("Tomaten");

    // Noch weiter
    await page.getByTestId("next-step").click();
    await expect(page.getByTestId("step-counter")).toContainText(
      "Schritt 3 von 5",
    );

    // Zurueck klicken
    await page.getByTestId("prev-step").click();
    await expect(page.getByTestId("step-counter")).toContainText(
      "Schritt 2 von 5",
    );
  });

  test("13.1c Zutatenliste als Overlay", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "cook-c");

    await page.goto(`/rezepte/${recipeId}/kochmodus`);
    await expect(page.getByTestId("cooking-mode")).toBeVisible({
      timeout: 8_000,
    });

    // Overlay oeffnen
    await page.getByTestId("show-ingredients-button").click();
    await expect(page.getByTestId("ingredients-overlay")).toBeVisible({
      timeout: 5_000,
    });

    // Zutaten sichtbar
    await expect(page.getByTestId("ingredients-overlay")).toContainText(
      "Zwiebeln",
    );
    await expect(page.getByTestId("ingredients-overlay")).toContainText(
      "Pasta",
    );

    // Overlay schliessen
    await page.getByTestId("close-ingredients").click();
    await expect(page.getByTestId("ingredients-overlay")).not.toBeVisible();
  });

  test("13.1d Timer-Erkennung bei Zeitangabe", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "cook-d");

    await page.goto(`/rezepte/${recipeId}/kochmodus`);
    await expect(page.getByTestId("cooking-mode")).toBeVisible({
      timeout: 8_000,
    });

    // Zum Schritt mit Zeitangabe navigieren (Schritt 2: "20 Minuten")
    await page.getByTestId("next-step").click();
    await expect(page.getByTestId("step-counter")).toContainText(
      "Schritt 2 von 5",
    );

    // Timer-Button sichtbar
    await expect(page.getByTestId("timer-button-1-0")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("13.1e Kochmodus beenden", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "cook-e");

    await page.goto(`/rezepte/${recipeId}/kochmodus`);
    await expect(page.getByTestId("cooking-mode")).toBeVisible({
      timeout: 8_000,
    });

    // Beenden klicken
    await page.getByTestId("exit-cooking-mode").click();
    await expect(page).toHaveURL(new RegExp(`/rezepte/${recipeId}`), {
      timeout: 8_000,
    });

    // Nicht mehr im Kochmodus
    await expect(page.getByTestId("cooking-mode")).not.toBeVisible();
  });
});

// =============================================================================
// 13.2 Drucken & PDF-Export
// =============================================================================

test.describe("13.2 Drucken & PDF-Export", () => {
  test("13.2a Druck-Button oeffnet Modal mit Optionen", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "print-a");

    await page.goto(`/rezepte/${recipeId}`);
    await expect(page.getByTestId("print-button")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByTestId("print-button").click();

    // Modal sichtbar
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Drucken & PDF-Export")).toBeVisible();

    // Optionen sichtbar
    await expect(page.getByTestId("include-image-toggle")).toBeVisible();
    await expect(page.getByTestId("print-servings-display")).toBeVisible();

    // Vorschau ist im scrollbaren Container innerhalb des Dialogs
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByTestId("printable-recipe"),
    ).toBeAttached();
  });

  test("13.2b Bild-Option umschalten", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "print-b");

    await page.goto(`/rezepte/${recipeId}`);
    await page.getByTestId("print-button").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Checkbox "Bild einschliessen" standardmaessig an
    const checkbox = page
      .getByTestId("include-image-toggle")
      .locator("input[type=checkbox]");
    await expect(checkbox).toBeChecked();

    // Umschalten
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });

  test("13.2c Portionsgroesse im Druckdialog aendern", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "print-c");

    await page.goto(`/rezepte/${recipeId}`);
    await page.getByTestId("print-button").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    // Standard: 4 Portionen
    await expect(page.getByTestId("print-servings-display")).toContainText("4");

    // Erhoehen
    await page
      .getByRole("dialog")
      .getByLabel("Portionen erhöhen")
      .click();
    await expect(page.getByTestId("print-servings-display")).toContainText("5");
  });

  test("13.2d PDF-Download ausloesen", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "print-d");

    await page.goto(`/rezepte/${recipeId}`);
    await page.getByTestId("print-button").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

    const pdfBtn = page.getByTestId("pdf-download");
    await expect(pdfBtn).toBeEnabled();
    await expect(pdfBtn).toContainText("Als PDF speichern");

    // Klick auf PDF-Download — verifizieren, dass der Generierungsprozess
    // startet (Button-Text wechselt zu "Wird erstellt…") und abschliesst
    await pdfBtn.click();
    await expect(pdfBtn).toContainText("Wird erstellt", { timeout: 5_000 });

    // Warten bis die Generierung abgeschlossen ist (Button kehrt zurueck)
    await expect(pdfBtn).toContainText("Als PDF speichern", {
      timeout: 60_000,
    });
  });
});
