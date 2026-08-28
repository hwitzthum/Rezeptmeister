/**
 * Phase 20 -- UX-Verbesserungen
 *
 * Deckt die vier gemeldeten Schwaechen ab:
 *   1. Kein Weg zum Dashboard auf dem Handy
 *   2. Suche findet nur ganze Woerter
 *   3. Dashboard-Aktionen brechen ungleichmaessig um
 *   4. KI-Vorschlaege ohne Substanz
 *
 * Voraussetzungen:
 * - PostgreSQL laeuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 *
 * Alle Tests sind self-contained (erstellen ihre eigenen Daten).
 */

import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

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

/** Handy-Breite fuer die Layout-Pruefungen (iPhone 14). */
const PHONE = { width: 390, height: 844 };

test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

async function loginAdmin(page: Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

async function createRecipeViaApi(
  page: Page,
  title: string,
  ingredientName: string,
): Promise<string> {
  const resp = await page.evaluate(
    async (args: { title: string; ingredientName: string }) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: args.title,
          instructions: "Zubereitung: Alle Zutaten mischen und servieren.",
          servings: 4,
          totalTimeMinutes: 30,
          difficulty: "einfach",
          category: "Hauptgericht",
          ingredients: [
            {
              name: args.ingredientName,
              amount: 200,
              unit: "g",
              sortOrder: 0,
              isOptional: false,
            },
          ],
        }),
      });
      if (!res.ok) return { error: await res.text() };
      return res.json();
    },
    { title, ingredientName },
  );
  if ("error" in resp) throw new Error(`Rezept erstellen fehlgeschlagen: ${resp.error}`);
  return resp.id as string;
}

async function deleteRecipeViaApi(page: Page, id: string) {
  await page.evaluate(
    (recipeId: string) => fetch(`/api/recipes/${recipeId}`, { method: "DELETE" }),
    id,
  );
}

// ── 1 · Home-Button auf dem Handy ────────────────────────────────────────────

test.describe("Phase 20 – Home-Button auf dem Handy", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
    await loginAdmin(page);
  });

  const BEREICHE = ["/rezepte", "/suche", "/einkaufsliste", "/wochenplan", "/sammlungen", "/mehr"];

  for (const bereich of BEREICHE) {
    test(`fuehrt von ${bereich} zurueck aufs Dashboard`, async ({ page }) => {
      await page.goto(bereich);
      const home = page.getByTestId("home-link");
      await expect(home).toBeVisible();

      // Tippziel nach WCAG 2.5.5
      const box = await home.boundingBox();
      expect(box, `Home-Button auf ${bereich} hat keine Box`).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      await home.click();
      await expect(page).toHaveURL("/", { timeout: 10_000 });
      await expect(page.getByTestId("dashboard")).toBeVisible();
    });
  }

  test("fehlt auf dem Dashboard selbst — dort ist er kein Ziel", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByTestId("home-link")).toHaveCount(0);
  });

  test("bleibt auf dem Desktop verborgen — dort fuehrt die Sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/rezepte");
    await expect(page.getByTestId("sidebar")).toBeVisible();
    await expect(page.getByTestId("home-link")).toBeHidden();
  });
});

// ── 2 · Suche findet Wortanfaenge ────────────────────────────────────────────

