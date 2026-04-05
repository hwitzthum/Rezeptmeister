/**
 * Phase 9 – Notizen & Bewertungen
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
    const m = fs.readFileSync(envPath, "utf-8").match(new RegExp(`^${varName}=(.+)$`, "m"));
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

// ── Hilfs-Login ───────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
}

// ── Hilfs-Rezept erstellen ────────────────────────────────────────────────────

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
            { name: "Mehl", amount: 250, unit: "g", sortOrder: 0, isOptional: false },
          ],
          tags: ["Test"],
          sourceType: "manual",
        }),
      });
      return res.json() as Promise<{ id: string }>;
    },
    { title: `Phase-9-Rezept-${RUN_ID}-${suffix}` },
  );
  return resp.id;
}

// ── Helper: navigate to recipe and wait for notes panel ─────────────────────

async function goToRecipe(page: import("@playwright/test").Page, recipeId: string) {
  await page.goto(`/rezepte/${recipeId}`);
  // Wait for the notes panel to be ready (form loaded)
  await expect(page.getByTestId("notes-panel")).toBeVisible({ timeout: 8_000 });
  await expect(page.getByTestId("note-content-input")).toBeVisible();
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Phase 9 – Notizen & Bewertungen", () => {
  // 9.1 – Notizen-Panel sichtbar auf Rezeptdetailseite
  test("9.1 Notizen-Panel auf Rezeptdetailseite sichtbar", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-1");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");
    await expect(panel.getByRole("heading", { name: /Notizen|Bewertungen/i })).toBeVisible();
    await expect(page.getByTestId("note-submit-btn")).toBeVisible();
  });

  // 9.2 – Notiz erstellen (Typ: Allgemein)
  test("9.2 Allgemeine Notiz erstellen", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-2");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");
    await page.getByTestId("note-content-input").fill("Das Rezept hat super geschmeckt!");
    await page.getByTestId("note-submit-btn").click();

    // Notiz erscheint in der Liste
    await expect(panel.getByText("Das Rezept hat super geschmeckt!")).toBeVisible({ timeout: 5_000 });
    // Allgemein-Badge sichtbar
    await expect(panel.getByText("Allgemein").first()).toBeVisible();
  });

  // 9.3 – Bewertungsnotiz mit Sternen erstellen
  test("9.3 Bewertung mit Sternen hinzufügen", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-3");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");

    // Typ auf "Bewertung" wechseln
    await page.getByLabel("Notiztyp").selectOption("bewertung");

    // Stern 4 anklicken
    await page.getByLabel("4 Sterne").click();

    await page.getByTestId("note-content-input").fill("Sehr lecker, würde ich wieder kochen.");
    await page.getByTestId("note-submit-btn").click();

    // Notiz mit Bewertungs-Badge sichtbar
    await expect(panel.getByText("Sehr lecker, würde ich wieder kochen.")).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText("Bewertung").first()).toBeVisible();
    // Sternebewertung angezeigt ("4/5")
    await expect(panel.getByText("4/5")).toBeVisible();
  });

  // 9.4 – Notiz bearbeiten (self-contained)
  test("9.4 Notiz bearbeiten", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-4");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");

    // Notiz anlegen
    await page.getByTestId("note-content-input").fill("Erste Version der Notiz.");
    await page.getByTestId("note-submit-btn").click();
    await expect(panel.getByText("Erste Version der Notiz.")).toBeVisible({ timeout: 5_000 });

    // "Bearbeiten" im notes-panel klicken (nicht den Rezept-Header-Button)
    await panel.getByRole("button", { name: /Bearbeiten/i }).first().click();

    // Textarea im Edit-Modus (erste textarea = edit-Textarea, zweite = create-Formular)
    await panel.locator("textarea").nth(0).fill("Überarbeitete Version der Notiz.");

    // Speichern – exact match vermeidet Kollision mit "Notiz speichern"
    await panel.getByRole("button", { name: "Speichern", exact: true }).click();

    // Aktualisierter Text sichtbar, alter Text weg
    await expect(panel.getByText("Überarbeitete Version der Notiz.")).toBeVisible({ timeout: 5_000 });
    await expect(panel.getByText("Erste Version der Notiz.")).not.toBeVisible();
  });

  // 9.5 – Tab-Filter funktioniert (self-contained)
  test("9.5 Tab-Filter zeigt nur Notizen des gewählten Typs", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-5");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");

    // Allgemein-Notiz erstellen
    await page.getByTestId("note-content-input").fill("Allgemeine Notiz.");
    await page.getByTestId("note-submit-btn").click();
    await expect(panel.getByText("Allgemeine Notiz.")).toBeVisible({ timeout: 5_000 });

    // Warten bis Formular zurückgesetzt (Speichern…→Notiz speichern)
    await expect(page.getByTestId("note-submit-btn")).toHaveText("Notiz speichern", { timeout: 5_000 });

    // Tipp-Notiz erstellen
    await page.getByLabel("Notiztyp").selectOption("tipp");
    await page.getByTestId("note-content-input").fill("Nützlicher Tipp.");
    await page.getByTestId("note-submit-btn").click();
    await expect(panel.getByText("Nützlicher Tipp.")).toBeVisible({ timeout: 5_000 });

    // Tab "Tipp" anklicken (within notes panel)
    await panel.getByRole("button", { name: /^Tipp/ }).click();

    // Nur die Tipp-Notiz sichtbar, Allgemein-Notiz nicht
    await expect(panel.getByText("Nützlicher Tipp.")).toBeVisible();
    await expect(panel.getByText("Allgemeine Notiz.")).not.toBeVisible();
  });

  // 9.6 – API: averageRating im Rezeptlisten-Endpunkt vorhanden
  test("9.6 API /api/recipes gibt averageRating zurück", async ({ page }) => {
    await loginAdmin(page);

    const data = await page.evaluate(async () => {
      const res = await fetch("/api/recipes?seite=1");
      return res.json() as Promise<{ recipes: { id: string; averageRating: number | null }[] }>;
    });

    expect(Array.isArray(data.recipes)).toBe(true);
    // Das Feld muss im Response-Objekt vorhanden sein (null oder Zahl)
    const first = data.recipes[0];
    if (first) {
      expect("averageRating" in first).toBe(true);
    }
  });

  // 9.7 – averageRating > 0 nach Bewertung (UI-basiert, self-contained)
  test("9.7 averageRating nach Bewertung positiv", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-7");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");

    // Bewertungs-Notiz via UI erstellen (wie in Test 9.3)
    await page.getByLabel("Notiztyp").selectOption("bewertung");
    await page.getByLabel("5 Sterne").click();
    await page.getByTestId("note-content-input").fill("Top-Bewertung.");
    await page.getByTestId("note-submit-btn").click();
    await expect(panel.getByText("Top-Bewertung.")).toBeVisible({ timeout: 5_000 });

    // Notiz-API prüfen: Rating muss 5 sein
    const notesData = await page.evaluate(
      async (id: string) => {
        const res = await fetch(`/api/notes/${id}`);
        return res.json() as Promise<{
          notes: { id: string; rating: number | null; noteType: string }[];
        }>;
      },
      recipeId,
    );
    const ratingNote = notesData.notes.find((n) => n.noteType === "bewertung");
    expect(ratingNote, "Bewertungs-Notiz muss in der DB vorhanden sein").toBeDefined();
    expect(ratingNote?.rating, "Rating muss 5 sein").toBe(5);

    // averageRating aus /api/recipes lesen
    const data = await page.evaluate(
      async (id: string) => {
        const res = await fetch("/api/recipes?seite=1&limit=50");
        const json = await res.json() as {
          recipes: { id: string; averageRating: string | number | null }[];
        };
        return json.recipes.find((r) => r.id === id) ?? null;
      },
      recipeId,
    );

    expect(data).not.toBeNull();
    expect(Number(data!.averageRating)).toBeGreaterThan(0);
  });

  // 9.8 – Notiz löschen (self-contained)
  test("9.8 Notiz löschen", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "9-8");
    await goToRecipe(page, recipeId);

    const panel = page.getByTestId("notes-panel");

    // Notiz erstellen
    await page.getByTestId("note-content-input").fill("Diese Notiz wird gelöscht.");
    await page.getByTestId("note-submit-btn").click();
    await expect(panel.getByText("Diese Notiz wird gelöscht.")).toBeVisible({ timeout: 5_000 });

    // "Löschen" innerhalb des notes-panel klicken (nicht den Rezept-Header-Button)
    await panel.getByRole("button", { name: /^Löschen$/ }).first().click();

    // Notiz verschwindet
    await expect(panel.getByText("Diese Notiz wird gelöscht.")).not.toBeVisible({ timeout: 5_000 });
  });
});
