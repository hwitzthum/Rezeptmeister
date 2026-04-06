/**
 * Phase 3 – Rezeptverwaltung CRUD
 *
 * Voraussetzung: PostgreSQL läuft (docker compose up -d)
 * und Admin-User ist in db/seed.sql (harrywitzthum@gmail.com).
 * Der Dev-Server startet automatisch via playwright.config.ts (Port 3002).
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "harrywitzthum@gmail.com";
const ADMIN_PASSWORD = "05!Shakespeare_15";

// Eindeutiger Lauf-Suffix um Kollisionen zu vermeiden
const RUN_ID = Date.now().toString(36);
const RECIPE_TITLE = `Testzürcher-${RUN_ID}`;

// ── Hilfs-Login ───────────────────────────────────────────────────────────────

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 10_000 });
}

// ── API-Hilfe: Rezept direkt per API erstellen ────────────────────────────────

async function createRecipeViaApi(
  page: import("@playwright/test").Page,
  title: string,
): Promise<string> {
  const resp = await page.evaluate(async (t: string) => {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: t,
        servings: 4,
        instructions: "Testanleitung für Playwright.",
        ingredients: [
          { name: "Mehl", amount: 500, unit: "g", sortOrder: 0, isOptional: false },
          { name: "Eier", amount: 2, unit: "Stk.", sortOrder: 1, isOptional: false },
        ],
        tags: ["test", "playwright"],
        category: "Mittagessen",
        difficulty: "einfach",
        prepTimeMinutes: 10,
        cookTimeMinutes: 20,
      }),
    });
    const body = await res.json();
    return { status: res.status, id: body.id as string };
  }, title);

  expect(resp.status).toBe(201);
  expect(resp.id).toBeTruthy();
  return resp.id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("3.1 – Rezept erstellen", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("API POST /api/recipes – unauthenticated → 401", async ({ request }) => {
    const res = await request.post("/api/recipes", {
      data: { title: "Test", servings: 4, instructions: "..." },
    });
    expect(res.status()).toBe(401);
  });

  test("API POST /api/recipes – fehlender Titel → 400", async ({ page }) => {
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servings: 4, instructions: "..." }),
      });
      return res.status;
    });
    expect(status).toBe(400);
  });

  test("API POST /api/recipes – Rezept erfolgreich erstellen", async ({
    page,
  }) => {
    const id = await createRecipeViaApi(page, RECIPE_TITLE);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("UI: Formular Schritt 1 – Pflichtfeld-Validierung", async ({ page }) => {
    await page.goto("/rezepte/neu");
    // Ohne Titel auf "Weiter" klicken
    await page.getByRole("button", { name: "Weiter →" }).click();
    // Fehler soll sichtbar sein
    await expect(page.locator("text=Titel ist erforderlich")).toBeVisible();
  });

  test("UI: vollständiges Rezept über 4 Schritte erstellen", async ({
    page,
  }) => {
    const title = `UI-Rezept-${RUN_ID}`;
    await page.goto("/rezepte/neu");

    // Schritt 1: Grunddaten
    await page.getByLabel("Rezepttitel").fill(title);
    await page.getByLabel("Portionen").fill("4");
    await page.getByLabel("Schwierigkeitsgrad").selectOption("einfach");
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 2: Zutaten – eine Zutat hinzufügen
    await page.getByRole("button", { name: "Zutat hinzufügen" }).click();
    const nameInput = page.locator('input[aria-label="Zutatname"]').first();
    await nameInput.fill("Kartoffeln");
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 3: Anleitung
    await page.getByLabel("Zubereitung").fill("Kartoffeln kochen und servieren.");
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 4: Metadaten → Speichern
    await page.getByRole("button", { name: "Rezept speichern" }).click();

    // Weiterleitung zur Detailseite
    await expect(page).toHaveURL(/\/rezepte\/[0-9a-f-]{36}$/, {
      timeout: 10_000,
    });
    await expect(
      page.getByRole("heading", { name: title }),
    ).toBeVisible({ timeout: 5_000 });
  });
});

test.describe("3.2 – Rezeptliste & Übersicht", () => {
  let recipeId: string;

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
    recipeId = await createRecipeViaApi(page, `Liste-${RUN_ID}`);
  });

  test("Rezeptliste lädt und zeigt erstelltes Rezept", async ({ page }) => {
    await page.goto("/rezepte");
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator(`text=Liste-${RUN_ID}`).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Filter nach Kategorie funktioniert", async ({ page }) => {
    await page.goto("/rezepte");
    await page.waitForLoadState("networkidle");

    // Kategorie "Mittagessen" auswählen (das Test-Rezept hat diese Kategorie)
    await page.locator("select").filter({ hasText: "Kategorie" }).selectOption("Mittagessen");
    await page.waitForTimeout(500); // debounce

    await expect(
      page.locator(`text=Liste-${RUN_ID}`).first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("Sortierung Alphabetisch funktioniert", async ({ page }) => {
    await page.goto("/rezepte");
    await page.waitForLoadState("networkidle");
    await page.locator("select").filter({ hasText: "Neueste zuerst" }).selectOption("alphabetisch");
    // Kein Fehler und Rezepte werden gezeigt
    await expect(page.locator("[aria-label^='Rezept:']").first()).toBeVisible({ timeout: 8_000 });
    void recipeId; // use variable
  });
});

test.describe("3.3 – Rezeptdetailansicht", () => {
  let recipeId: string;

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
    recipeId = await createRecipeViaApi(page, `Detail-${RUN_ID}`);
  });

  test("API GET /api/recipes/[id] gibt Rezept mit Zutaten zurück", async ({
    page,
  }) => {
    const result = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}`);
      const body = await res.json();
      return { status: res.status, hasIngredients: Array.isArray(body.ingredients) };
    }, recipeId);

    expect(result.status).toBe(200);
    expect(result.hasIngredients).toBe(true);
  });

  test("Detailseite lädt vollständig", async ({ page }) => {
    await page.goto(`/rezepte/${recipeId}`);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", { name: `Detail-${RUN_ID}` }),
    ).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Zutaten")).toBeVisible();
    await expect(page.getByText("Zubereitung")).toBeVisible();
  });

  test("Portionsrechner skaliert korrekt", async ({ page }) => {
    await page.goto(`/rezepte/${recipeId}`);
    await page.waitForLoadState("networkidle");

    // Portionen erhöhen
    await page.getByRole("button", { name: "Portionen erhöhen" }).click();
    await expect(page.getByTestId("servings-display")).toHaveText("5");
  });

  test("API GET /api/recipes/[id] – nicht existierendes Rezept → 404", async ({
    page,
  }) => {
    const status = await page.evaluate(async () => {
      const res = await fetch(
        "/api/recipes/00000000-0000-0000-0000-000000000000",
      );
      return res.status;
    });
    expect(status).toBe(404);
  });
});

test.describe("3.4 – Favoriten", () => {
  let recipeId: string;

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
    recipeId = await createRecipeViaApi(page, `Favorit-${RUN_ID}`);
  });

  test("API PATCH /api/recipes/[id]/favorit – toggelt Favorit", async ({
    page,
  }) => {
    // Favorit setzen
    const r1 = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}/favorit`, { method: "PATCH" });
      return await res.json();
    }, recipeId);
    expect(r1.isFavorite).toBe(true);

    // Favorit zurücksetzen
    const r2 = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}/favorit`, { method: "PATCH" });
      return await res.json();
    }, recipeId);
    expect(r2.isFavorite).toBe(false);
  });
});

test.describe("3.5 – Rezept bearbeiten & löschen", () => {
  let recipeId: string;

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
    recipeId = await createRecipeViaApi(page, `Edit-${RUN_ID}`);
  });

  test("API PUT /api/recipes/[id] – Titel ändern", async ({ page }) => {
    const newTitle = `Bearbeitet-${RUN_ID}`;
    const result = await page.evaluate(
      async ({ id, title }: { id: string; title: string }) => {
        const res = await fetch(`/api/recipes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            servings: 4,
            instructions: "Aktualisierte Anleitung.",
            ingredients: [],
            tags: [],
          }),
        });
        const body = await res.json();
        return { status: res.status, title: body.title as string };
      },
      { id: recipeId, title: newTitle },
    );

    expect(result.status).toBe(200);
    expect(result.title).toBe(newTitle);
  });

  test("UI: Bearbeitungsseite lädt mit vorausgefülltem Formular", async ({
    page,
  }) => {
    await page.goto(`/rezepte/${recipeId}/bearbeiten`);
    await page.waitForLoadState("networkidle");

    // Titel-Feld soll vorausgefüllt sein
    await expect(page.getByLabel("Rezepttitel")).toHaveValue(`Edit-${RUN_ID}`, {
      timeout: 8_000,
    });
  });

  test("API DELETE /api/recipes/[id] – Rezept löschen", async ({ page }) => {
    const status = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}`, { method: "DELETE" });
      return res.status;
    }, recipeId);
    expect(status).toBe(204);

    // Danach 404
    const status2 = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/recipes/${id}`);
      return res.status;
    }, recipeId);
    expect(status2).toBe(404);
  });

  test("UI: Löschen-Dialog erscheint und Rezept wird gelöscht", async ({
    page,
  }) => {
    await page.goto(`/rezepte/${recipeId}`);
    await page.waitForLoadState("networkidle");

    // Löschen-Button klicken
    await page.getByRole("button", { name: "Löschen" }).click();

    // Bestätigungs-Dialog soll erscheinen
    await expect(
      page.getByRole("dialog"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("dialog").getByText("Rezept löschen"),
    ).toBeVisible();

    // Bestätigen
    await page.getByRole("button", { name: "Löschen" }).last().click();

    // Weiterleitung zur Rezeptliste
    await expect(page).toHaveURL("/rezepte", { timeout: 10_000 });
  });
});
