/**
 * Phase 8 – KI-Vorschläge, URL-Import, Nährwerte & Bild-Generierung
 *
 * Voraussetzungen:
 * - PostgreSQL läuft (docker compose up -d)
 * - FastAPI-Backend läuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 *
 * Live-Tests (8.7–8.13) laufen nur wenn GEMINI_TEST_KEY in ../../.env gesetzt ist.
 * UI-Tests (8.1–8.6) prüfen Seitenstruktur und Komponentensichtbarkeit.
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
  await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
}

// ── Hilfs-Rezept-Erstellen ────────────────────────────────────────────────────

async function createRecipeViaApi(page: import("@playwright/test").Page): Promise<string> {
  const resp = await page.evaluate(async (title: string) => {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        instructions: "Kartoffeln schälen, würfeln und mit Butter anbraten. Mit Salz abschmecken.",
        servings: 4,
        ingredients: [
          { name: "Kartoffeln", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
          { name: "Butter", amount: 50, unit: "g", sortOrder: 1, isOptional: false },
          { name: "Zwiebeln", amount: 100, unit: "g", sortOrder: 2, isOptional: false },
          { name: "Salz", amount: 5, unit: "g", sortOrder: 3, isOptional: false },
        ],
        tags: ["Schweizer Küche", "Hauptgericht"],
        sourceType: "manual",
      }),
    });
    return res.json() as Promise<{ id: string }>;
  }, `Phase-8-Rezept-${RUN_ID}`);
  return resp.id;
}

// ── UI-Tests (kein API-Schlüssel nötig) ──────────────────────────────────────

test.describe("Phase 8 – Vorschläge & KI-Features UI", () => {
  test.describe.configure({ mode: "serial" });

  test("8.1 /vorschlaege-Seite lädt mit Überschrift und Formular", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/vorschlaege");

    // Überschrift der Seite sichtbar
    await expect(
      page.getByRole("heading", { name: /Rezeptvorschläge|Vorschläge/i }),
    ).toBeVisible({ timeout: 8_000 });

    // Mindestens ein Eingabefeld oder Schaltfläche im Formular vorhanden
    await expect(
      page.getByRole("button", { name: /Vorschläge generieren/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("8.2 /suche-Seite hat Web-Tab", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/suche");

    // Web-Tab in der Tab-Leiste sichtbar (Button enthält ggf. auch Emoji-Child)
    await expect(
      page.getByRole("tab", { name: /Web/i })
        .or(page.getByRole("button", { name: /Web/i })),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("8.3 Sidebar enthält Link zu /vorschlaege", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/rezepte");

    // Link mit href="/vorschlaege" oder Text "Vorschläge" in der Sidebar
    await expect(
      page.getByRole("link", { name: /Vorschläge/i }),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("8.4 URL-Import-Dialog öffnet sich nach Klick auf Schaltfläche in Sidebar", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/rezepte");

    // "URL importieren"-Schaltfläche in Sidebar anklicken
    await page.getByRole("button", { name: /URL importieren/i }).click();

    // Modal/Dialog mit Eingabefeld erscheint
    await expect(
      page.getByRole("dialog").or(page.locator("[role='dialog']")),
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.getByPlaceholder(/URL|https?:\/\//i)
        .or(page.locator("input[type='url']"))
        .or(page.locator("input[type='text']").first()),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("8.5 Skalierungshinweise erscheinen nicht bei normaler Skalierung (Faktor 1)", async ({ page }) => {
    await loginAdmin(page);

    // Testrezept erstellen
    const recipeId = await createRecipeViaApi(page);
    await page.goto(`/rezepte/${recipeId}`);

    // Bei Standardportionen (Faktor 1) kein Skalierungshinweis-Panel sichtbar
    await expect(page.getByTestId("scaling-hints-panel")).not.toBeVisible({ timeout: 5_000 });
    // Alternativ: Panel nicht im DOM
    const hintsPanel = page.locator("[data-testid='scaling-hints-panel']");
    const count = await hintsPanel.count();
    if (count > 0) {
      await expect(hintsPanel).not.toBeVisible();
    }
  });

  test("8.6 NutritionPanel zeigt 'Berechnen'-Schaltfläche auf Rezept-Detailseite", async ({ page }) => {
    await loginAdmin(page);

    // Testrezept erstellen
    const recipeId = await createRecipeViaApi(page);
    await page.goto(`/rezepte/${recipeId}`);

    // Nährwerte-Berechnen-Schaltfläche sichtbar
    await expect(
      page.getByRole("button", { name: /Berechnen|Nährwerte berechnen|Nährwerte/i }),
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Live-Tests mit echtem Gemini-API-Schlüssel ────────────────────────────────

test.describe("Phase 8 – KI-Features Live (mit API-Schlüssel)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!GEMINI_TEST_KEY, "GEMINI_TEST_KEY nicht gesetzt – Live-Tests übersprungen");

  let testRecipeId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);

    // Gemini-API-Schlüssel setzen
    const resp = await page.evaluate(async (key: string) => {
      const res = await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, provider: "gemini" }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    }, GEMINI_TEST_KEY);
    if (resp.status !== 200) {
      throw new Error(`API-Schlüssel konnte nicht gesetzt werden: ${JSON.stringify(resp.body)}`);
    }

    // Testrezept erstellen (für Bild-Generierungs- und Nährwerte-Tests)
    const recipeResp = await page.evaluate(async (title: string) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          instructions: "Kartoffeln schälen, würfeln und mit Butter anbraten. Mit Salz abschmecken.",
          servings: 4,
          ingredients: [
            { name: "Kartoffeln", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
            { name: "Butter", amount: 50, unit: "g", sortOrder: 1, isOptional: false },
            { name: "Zwiebeln", amount: 100, unit: "g", sortOrder: 2, isOptional: false },
            { name: "Salz", amount: 5, unit: "g", sortOrder: 3, isOptional: false },
          ],
          tags: ["Schweizer Küche"],
          sourceType: "manual",
        }),
      });
      return res.json() as Promise<{ id: string }>;
    }, `Phase-8-Live-${RUN_ID}`);

    testRecipeId = recipeResp.id;

    // Kurze Pause damit Background-Tasks laufen können
    await page.waitForTimeout(3_000);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);

    // Testrezept entfernen
    if (testRecipeId) {
      await page.evaluate(async (id: string) => {
        await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      }, testRecipeId);
    }

    // API-Schlüssel entfernen (kein Datenleck in DB)
    await page.evaluate(async () => {
      await fetch("/api/settings/api-key", { method: "DELETE" });
    });

    await page.close();
  });

  test("8.7 Rezeptvorschläge werden generiert", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: ["Kartoffeln", "Speck", "Zwiebeln"],
          cuisine: "Schweizer",
          time_budget_minutes: 45,
          dietary: [],
          season: "",
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("suggestions");
    expect(Array.isArray(resp.body.suggestions)).toBe(true);
    expect((resp.body.suggestions as unknown[]).length).toBeGreaterThanOrEqual(1);

    const first = (resp.body.suggestions as Record<string, unknown>[])[0];
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("description");
  }, 60_000);

  test("8.8 Vollständiges Rezept aus Vorschlag generieren", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestion_title: "Rösti mit Spiegelei",
          suggestion_description: "Klassische Schweizer Rösti mit knuspriger Kruste",
          servings: 4,
          cuisine: "Schweizer",
          dietary: [],
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("title");
    expect(resp.body).toHaveProperty("ingredients");
    expect(Array.isArray(resp.body.ingredients)).toBe(true);
    expect((resp.body.ingredients as unknown[]).length).toBeGreaterThan(0);
    expect(resp.body).toHaveProperty("instructions");
  }, 60_000);

  test("8.9 Nährwerte werden berechnet", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: [
            { name: "Kartoffeln", amount: 500, unit: "g" },
            { name: "Butter", amount: 50, unit: "g" },
            { name: "Zwiebeln", amount: 100, unit: "g" },
          ],
          servings: 4,
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("per_serving");

    const perServing = resp.body.per_serving as Record<string, number>;
    expect(perServing.kcal).toBeGreaterThan(0);

    expect(resp.body).toHaveProperty("label");
    expect(String(resp.body.label)).toMatch(/ca\. \d+ kcal/);
  }, 60_000);

  test("8.10 Nährwerte werden auf Rezept gespeichert", async ({ page }) => {
    await loginAdmin(page);
    expect(testRecipeId).toBeTruthy();

    const resp = await page.evaluate(async (id: string) => {
      // Einfache Nährwert-Nutzlast für PATCH
      const res = await fetch(`/api/recipes/${id}/nutrition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nutritionInfo: {
            kcal: 250, protein_g: 4, fat_g: 8, carbs_g: 38, fiber_g: 3,
            confidence: "ca.", label: "ca. 250 kcal",
          },
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    }, testRecipeId);

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("success", true);
  }, 30_000);

  test("8.11 Skalierungshinweise bei starker Skalierung (Faktor >2)", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/scale-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: [
            { name: "Mehl", amount: 200, unit: "g" },
            { name: "Zucker", amount: 100, unit: "g" },
            { name: "Zimt", amount: 5, unit: "g" },
          ],
          instructions: "Mehl und Zucker mischen. Zimt dazugeben. Bei 180°C 30 Minuten backen.",
          original_servings: 4,
          target_servings: 20,
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("hints");
    expect(Array.isArray(resp.body.hints)).toBe(true);
    expect((resp.body.hints as unknown[]).length).toBeGreaterThan(0);
    expect(resp.body).toHaveProperty("factor");
    expect(Number(resp.body.factor)).toBeCloseTo(5, 0);
    expect(resp.body).toHaveProperty("scaled_ingredients");
  }, 60_000);

  test("8.12 Rezept von URL importieren", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://www.gutekueche.ch/rosti-rezept-46",
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("title");
    expect(String(resp.body.title).length).toBeGreaterThan(0);
    expect(resp.body).toHaveProperty("ingredients");
  }, 60_000);

  test("8.13 Websuche nach Rezepten liefert Ergebnisliste", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/search-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Zürcher Geschnetzeltes" }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("results");
    expect(Array.isArray(resp.body.results)).toBe(true);
    expect((resp.body.results as unknown[]).length).toBeGreaterThan(0);

    const first = (resp.body.results as Record<string, unknown>[])[0];
    expect(first).toHaveProperty("url");
    expect(first).toHaveProperty("title");
  }, 60_000);

  test("8.14 KI-Bild für Rezept generieren", async ({ page }) => {
    await loginAdmin(page);
    expect(testRecipeId).toBeTruthy();

    const resp = await page.evaluate(async (id: string) => {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipe_id: id,
          title: "Rösti",
          ingredients: ["Kartoffeln", "Butter", "Salz"],
          category: "Hauptgericht",
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    }, testRecipeId);

    expect(resp.status).toBe(200);
    expect(resp.body).toHaveProperty("image_id");
    expect(resp.body).toHaveProperty("thumbnail_url");
  }, 120_000);

  // ── UI-driven tests for the three flows the audit found broken ────────────────

  test("8.15 Vorschläge: vollständige Speicher-Kette über UI (sourceType korrekt)", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdmin(page);
    await page.goto("/vorschlaege");

    // Zutat hinzufügen
    const ingredientInput = page.locator("input[placeholder*='Zutat']");
    await expect(ingredientInput).toBeVisible({ timeout: 8_000 });
    await ingredientInput.fill("Kartoffeln");
    await ingredientInput.press("Enter");

    // Vorschläge generieren
    await page.getByRole("button", { name: /Vorschläge generieren/i }).click();

    // Auf ersten Vorschlag-Karte warten (KI-Aufruf kann bis zu 60s dauern)
    const firstCard = page.locator("button h3").first();
    await expect(firstCard).toBeVisible({ timeout: 60_000 });
    await firstCard.click();

    // Bestätigungsdialog erscheint
    await expect(page.getByText("Vollständiges Rezept generieren?")).toBeVisible({ timeout: 5_000 });
    await page.getByRole("button", { name: /^Rezept generieren$/ }).click();

    // Warten auf Weiterleitung zur Rezeptdetailseite
    await expect(page).toHaveURL(/\/rezepte\/[0-9a-f-]{36}/, { timeout: 120_000 });

    // Rezeptseite lädt korrekt
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });

    // sourceType über API prüfen — muss "ai_generated" sein, nicht "ki_generated"
    const urlMatch = page.url().match(/\/rezepte\/([0-9a-f-]{36})/);
    const savedId = urlMatch?.[1] ?? "";
    expect(savedId).toBeTruthy();

    const recipeData = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}`);
      return res.json() as Promise<Record<string, unknown>>;
    }, savedId);
    expect(recipeData.sourceType).toBe("ai_generated");

    // Testrezept aufräumen
    await page.evaluate(async (id: string) => {
      await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    }, savedId);
  });

  test("8.16 KI-Bild generieren via UI-Schaltfläche (nicht direkte API)", async ({ page }) => {
    test.setTimeout(150_000);
    await loginAdmin(page);

    // Eigenes Rezept ohne Bilder erstellen, damit der Test unabhängig von 8.14 ist
    const freshId = await createRecipeViaApi(page);

    try {
      await page.goto(`/rezepte/${freshId}`);

      // "KI-Bild generieren"-Schaltfläche sichtbar (GenerateImageButton-Komponente)
      const generateBtn = page.getByRole("button", { name: /KI-Bild generieren/i });
      await expect(generateBtn).toBeVisible({ timeout: 8_000 });
      await generateBtn.click();

      // Nach Erfolg erscheint das Hero-Bild im Hintergrund.
      // Hinweis: setGenerated(true) und onImageGenerated() werden in React 18 gemeinsam
      // gebatcht – der Parent setzt hasPrimaryImage=true und demontiert GenerateImageButton
      // bevor das "KI-generiert"-Badge sichtbar wird. Das Hero-Bild ist das tatsächliche
      // sichtbare Ergebnis der Generierung.
      await expect(
        page.locator('img[class*="object-cover"]'),
      ).toBeVisible({ timeout: 120_000 });
    } finally {
      await page.evaluate(async (id: string) => {
        await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      }, freshId);
    }
  });

  test("8.17 Skalierungshinweise rendern nichtleeren Text in der UI", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAdmin(page);
    expect(testRecipeId).toBeTruthy();
    await page.goto(`/rezepte/${testRecipeId}`);

    // Portionen von 4 auf 9 erhöhen (Faktor 2.25 > 2 → ScalingHintsPanel wird sichtbar)
    const increaseBtn = page.getByRole("button", { name: /Portionen erhöhen/i });
    await expect(increaseBtn).toBeVisible({ timeout: 8_000 });
    for (let i = 0; i < 5; i++) {
      await increaseBtn.click();
    }
    await expect(page.getByTestId("servings-display")).toHaveText("9", { timeout: 3_000 });

    // ScalingHintsPanel erscheint und zeigt Hinweise-Schaltfläche
    const hintsBtn = page.getByRole("button", { name: /Hinweise zur Skalierung/i });
    await expect(hintsBtn).toBeVisible({ timeout: 5_000 });
    await hintsBtn.click();

    // Auf ersten Hinweis-Eintrag warten (KI-Aufruf)
    const firstHint = page.locator(".bg-amber-50 p").first();
    await expect(firstHint).toBeVisible({ timeout: 60_000 });

    // Textinhalt muss nichtleer sein — war leer wenn h.hint statt h gerendert wurde
    const hintText = await firstHint.textContent();
    expect((hintText ?? "").trim().length).toBeGreaterThan(0);
  });
});