test.describe("Phase 20 – Smarte Suche", () => {
  const titel = `Butterzopf ${RUN_ID}`;
  const zutat = `Safranfaeden ${RUN_ID}`;
  let recipeId = "";

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
    if (!recipeId) recipeId = await createRecipeViaApi(page, titel, zutat);
  });

  test.afterAll(async ({ browser }) => {
    if (!recipeId || !CREDS_AVAILABLE) return;
    const page = await browser.newPage();
    await loginAdmin(page);
    await deleteRecipeViaApi(page, recipeId);
    await page.close();
  });

  async function sucheNach(page: Page, begriff: string) {
    await page.goto("/suche");
    const feld = page.getByPlaceholder(/such/i).first();
    await feld.fill(begriff);
    // Debounce 250 ms plus Abfrage
    await page.waitForTimeout(1_200);
  }

  test("findet das Rezept ab dem Wortanfang — der gemeldete Fehler", async ({ page }) => {
    await sucheNach(page, "butterzop");
    await expect(page.getByText(titel, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("findet das Rezept ueber eine Zutat", async ({ page }) => {
    await sucheNach(page, "safranfae");
    await expect(page.getByText(titel, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("schaltet bei beginnender Suche selbst auf Relevanz um", async ({ page }) => {
    await page.goto("/suche");
    const sortierung = page.locator("select").filter({ hasText: "Neueste" }).first();
    await expect(sortierung).toHaveValue("neueste");
    await page.getByPlaceholder(/such/i).first().fill("butterzop");
    await expect(sortierung).toHaveValue("relevanz", { timeout: 5_000 });
  });
});

// ── 3 · Dashboard-Aktionen ───────────────────────────────────────────────────

test.describe("Phase 20 – Dashboard-Aktionen", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("die drei Kacheln sind auf dem Handy gleich breit und stehen auf einer Zeile", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    await expect(page.getByTestId("quick-actions")).toBeVisible();

    const kacheln = [
      page.getByTestId("quick-action-neu"),
      page.getByTestId("quick-action-bild"),
      page.getByTestId("quick-action-url"),
    ];
    const boxen = await Promise.all(kacheln.map((k) => k.boundingBox()));
    for (const box of boxen) expect(box).not.toBeNull();

    // Gleiche Breite (1 px Toleranz fuer Subpixel-Rundung)
    const breiten = boxen.map((b) => b!.width);
    expect(Math.max(...breiten) - Math.min(...breiten)).toBeLessThanOrEqual(1);

    // Gleiche Zeile: identische Oberkante — genau das war vorher nicht so
    const oberkanten = boxen.map((b) => Math.round(b!.y));
    expect(new Set(oberkanten).size).toBe(1);

    // Kein Ueberlauf ueber den Bildrand
    for (const box of boxen) {
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width + 1);
    }
  });

  test("die Kacheln sind Links bzw. Buttons — kein Button in einem Link", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("quick-action-neu")).toHaveJSProperty(
      "tagName",
      "A",
    );
    await expect(page.getByTestId("quick-action-url")).toHaveJSProperty(
      "tagName",
      "BUTTON",
    );
    // Ein <button> in einem <a> waere ungueltiges HTML.
    await expect(
      page.locator('[data-testid="quick-actions"] a button'),
    ).toHaveCount(0);
  });

  test("die Kachel fuehrt zum Erfassen", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("quick-action-neu").click();
    await expect(page).toHaveURL(/\/rezepte\/neu/, { timeout: 10_000 });
  });
});

// ── 4 · KI-Vorschlaege mit Substanz ──────────────────────────────────────────

test.describe("Phase 20 – KI-Vorschlaege", () => {
  const MOCK_ANTWORT = {
    suggestions: [
      {
        id: 1,
        title: `Egli-Filet an Zitronenbutter ${RUN_ID}`,
        description: "Zarter Süsswasserfisch aus dem Schweizer See. Frisch und leicht.",
        why_it_fits:
          "Deine Sammlung ist stark auf Schweizer Hauptgänge ausgerichtet, hat aber noch keinen Fisch.",
        highlight: "Der Fisch wird nicht mehliert, sondern nur in Nussbutter geschwenkt.",
        key_ingredients: ["Eglifilet", "Butter", "Zitrone"],
        missing_ingredients: ["Eglifilet"],
        cuisine: "Schweizer",
        category: "Hauptgang",
        time_estimate_minutes: 25,
        difficulty: "einfach",
      },
    ],
    tokens_used: 0,
  };

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
    await page.route("**/api/ai/suggest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ANTWORT),
      });
    });
  });

  test("die Karte zeigt Begruendung, Besonderheit und Zutaten-Abgleich", async ({
    page,
  }) => {
    await page.goto("/vorschlaege");
    await page.getByRole("button", { name: /Vorschläge generieren/i }).click();

    await expect(page.getByText(/Warum das passt/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Das Besondere/)).toBeVisible();
    await expect(
      page.getByText(/hat aber noch keinen Fisch/),
    ).toBeVisible();

    // Fehlende Zutat grau und mit Plus, vorhandene gruen mit Haken
    await expect(page.getByTestId("zutat-fehlt")).toHaveCount(1);
    await expect(page.getByTestId("zutat-vorhanden")).toHaveCount(2);
  });

  test("beim erneuten Vorschlagen wird das Gezeigte ausgeschlossen", async ({
    page,
  }) => {
    const anfragen: unknown[] = [];
    await page.route("**/api/ai/suggest", async (route) => {
      anfragen.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_ANTWORT),
      });
    });

    await page.goto("/vorschlaege");
    await page.getByRole("button", { name: /Vorschläge generieren/i }).click();
    await expect(page.getByText(/Warum das passt/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Regenerieren/i }).click();
    await expect(page.getByText(/Warum das passt/)).toBeVisible({ timeout: 10_000 });

    expect(anfragen.length).toBeGreaterThanOrEqual(2);
    const zweite = anfragen[1] as { exclude_titles?: string[] };
    expect(zweite.exclude_titles).toContain(MOCK_ANTWORT.suggestions[0].title);
  });
});
