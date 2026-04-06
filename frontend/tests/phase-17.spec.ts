/**
 * Phase 17 -- PWA & Offline-Zugang
 *
 * Voraussetzungen:
 * - PostgreSQL laeuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 *
 * Alle Tests sind self-contained.
 */

import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

// ── Env ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

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
          instructions: "Schritt 1: Kartoffeln kochen.\nSchritt 2: Servieren.",
          servings: 4,
          totalTimeMinutes: 30,
          difficulty: "einfach",
          category: "Hauptgericht",
          ingredients: [
            { name: "Kartoffeln", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
            { name: "Butter", amount: 2, unit: "EL", sortOrder: 1, isOptional: false },
            { name: "Salz", amount: 1, unit: "TL", sortOrder: 2, isOptional: true },
          ],
        }),
      });
      if (!res.ok) return { error: await res.text() };
      return res.json();
    },
    { title: `P17-${suffix}-${RUN_ID}` },
  );
  if ("error" in resp)
    throw new Error(`Rezept erstellen fehlgeschlagen: ${resp.error}`);
  return (resp as { id: string }).id;
}

async function deleteRecipeViaApi(
  page: import("@playwright/test").Page,
  id: string,
) {
  await page.evaluate(async (recipeId: string) => {
    await fetch(`/api/recipes/${recipeId}`, { method: "DELETE" });
  }, id);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Phase 17 – PWA & Offline-Zugang", () => {
  test.skip(
    !CREDS_AVAILABLE,
    "TEST_ADMIN_EMAIL und TEST_ADMIN_PASSWORD muessen gesetzt sein",
  );

  // ── 17.1 Manifest ──────────────────────────────────────────────────────────

  test("17.1 Web App Manifest wird korrekt ausgeliefert", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBe("Rezeptmeister");
    expect(manifest.short_name).toBe("Rezeptmeister");
    expect(manifest.theme_color).toBe("#C24D2C");
    expect(manifest.background_color).toBe("#FFF8F0");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    // Verify icons are reachable
    for (const icon of manifest.icons) {
      const iconRes = await request.get(icon.src);
      expect(iconRes.status()).toBe(200);
    }
  });

  // ── 17.2 Service Worker Registration ───────────────────────────────────────

  test("17.2 Service Worker registriert sich", async ({ page }) => {
    await loginAdmin(page);

    // Check that sw.js is served
    const swRes = await page.request.get("/sw.js");
    expect(swRes.status()).toBe(200);
    const swText = await swRes.text();
    expect(swText).toContain("rezeptmeister");
  });

  // ── 17.3 Offline-Toggle-Button sichtbar ────────────────────────────────────

  test("17.3 Offline-Toggle-Button erscheint auf Rezeptdetailseite", async ({
    page,
  }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "toggle");

    await page.goto(`/rezepte/${recipeId}`);
    const toggle = page.getByTestId("offline-toggle");
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Cleanup
    await deleteRecipeViaApi(page, recipeId);
  });

  // ── 17.4 Rezept offline speichern ──────────────────────────────────────────

  test("17.4 Rezept kann offline gespeichert werden", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "cache");

    await page.goto(`/rezepte/${recipeId}`);
    const toggle = page.getByTestId("offline-toggle");
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    // Click to cache offline
    await toggle.click();

    // Wait for success toast
    await expect(page.getByText("Rezept offline gespeichert")).toBeVisible({
      timeout: 10_000,
    });

    // Verify in IndexedDB via raw API (v2 uses composite key userId:recipeId)
    const isCached = await page.evaluate(
      async (rid: string) => {
        // Get current userId from session
        const session = await fetch("/api/auth/session").then((r) => r.json());
        const userId = session?.user?.id;
        if (!userId) return false;
        const compositeKey = `${userId}:${rid}`;
        return new Promise<boolean>((resolve) => {
          const req = indexedDB.open("rezeptmeister-offline", 2);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("recipes", "readonly");
            const store = tx.objectStore("recipes");
            const get = store.get(compositeKey);
            get.onsuccess = () => resolve(!!get.result);
            get.onerror = () => resolve(false);
          };
          req.onerror = () => resolve(false);
        });
      },
      recipeId,
    );
    expect(isCached).toBe(true);

    // Cleanup
    await deleteRecipeViaApi(page, recipeId);
  });

  // ── 17.5 Offline-Seite zeigt gespeicherte Rezepte ─────��───────────────────

  test("17.5 Offline-Seite listet gespeicherte Rezepte", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "list");

    // Navigate to recipe and cache it
    await page.goto(`/rezepte/${recipeId}`);
    await page.getByTestId("offline-toggle").click();
    await expect(page.getByText("Rezept offline gespeichert")).toBeVisible({
      timeout: 10_000,
    });

    // Navigate to offline page
    await page.goto("/offline");
    const list = page.getByTestId("offline-recipe-list");
    await expect(list).toBeVisible({ timeout: 5_000 });

    // Should contain our recipe
    await expect(list).toContainText(`P17-list-${RUN_ID}`);

    // Cleanup
    await deleteRecipeViaApi(page, recipeId);
  });

  // ── 17.6 Offline-Rezeptansicht ─────────────────────────────────────────────

  test("17.6 Offline-Rezeptansicht zeigt Rezeptdaten aus IndexedDB", async ({
    page,
  }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "view");

    // Cache the recipe
    await page.goto(`/rezepte/${recipeId}`);
    await page.getByTestId("offline-toggle").click();
    await expect(page.getByText("Rezept offline gespeichert")).toBeVisible({
      timeout: 10_000,
    });

    // Navigate to offline recipe viewer directly
    await page.goto(`/offline/rezept?id=${recipeId}`);

    // Verify recipe content is rendered from IndexedDB
    const title = page.getByTestId("offline-recipe-title");
    await expect(title).toBeVisible({ timeout: 5_000 });
    await expect(title).toContainText(`P17-view-${RUN_ID}`);

    // Check ingredients are shown
    const ingredients = page.getByTestId("offline-ingredients");
    await expect(ingredients).toBeVisible();
    await expect(ingredients).toContainText("Kartoffeln");
    await expect(ingredients).toContainText("Butter");

    // Check instructions are shown
    const instructions = page.getByTestId("offline-instructions");
    await expect(instructions).toBeVisible();
    await expect(instructions).toContainText("Kartoffeln kochen");

    // Check servings scaler
    const servings = page.getByTestId("offline-servings");
    await expect(servings).toHaveText("4");

    // Cleanup
    await deleteRecipeViaApi(page, recipeId);
  });

  // ── 17.7 Offline-Speicherung entfernen ─────────────────────────────────────

  test("17.7 Offline-Speicherung kann entfernt werden", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, "uncache");

    // Cache the recipe
    await page.goto(`/rezepte/${recipeId}`);
    await page.getByTestId("offline-toggle").click();
    await expect(page.getByText("Rezept offline gespeichert")).toBeVisible({
      timeout: 10_000,
    });

    // Click again to uncache
    await page.getByTestId("offline-toggle").click();
    await expect(page.getByText("Offline-Speicherung entfernt")).toBeVisible({
      timeout: 10_000,
    });

    // Verify removed from IndexedDB via raw API (v2 composite key)
    const isCached = await page.evaluate(
      async (rid: string) => {
        const session = await fetch("/api/auth/session").then((r) => r.json());
        const userId = session?.user?.id;
        if (!userId) return false;
        const compositeKey = `${userId}:${rid}`;
        return new Promise<boolean>((resolve) => {
          const req = indexedDB.open("rezeptmeister-offline", 2);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("recipes", "readonly");
            const store = tx.objectStore("recipes");
            const get = store.get(compositeKey);
            get.onsuccess = () => resolve(!!get.result);
            get.onerror = () => resolve(false);
          };
          req.onerror = () => resolve(false);
        });
      },
      recipeId,
    );
    expect(isCached).toBe(false);

    // Cleanup
    await deleteRecipeViaApi(page, recipeId);
  });
});
