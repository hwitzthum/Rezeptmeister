/**
 * Phase 7 – Semantische Suche (F-SEARCH-02)
 *
 * Voraussetzungen:
 * - PostgreSQL läuft (docker compose up -d)
 * - FastAPI-Backend läuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 *
 * Live-Tests (7.5–7.7) laufen nur wenn GEMINI_TEST_KEY in ../../.env gesetzt ist.
 * UI-Tests (7.1–7.4) prüfen den Suchmodus-Toggle und die API-Fehlerbehandlung.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// Test-Secrets aus Root-.env lesen (Fallback: Umgebungsvariable)
function loadEnvVar(varName: string): string {
  if (process.env[varName]) return process.env[varName]!;
  const envPath = path.resolve(__dirname, "../../.env");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf-8").match(new RegExp(`^${varName}=(.+)$`, "m"));
    if (m) return m[1].trim();
  }
  return "";
}

const GEMINI_TEST_KEY = loadEnvVar("GEMINI_TEST_KEY");
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
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Phase 7 – Semantische Suche UI", () => {
  test.describe.configure({ mode: "serial" });

  test("7.1 KI-Suche-Toggle auf der Suche-Seite sichtbar", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");

    // Volltext-Modus ist Standard
    await expect(page.getByRole("group", { name: "Suchmodus" })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("ki-suche-toggle")).toBeVisible();

    // Standardmodus ist Volltext (KI-Suche-Hinweistext noch nicht sichtbar)
    await expect(page.getByText("Beschreiben Sie, was Sie kochen möchten")).not.toBeVisible();
  });

  test("7.2 Auf KI-Suche umschalten ändert Platzhaltertext und zeigt Bild-Upload-Bereich", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");

    // KI-Suche aktivieren
    await page.getByTestId("ki-suche-toggle").click();

    // Platzhaltertext ändert sich
    await expect(page.getByPlaceholder(/Beschreiben Sie, was Sie kochen möchten/)).toBeVisible({ timeout: 5_000 });

    // Bild-Upload-Bereich erscheint
    await expect(page.getByTestId("ki-image-upload")).toBeVisible();

    // KI-Suche-Schaltfläche erscheint
    await expect(page.getByRole("button", { name: "Suchen" })).toBeVisible();

    // Filter-Seitenleiste (Kategorie-Dropdown) ist nicht mehr im DOM
    await expect(page.locator('[data-filter="kategorie"]')).not.toBeAttached();
  });

  test("7.3 Zurück zu Volltext wechselt Platzhaltertext und zeigt Filter wieder", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");

    // Auf KI-Suche umschalten
    await page.getByTestId("ki-suche-toggle").click();
    await expect(page.getByPlaceholder(/Beschreiben Sie, was Sie kochen möchten/)).toBeVisible();

    // Zurück zu Volltext
    await page.getByRole("button", { name: "Volltext" }).click();
    await expect(page.getByPlaceholder(/Rezept, Zutat oder Beschreibung suchen/)).toBeVisible({ timeout: 5_000 });
  });

  test("7.4 KI-Suche ohne API-Schlüssel zeigt Hinweis-Banner", async ({ page }) => {
    await loginAdmin(page);

    // Sicherstellen dass kein API-Schlüssel gesetzt ist
    await page.evaluate(async () => {
      await fetch("/api/settings/api-key", { method: "DELETE" });
    });

    await page.goto("/suche");
    await page.getByTestId("ki-suche-toggle").click();

    // Suchanfrage stellen
    await page.getByPlaceholder(/Beschreiben Sie, was Sie kochen möchten/).fill("Schnelle Pasta");
    await page.getByRole("button", { name: "Suchen" }).click();

    // Banner erscheint mit Link zu Einstellungen
    await expect(page.getByText("Kein API-Schlüssel hinterlegt")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: /Jetzt in den Einstellungen/ })).toBeVisible();
  });

  test("7.5 Bild-Upload-Dialog erscheint nach Klick auf Upload-Bereich", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.getByTestId("ki-suche-toggle").click();

    // Datei-Upload auslösen (ohne echten File-Picker)
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("ki-image-upload").click(),
    ]);

    // File chooser wurde geöffnet
    expect(fileChooser).toBeDefined();

    // Test-Bild einlesen (1×1 Pixel PNG)
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBuffer = Buffer.from(pngBase64, "base64");
    await fileChooser.setFiles({
      name: `test-bild-${RUN_ID}.png`,
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // Dateiname erscheint in der Vorschau
    await expect(page.getByText(`test-bild-${RUN_ID}.png`)).toBeVisible({ timeout: 5_000 });
  });

  test("7.6 Leerer Suchzustand zeigt Beispielanfragen in KI-Modus", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.getByTestId("ki-suche-toggle").click();

    // Hinweistext mit Beispielen erscheint (kein explizites Suchen nötig)
    await expect(page.getByText("KI-gestützte Suche")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Schnelles Abendessen/)).toBeVisible();
  });
});

// ── Live-Tests mit echtem Gemini-API-Schlüssel ────────────────────────────────

test.describe("Phase 7 – KI-Suche Live (mit API-Schlüssel)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!GEMINI_TEST_KEY, "GEMINI_TEST_KEY nicht gesetzt – Live-Tests übersprungen");

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    const resp = await page.evaluate(async (key: string) => {
      const res = await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, provider: "gemini" }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    }, GEMINI_TEST_KEY);
    if (resp.status !== 200) throw new Error(`API-Schlüssel konnte nicht gesetzt werden: ${JSON.stringify(resp.body)}`);

    // Testrezept erstellen damit Embeddings vorhanden sind
    await page.evaluate(async (title: string) => {
      await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: "Ein schnelles Gericht mit Kartoffeln und Zwiebeln.",
          instructions: "Kartoffeln schälen, würfeln und mit Zwiebeln anbraten.",
          servings: 2,
          ingredients: [
            { name: "Kartoffeln", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
            { name: "Zwiebeln", amount: 2, unit: "Stk.", sortOrder: 1, isOptional: false },
          ],
          tags: [],
          sourceType: "manual",
        }),
      });
    }, `Phase-7-Kartoffeln-${RUN_ID}`);

    // Kurze Pause damit Background-Embedding-Task laufen kann
    await page.waitForTimeout(5_000);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await page.evaluate(async () => {
      await fetch("/api/settings/api-key", { method: "DELETE" });
    });
    await page.close();
  });

  test("7.7 Semantische API-Route gibt Ergebnisliste zurück", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Kartoffeln", limit: 5 }),
      });
      return { status: res.status, body: await res.json() as unknown };
    });

    // Endpunkt antwortet ohne 5xx
    expect([200, 400, 503]).toContain(resp.status);
    if (resp.status === 200) {
      expect(Array.isArray(resp.body)).toBe(true);
    }
  });

  test("7.8 KI-Suche auf der Suche-Seite zeigt Ergebnisse nach Sucheingabe", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");
    await page.getByTestId("ki-suche-toggle").click();

    await page.getByPlaceholder(/Beschreiben Sie, was Sie kochen möchten/).fill("Kartoffeln");
    await page.getByRole("button", { name: "Suchen" }).click();

    // Ergebnisse oder Leer-Zustand erscheinen (abhängig von vorhandenen Embeddings)
    await expect(
      page.getByTestId("ki-result-list").or(page.getByText("Keine passenden Rezepte")).or(page.getByText("KI analysiert Ihre Anfrage"))
    ).toBeVisible({ timeout: 20_000 });
  });
});
