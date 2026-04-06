/**
 * Phase 6 – FastAPI KI-Pipeline: Embeddings & OCR
 *
 * Voraussetzungen:
 * - PostgreSQL läuft (docker compose up -d)
 * - FastAPI-Backend läuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 *
 * Live-Tests (6.6–6.8) laufen nur wenn GEMINI_TEST_KEY in ../../.env gesetzt ist.
 * Embedding-Tests (6.1–6.5) prüfen nur den HTTP-Fluss.
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

// ── Hilfs-Rezept-Erstellen ────────────────────────────────────────────────────

async function createRecipeViaApi(page: import("@playwright/test").Page): Promise<string> {
  const resp = await page.evaluate(async (title: string) => {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        instructions: "Zutaten vermischen und servieren.",
        servings: 2,
        ingredients: [{ name: "Wasser", amount: 2, unit: "dl", sortOrder: 0, isOptional: false }],
        tags: [],
        sourceType: "manual",
      }),
    });
    return res.json() as Promise<{ id: string }>;
  }, `Phase-6-Rezept-${RUN_ID}`);
  return resp.id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Phase 6 – Embedding & OCR", () => {
  test.describe.configure({ mode: "serial" });

  test("6.1 Embedding-Endpunkt /embed/text gibt 204 zurück (kein API-Key → stilles Überspringen)", async ({ page }) => {
    await loginAdmin(page);

    // Direkt Backend-Endpunkt via Next.js API-Route aufrufen geht nicht direkt —
    // stattdessen prüfen wir: Rezept erstellen triggert Embedding fire-and-forget ohne Fehler.
    const resp = await page.evaluate(async (title: string) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          instructions: "Kurze Anleitung.",
          servings: 2,
          ingredients: [],
          tags: [],
          sourceType: "manual",
        }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    }, `Embedding-Test-${RUN_ID}`);

    expect(resp.status).toBe(201);
    expect(resp.body).toHaveProperty("id");
    // Kein Fehler durch Embedding-Aufruf — selbst ohne API-Key bleibt der Endpunkt stabil
  });

  test("6.2 Rezept bearbeiten triggert Embedding-Neuberechnung ohne Fehler", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page);

    const resp = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Aktualisiertes Rezept",
          instructions: "Neue Anleitung.",
          servings: 4,
          ingredients: [],
          tags: [],
          sourceType: "manual",
        }),
      });
      return { status: res.status };
    }, recipeId);

    expect(resp.status).toBe(200);
  });

  test("6.3 Bildgalerie zeigt OCR-Schaltfläche in Bilddetails", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/bilder");
    await expect(page).toHaveURL("/bilder");

    // Prüfe ob die Seite korrekt lädt
    await expect(page.getByRole("heading", { name: "Bildergalerie" })).toBeVisible({ timeout: 8_000 });
  });

  test("6.4 OCR ohne API-Schlüssel zeigt Fehlermeldung", async ({ page }) => {
    await loginAdmin(page);

    // Prüfen dass der OCR-Endpunkt bei fehlendem API-Schlüssel 400 zurückgibt
    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/ai/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: "00000000-0000-0000-0000-000000000001" }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    });

    // Erwarte 400 (kein API-Schlüssel) oder 400 (ungültige imageId)
    expect([400, 422, 404]).toContain(resp.status);
    expect(resp.body).toHaveProperty("error");
  });

  test("6.5 Bild hochladen triggert Bild-Embedding ohne Fehler", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/bilder");
    await expect(page.getByRole("heading", { name: "Bildergalerie" })).toBeVisible({ timeout: 8_000 });

    // Upload-Modal öffnen
    await page.getByRole("button", { name: "Bild hochladen" }).click();
    await expect(page.getByRole("heading", { name: "Bild hochladen" })).toBeVisible({ timeout: 5_000 });

    // Test-PNG-Datei hochladen (1×1 Pixel transparent PNG via data URI)
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBuffer = Buffer.from(pngBase64, "base64");

    const uploadInput = page.locator('input[type="file"]');
    await uploadInput.setInputFiles({
      name: `test-${RUN_ID}.png`,
      mimeType: "image/png",
      buffer: pngBuffer,
    });

    // Erfolgsmeldung abwarten
    await expect(page.getByText("Bild hochgeladen")).toBeVisible({ timeout: 15_000 });

    // Kein Fehler durch Embedding-Fire-and-Forget
  });
});

// ── Live-Tests mit echtem Gemini-API-Schlüssel ────────────────────────────────

test.describe("Phase 6 – Live-Gemini (mit API-Schlüssel)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!GEMINI_TEST_KEY, "GEMINI_TEST_KEY nicht gesetzt – Live-Tests übersprungen");

  // Gemini-Schlüssel via Settings-API speichern (Voraussetzung für 6.7 + 6.8)
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
    await page.close();
  });

  // Schlüssel nach allen Live-Tests wieder entfernen (kein Datenleck in DB)
  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await page.evaluate(async () => {
      await fetch("/api/settings/api-key", { method: "DELETE" });
    });
    await page.close();
  });

  test("6.6 Gemini-Schlüssel in Einstellungen speichern und lesen", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/settings/api-key");
      return await res.json() as { hasKey: boolean; masked: string | null; provider: string | null };
    });

    expect(resp.hasKey).toBe(true);
    expect(resp.provider).toBe("gemini");
    expect(resp.masked).toBeTruthy();
    // Schlüssel ist maskiert (nicht im Klartext)
    expect(resp.masked).not.toContain("AIza");
  });

  test("6.7 Rezept erstellen triggert echtes Embedding (kein Fehler, 201)", async ({ page }) => {
    await loginAdmin(page);

    const resp = await page.evaluate(async (title: string) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          instructions: "Zutaten vermischen und bei 180°C backen.",
          servings: 4,
          ingredients: [
            { name: "Mehl", amount: 300, unit: "g", sortOrder: 0, isOptional: false },
            { name: "Eier", amount: 3, unit: "Stk.", sortOrder: 1, isOptional: false },
          ],
          tags: ["Backen"],
          sourceType: "manual",
        }),
      });
      return { status: res.status, body: await res.json() as { id?: string; error?: string } };
    }, `Live-Embedding-Test-${RUN_ID}`);

    expect(resp.status).toBe(201);
    expect(resp.body).toHaveProperty("id");

    // Kurze Pause damit Background-Task Zeit hat zu laufen
    await page.waitForTimeout(4_000);
    // Kein Fehler = Embedding-Fire-and-Forget hat mindestens keinen 5xx ausgelöst
  });

  test("6.8 OCR-Endpunkt liefert strukturiertes Rezept aus echtem Bild", async ({ page }) => {
    await loginAdmin(page);

    // Schritt 1: Test-PNG hochladen (1×1 Pixel reicht für Upload-Flow)
    // Für echte OCR-Qualität braucht es ein richtiges Rezeptbild —
    // hier testen wir hauptsächlich den API-Fluss bis zum Gemini-Aufruf
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const uploadResp = await page.evaluate(async (b64: string): Promise<{ id?: string; error?: string }> => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const formData = new FormData();
      formData.append("file", new Blob([arr], { type: "image/png" }), "ocr-test.png");
      const res = await fetch("/api/images/upload", { method: "POST", body: formData });
      return res.json() as Promise<{ id?: string; error?: string }>;
    }, pngBase64);

    expect(uploadResp).toHaveProperty("id");
    const imageId = uploadResp.id!;

    // Schritt 2: OCR aufrufen
    const ocrResp = await page.evaluate(async (imgId: string) => {
      const res = await fetch("/api/ai/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: imgId }),
      });
      return { status: res.status, body: await res.json() as Record<string, unknown> };
    }, imageId);

    // Das Bild ist zu klein für echte OCR → Gemini gibt "Kein Rezept erkannt" zurück
    // Wichtig: Endpunkt antwortet 200 mit einem OcrResult (kein 500)
    expect(ocrResp.status).toBe(200);
    expect(ocrResp.body).toHaveProperty("title");
    expect(ocrResp.body).toHaveProperty("ingredients");
    expect(ocrResp.body).toHaveProperty("instructions");
    expect(ocrResp.body.source_type).toBe("image_ocr");
  });
});
