/**
 * Phase 12 -- Sammlungen / Kochbuecher
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
  await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
}

// ── Hilfs-Rezept erstellen ───────────────────────────────────────────────────

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
            {
              name: "Mehl",
              amount: 250,
              unit: "g",
              sortOrder: 0,
              isOptional: false,
            },
          ],
          tags: ["Test"],
          sourceType: "manual",
        }),
      });
      return res.json() as Promise<{ id: string }>;
    },
    { title: `Phase-12-Rezept-${RUN_ID}-${suffix}` },
  );
  return resp.id;
}

// ── Hilfs-Sammlung erstellen via API ─────────────────────────────────────────

async function createCollectionViaApi(
  page: import("@playwright/test").Page,
  suffix: string,
): Promise<{ id: string; name: string }> {
  const name = `Testsammlung-${RUN_ID}-${suffix}`;
  const resp = await page.evaluate(
    async (args: { name: string }) => {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: args.name }),
      });
      return res.json() as Promise<{ id: string; name: string }>;
    },
    { name },
  );
  return { id: resp.id, name };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("Phase 12 -- Sammlungen", () => {
  // 12.1 -- Sammlungen-Seite sichtbar
  test("12.1 Sammlungen-Seite sichtbar", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/sammlungen");
    await expect(
      page.getByRole("heading", { name: /Sammlungen/i }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("collections-page")).toBeVisible();
  });

  // 12.2 -- Sammlung erstellen
  test("12.2 Sammlung erstellen", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/sammlungen");
    await expect(page.getByTestId("collections-page")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByTestId("create-collection-button").click();
    await expect(
      page.getByTestId("collection-name-input"),
    ).toBeVisible({ timeout: 3_000 });

    const collectionName = `Testsammlung-${RUN_ID}`;
    await page.getByTestId("collection-name-input").fill(collectionName);
    await page
      .getByTestId("collection-description-input")
      .fill("Testbeschreibung");
    await page.getByTestId("collection-save-button").click();

    // Card appears in the grid
    await expect(page.getByText(collectionName)).toBeVisible({
      timeout: 5_000,
    });
  });

  // 12.3 -- Sammlung bearbeiten
  test("12.3 Sammlung bearbeiten", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/sammlungen");
    await expect(page.getByTestId("collections-page")).toBeVisible({
      timeout: 8_000,
    });

    // Create first
    const collectionName = `Edit-${RUN_ID}`;
    await page.getByTestId("create-collection-button").click();
    await expect(
      page.getByTestId("collection-name-input"),
    ).toBeVisible({ timeout: 3_000 });
    await page.getByTestId("collection-name-input").fill(collectionName);
    await page.getByTestId("collection-save-button").click();
    await expect(page.getByText(collectionName)).toBeVisible({
      timeout: 5_000,
    });

    // Open edit dialog via card hover action
    const card = page.getByText(collectionName).first();
    await card.hover();
    await page.getByRole("button", { name: "Bearbeiten" }).first().click();

    // Edit name
    const updatedName = `Bearbeitet-${RUN_ID}`;
    await page.getByTestId("collection-name-input").fill(updatedName);
    await page.getByTestId("collection-save-button").click();

    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 5_000 });
  });

  // 12.4 -- Sammlung loeschen
  test("12.4 Sammlung loeschen", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/sammlungen");
    await expect(page.getByTestId("collections-page")).toBeVisible({
      timeout: 8_000,
    });

    // Create
    const collectionName = `Delete-${RUN_ID}`;
    await page.getByTestId("create-collection-button").click();
    await expect(
      page.getByTestId("collection-name-input"),
    ).toBeVisible({ timeout: 3_000 });
    await page.getByTestId("collection-name-input").fill(collectionName);
    await page.getByTestId("collection-save-button").click();
    await expect(page.getByText(collectionName)).toBeVisible({
      timeout: 5_000,
    });

    // Hover and click delete
    const card = page.getByText(collectionName).first();
    await card.hover();
    await page.getByRole("button", { name: "Loeschen" }).first().click();

    // Wait for confirm dialog and click its confirm button
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 3_000 });
    await dialog.getByRole("button", { name: "Loeschen" }).click();

    // Wait for dialog to close, then verify card is gone
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId("collections-grid").getByText(collectionName),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // 12.5 -- Rezept zu Sammlung hinzufuegen
  test("12.5 Rezept zu Sammlung hinzufuegen", async ({ page }) => {
    await loginAdmin(page);

    const recipeId = await createRecipeViaApi(page, "12-5");
    const collection = await createCollectionViaApi(page, "12-5");

    // Add recipe to collection via API
    const result = await page.evaluate(
      async (args: { collectionId: string; recipeId: string }) => {
        const res = await fetch(
          `/api/collections/${args.collectionId}/rezepte`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipeId: args.recipeId }),
          },
        );
        return { status: res.status, data: await res.json() };
      },
      { collectionId: collection.id, recipeId },
    );
    expect(result.status).toBe(201);

    // Navigate to collection detail
    await page.goto(`/sammlungen/${collection.id}`);
    await expect(page.getByTestId("collection-detail-page")).toBeVisible({
      timeout: 8_000,
    });

    // Recipe listed
    await expect(
      page.getByTestId(`collection-recipe-${recipeId}`),
    ).toBeVisible({ timeout: 5_000 });
  });

  // 12.6 -- Rezept aus Sammlung entfernen
  test("12.6 Rezept aus Sammlung entfernen", async ({ page }) => {
    await loginAdmin(page);

    const recipeId = await createRecipeViaApi(page, "12-6");
    const collection = await createCollectionViaApi(page, "12-6");

    // Add recipe
    await page.evaluate(
      async (args: { collectionId: string; recipeId: string }) => {
        await fetch(`/api/collections/${args.collectionId}/rezepte`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId: args.recipeId }),
        });
      },
      { collectionId: collection.id, recipeId },
    );

    // Navigate to detail
    await page.goto(`/sammlungen/${collection.id}`);
    await expect(page.getByTestId("collection-detail-page")).toBeVisible({
      timeout: 8_000,
    });
    await expect(
      page.getByTestId(`collection-recipe-${recipeId}`),
    ).toBeVisible({ timeout: 5_000 });

    // Remove
    const recipeCard = page.getByTestId(`collection-recipe-${recipeId}`);
    await recipeCard.hover();
    await page
      .getByTestId(`remove-recipe-button-${recipeId}`)
      .click();

    // Empty state
    await expect(
      page.getByText("Diese Sammlung enthaelt noch keine Rezepte."),
    ).toBeVisible({ timeout: 5_000 });
  });

  // 12.7 -- Sammlungsdetail zeigt Rezepte
  test("12.7 Sammlungsdetail zeigt Rezepte", async ({ page }) => {
    await loginAdmin(page);

    const recipeId1 = await createRecipeViaApi(page, "12-7a");
    const recipeId2 = await createRecipeViaApi(page, "12-7b");
    const collection = await createCollectionViaApi(page, "12-7");

    // Add both recipes
    for (const rid of [recipeId1, recipeId2]) {
      await page.evaluate(
        async (args: { collectionId: string; recipeId: string }) => {
          await fetch(`/api/collections/${args.collectionId}/rezepte`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipeId: args.recipeId }),
          });
        },
        { collectionId: collection.id, recipeId: rid },
      );
    }

    await page.goto(`/sammlungen/${collection.id}`);
    await expect(page.getByTestId("collection-detail-page")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("collection-detail-name")).toHaveText(
      collection.name,
    );

    // Both recipes visible
    await expect(
      page.getByTestId(`collection-recipe-${recipeId1}`),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByTestId(`collection-recipe-${recipeId2}`),
    ).toBeVisible({ timeout: 5_000 });

    // Recipe count shown
    await expect(page.getByText("2 Rezepte")).toBeVisible();
  });

  // 12.8 -- API CRUD
  test("12.8 API CRUD", async ({ page }) => {
    await loginAdmin(page);

    // CREATE
    const createResult = await page.evaluate(async (runId: string) => {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `API-Test-${runId}` }),
      });
      return { status: res.status, data: await res.json() };
    }, RUN_ID);
    expect(createResult.status).toBe(201);
    expect(createResult.data.id).toBeTruthy();
    const collId = createResult.data.id as string;

    // READ list
    const listResult = await page.evaluate(async () => {
      const res = await fetch("/api/collections");
      return {
        status: res.status,
        data: await res.json() as { collections: { id: string }[] },
      };
    });
    expect(listResult.status).toBe(200);
    expect(
      listResult.data.collections.some((c) => c.id === collId),
    ).toBe(true);

    // READ detail
    const detailResult = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/collections/${id}`);
      return {
        status: res.status,
        data: await res.json() as { collection: { id: string; name: string } },
      };
    }, collId);
    expect(detailResult.status).toBe(200);
    expect(detailResult.data.collection.id).toBe(collId);

    // UPDATE
    const updateResult = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/collections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Aktualisiert" }),
      });
      return {
        status: res.status,
        data: await res.json() as { name: string },
      };
    }, collId);
    expect(updateResult.status).toBe(200);
    expect(updateResult.data.name).toBe("Aktualisiert");

    // DELETE
    const deleteResult = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/collections/${id}`, {
        method: "DELETE",
      });
      return {
        status: res.status,
        data: await res.json() as { success: boolean },
      };
    }, collId);
    expect(deleteResult.status).toBe(200);
    expect(deleteResult.data.success).toBe(true);

    // Verify gone
    const goneResult = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/collections/${id}`);
      return { status: res.status };
    }, collId);
    expect(goneResult.status).toBe(404);
  });
});
