/**
 * Phase 21 -- Kochhistorie, strukturierte Schritte, Backup, KI-Wochenplan,
 * Ersatz-Assistent (+ Bugfix «Validierungsfehler» nach URL-Import)
 *
 * Voraussetzungen:
 * - PostgreSQL laeuft (docker compose up -d)
 * - Dev-Server via playwright.config.ts auf Port 3002
 * - KI-Aufrufe werden per page.route gestubbt; Live-Tests nur mit GEMINI_TEST_KEY
 *
 * Alle Tests sind self-contained (erstellen und loeschen ihre eigenen Daten).
 */

import { test, expect, type Page } from "@playwright/test";
import { acquireLock, holdsLock, releaseLock, GEMINI_KEY_LOCK } from "./helpers/shared-lock";
import { callLiveAi } from "./helpers/live-ai";
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
const GEMINI_TEST_KEY = loadEnvVar("GEMINI_TEST_KEY");
const CREDS_AVAILABLE = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

const RUN_ID = Date.now().toString(36);

test.skip(
  !CREDS_AVAILABLE,
  "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env",
);

async function loginAdmin(page: Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

interface ApiIngredient {
  name: string;
  amount?: number;
  unit?: string;
  isOptional?: boolean;
}

async function createRecipeViaApi(
  page: Page,
  input: {
    title: string;
    instructions: string;
    ingredients: ApiIngredient[];
    servings?: number;
    tags?: string[];
    category?: string;
    cuisine?: string;
    totalTimeMinutes?: number;
  },
): Promise<string> {
  const resp = await page.evaluate(async (args: typeof input) => {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.title,
        instructions: args.instructions,
        servings: args.servings ?? 4,
        difficulty: "einfach",
        category: args.category ?? "Hauptgericht",
        cuisine: args.cuisine,
        tags: args.tags ?? [],
        prepTimeMinutes: args.totalTimeMinutes,
        ingredients: args.ingredients.map((ing, idx) => ({
          name: ing.name,
          amount: ing.amount,
          unit: ing.unit,
          sortOrder: idx,
          isOptional: ing.isOptional ?? false,
        })),
      }),
    });
    if (!res.ok) return { error: await res.text() };
    return res.json();
  }, input);
  if ("error" in resp)
    throw new Error(`Rezept erstellen fehlgeschlagen: ${resp.error}`);
  return resp.id as string;
}

async function deleteRecipeViaApi(page: Page, id: string) {
  await page.evaluate(
    (recipeId: string) =>
      fetch(`/api/recipes/${recipeId}`, { method: "DELETE" }),
    id,
  );
}

// ── 21.0 · Bugfix: Validierungsfehler nach URL-Import ────────────────────────

test.describe("Phase 21.0 – URL-Import speichert trotz unnormalisierter KI-Daten", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("Schwierigkeit «Einfach», Menge 0 und 25 Tags werden beim Speichern normalisiert", async ({
    page,
  }) => {
    const title = `Import-Bugfix-${RUN_ID}`;
    await page.route("**/api/ai/import-url", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          title,
          description: null,
          servings: 4,
          prep_time_minutes: 10.4,
          cook_time_minutes: null,
          // Genau die Werte, an denen POST /api/recipes bisher scheiterte
          difficulty: "Einfach",
          ingredients: [
            { amount: 0, unit: "Prise", name: "Salz", notes: null },
            { amount: 1, unit: null, name: "", notes: null },
            { amount: 200, unit: "g", name: "Mehl", notes: null },
          ],
          instructions: "1. Mischen.\n2. Backen.",
          tags: Array.from({ length: 25 }, (_, i) => `Tag ${i}`),
          image_url: null,
          source_type: "url_import",
          imageId: null,
        }),
      });
    });

    await page.goto(
      `/rezepte/importieren?url=${encodeURIComponent("https://example.com/rezept")}`,
    );
    const speichern = page.getByRole("button", { name: "Rezept speichern" });
    await expect(speichern).toBeVisible({ timeout: 15_000 });

    // Das Select zeigt den normalisierten Wert — vorher blieb es leer.
    await expect(page.getByRole("dialog").locator("select")).toHaveValue(
      "einfach",
    );

    await speichern.click();
    await expect(page).toHaveURL(/\/rezepte\/[0-9a-f-]{36}$/, {
      timeout: 15_000,
    });
    const recipeId = page.url().split("/").pop()!;

    try {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expect(page.getByText("Einfach").first()).toBeVisible();
      // Zutat ohne Namen wurde verworfen, «Salz» ohne Menge behalten.
      await expect(page.getByText("Salz")).toBeVisible();
      await expect(page.getByText("Mehl")).toBeVisible();
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });

  test("Validierungsfehler des Servers nennen das betroffene Feld", async ({
    page,
  }) => {
    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "x",
          instructions: "y",
          difficulty: "Einfach",
        }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(resp.status).toBe(400);
    expect(resp.body.details?.fieldErrors?.difficulty?.[0]).toBeTruthy();
  });
});

// ── 21.1 · Kochhistorie ───────────────────────────────────────────────────────

test.describe("Phase 21.1 – Kochhistorie", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("Heute gekocht → Kochmodus «Fertig» → Karte, Dashboard, Loeschen", async ({ page }) => {
    const title = `Kochlog-${RUN_ID}`;
    const recipeId = await createRecipeViaApi(page, {
      title,
      instructions: "1. Zwiebeln anduensten.\n2. Servieren.",
      ingredients: [{ name: "Zwiebel", amount: 2, unit: "Stk." }],
    });

    try {
      // 1. Detailseite: noch nie gekocht → «Heute gekocht»
      await page.goto(`/rezepte/${recipeId}`);
      const summary = page.getByTestId("cook-log-summary");
      await expect(summary).toHaveText("Noch nie gekocht");
      await page.getByTestId("cook-log-today").click();
      await expect(summary).toContainText("Gekocht: 1×");
      await expect(summary).toContainText("zuletzt heute");

      // 2. Nachtrag mit anderem Datum
      await page.getByTestId("cook-log-other-date").click();
      await page.getByTestId("cook-log-date-input").fill("2026-08-01");
      await page.getByRole("button", { name: "Eintragen" }).click();
      await expect(summary).toContainText("Gekocht: 2×");
      await expect(page.getByTestId("cook-log-list").locator("li")).toHaveCount(2);

      // 3. Kochmodus: «Fertig» fragt nach und traegt ein
      await page.getByTestId("cooking-mode-button").click();
      await expect(page.getByTestId("cooking-mode")).toBeVisible();
      await page.getByTestId("next-step").click(); // Schritt 2
      await expect(page.getByTestId("next-step")).toHaveText("Fertig");
      await page.getByTestId("next-step").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("Als gekocht eintragen?");
      await dialog.getByRole("button", { name: "Ja, eintragen" }).click();
      await expect(page).toHaveURL(`/rezepte/${recipeId}`, { timeout: 10_000 });
      await expect(page.getByTestId("cook-log-summary")).toContainText("Gekocht: 3×");

      // 4. Rezeptkarte zeigt den Zaehler
      await page.goto(`/rezepte?q=${encodeURIComponent(title)}`);
      const card = page.locator("article", { hasText: title }).first();
      await expect(card.getByTestId("cook-count")).toHaveText(/3× gekocht/);

      // 5. Dashboard-Widget listet das Rezept
      await page.goto("/");
      await expect(page.getByTestId("cook-history-recent")).toContainText(title);

      // 6. Eintrag entfernen
      await page.goto(`/rezepte/${recipeId}`);
      await page.getByTestId("cook-log-remove").first().click();
      await expect(page.getByTestId("cook-log-summary")).toContainText("Gekocht: 2×");
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });

  test("Kochmodus «Fertig» mit «Nein» schreibt keinen Eintrag", async ({ page }) => {
    const recipeId = await createRecipeViaApi(page, {
      title: `Kochlog-Nein-${RUN_ID}`,
      instructions: "Alles mischen.",
      ingredients: [{ name: "Mehl", amount: 100, unit: "g" }],
    });
    try {
      await page.goto(`/rezepte/${recipeId}/kochmodus`);
      await page.getByTestId("next-step").click();
      await page.getByRole("dialog").getByRole("button", { name: "Nein" }).click();
      await expect(page).toHaveURL(`/rezepte/${recipeId}`, { timeout: 10_000 });
      await expect(page.getByTestId("cook-log-summary")).toHaveText("Noch nie gekocht");
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });

  test("API lehnt Zukunftsdaten und fremde Eintraege ab", async ({ page }) => {
    const recipeId = await createRecipeViaApi(page, {
      title: `Kochlog-Api-${RUN_ID}`,
      instructions: "Kochen.",
      ingredients: [],
    });
    try {
      const result = await page.evaluate(async (id: string) => {
        const zukunft = await fetch(`/api/recipes/${id}/gekocht`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookedOn: "2099-01-01" }),
        });
        const fremd = await fetch(`/api/recipes/${id}/gekocht/00000000-0000-4000-8000-000000000000`, {
          method: "DELETE",
        });
        return { zukunft: zukunft.status, fremd: fremd.status };
      }, recipeId);
      expect(result.zukunft).toBe(400);
      expect(result.fremd).toBe(404);
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });
});

// ── 21.2 · Schritte mit Zutaten-Verknuepfung ─────────────────────────────────

test.describe("Phase 21.2 – Zutaten je Schritt", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("Kochmodus hebt Zutaten im Schritt hervor, skaliert und listet den Rest", async ({ page }) => {
    const recipeId = await createRecipeViaApi(page, {
      title: `Schritte-${RUN_ID}`,
      instructions:
        "1. Die Zwiebeln im Olivenöl 5 Minuten andünsten.\n2. Mit Petersilie bestreuen und servieren.",
      servings: 4,
      ingredients: [
        { name: "Zwiebel", amount: 2, unit: "Stk." },
        { name: "Olivenöl", amount: 1, unit: "EL" },
        { name: "Petersilie" },
        { name: "Salz" },
      ],
    });

    try {
      // Doppelte Portionen: aus 2 Stk. werden 4 Stk.
      await page.goto(`/rezepte/${recipeId}/kochmodus?portionen=8`);
      const stepText = page.getByTestId("step-text");
      const marks = stepText.locator("mark");
      await expect(marks).toHaveCount(2);
      await expect(marks.nth(0)).toContainText("Zwiebeln");
      await expect(marks.nth(0)).toContainText("4 Stk.");
      await expect(marks.nth(1)).toContainText("Olivenöl");
      await expect(marks.nth(1)).toContainText("2 EL");
      // Timer-Knopf bleibt trotz Zutaten-Markierung erhalten
      await expect(page.getByTestId("timer-button-0-0")).toBeVisible();

      const panel = page.getByTestId("step-ingredients");
      await expect(panel).toBeVisible();
      await expect(panel.locator("li")).toHaveCount(2);

      // Overlay: «Salz» taucht in keinem Schritt auf → «Weitere Zutaten»
      await page.getByTestId("show-ingredients-button").click();
      const unmatched = page.getByTestId("ingredients-unmatched");
      await expect(unmatched).toContainText("Weitere Zutaten");
      await expect(unmatched).toContainText("Salz");
      await expect(unmatched).not.toContainText("Zwiebel");
      await page.getByTestId("close-ingredients").click();

      // Schritt 2: nur Petersilie, kein Panel-Eintrag fuer Zwiebeln
      await page.getByTestId("next-step").click();
      await expect(page.getByTestId("step-ingredients").locator("li")).toHaveCount(1);
      await expect(page.getByTestId("step-ingredients")).toContainText("Petersilie");

      // Detailseite: nummerierte Schritte mit Zutatenzeile
      await page.goto(`/rezepte/${recipeId}`);
      await expect(page.getByTestId("instruction-step")).toHaveCount(2);
      const lines = page.getByTestId("step-ingredient-line");
      await expect(lines.nth(0)).toContainText("2 Stk. Zwiebel");
      await expect(lines.nth(0)).toContainText("1 EL Olivenöl");
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });

  test("Schritt ohne Zutaten zeigt kein leeres Panel", async ({ page }) => {
    const recipeId = await createRecipeViaApi(page, {
      title: `Schritte-leer-${RUN_ID}`,
      instructions: "Ofen auf 180 °C vorheizen.",
      ingredients: [{ name: "Mehl", amount: 200, unit: "g" }],
    });
    try {
      await page.goto(`/rezepte/${recipeId}/kochmodus`);
      await expect(page.getByTestId("step-text")).toBeVisible();
      await expect(page.getByTestId("step-ingredients")).toHaveCount(0);
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });
});

// ── 21.3 · Daten-Export und Backup ───────────────────────────────────────────

test.describe("Phase 21.3 – Backup", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("Backup herunterladen → erneut einspielen ueberspringt Duplikate → geaendertes Backup importiert", async ({
    page,
  }) => {
    const title = `Backup-${RUN_ID}`;
    const recipeId = await createRecipeViaApi(page, {
      title,
      instructions: "Kochen.",
      ingredients: [{ name: "Mehl", amount: 100, unit: "g" }],
      tags: ["Backup-Test"],
    });
    // Kochlog + Notiz, damit auch Nebentabellen im Backup landen
    await page.evaluate(async (id: string) => {
      await fetch(`/api/recipes/${id}/gekocht`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookedOn: "2026-08-01", servings: 4 }),
      });
      await fetch(`/api/notes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Backup-Notiz", noteType: "tipp" }),
      });
    }, recipeId);

    const importedIds: string[] = [];
    try {
      // 1. Download ueber die Einstellungsseite
      await page.goto("/einstellungen");
      const downloadPromise = page.waitForEvent("download");
      await page.getByTestId("backup-download").click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^rezeptmeister-backup-\d{4}-\d{2}-\d{2}\.json$/);
      const filePath = await download.path();
      const backup = JSON.parse(fs.readFileSync(filePath!, "utf-8"));
      expect(backup.format).toBe("rezeptmeister-backup");
      const exported = backup.recipes.find((r: { title: string }) => r.title === title);
      expect(exported).toBeTruthy();
      expect(exported.cookLogs).toHaveLength(1);
      expect(exported.notes).toHaveLength(1);
      expect(JSON.stringify(backup)).not.toContain("embedding");

      // 2. Dasselbe Backup nochmals einspielen → alles uebersprungen
      const again = await page.evaluate(async (b: unknown) => {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        });
        return { status: res.status, body: await res.json() };
      }, backup);
      expect(again.status).toBe(201);
      expect(again.body.imported.recipes).toBe(0);
      expect(again.body.skipped.recipes).toBe(backup.recipes.length);

      // 3. Geaenderter Titel → wird als neues Rezept importiert, samt Kochlog/Notiz
      const changedTitle = `${title}-Kopie`;
      const changed = {
        ...backup,
        recipes: [{ ...exported, title: changedTitle }],
        collections: [],
        mealPlans: [],
        shoppingList: [],
      };
      await page.goto("/einstellungen");
      const tmp = path.join(__dirname, `.tmp-backup-${RUN_ID}.json`);
      fs.writeFileSync(tmp, JSON.stringify(changed));
      try {
        await page.getByTestId("backup-file-input").setInputFiles(tmp);
        const dialog = page.getByRole("dialog");
        await expect(dialog).toContainText("1 Rezepten");
        await dialog.getByRole("button", { name: "Einspielen" }).click();
        await expect(page.getByTestId("backup-result")).toContainText("Importiert: 1 Rezepte, 1 Notizen, 1 Kochlog");
      } finally {
        fs.unlinkSync(tmp);
      }

      await page.goto(`/rezepte?q=${encodeURIComponent(changedTitle)}`);
      const card = page.locator("article", { hasText: changedTitle }).first();
      await expect(card).toBeVisible();
      const newId = await page.evaluate(async (t: string) => {
        const res = await fetch(`/api/recipes?q=${encodeURIComponent(t)}`);
        const data = await res.json();
        return data.recipes.find((r: { title: string }) => r.title === t)?.id as string;
      }, changedTitle);
      importedIds.push(newId);
      await expect(card.getByTestId("cook-count")).toHaveText(/1× gekocht/);
    } finally {
      await deleteRecipeViaApi(page, recipeId);
      for (const id of importedIds) await deleteRecipeViaApi(page, id);
    }
  });

  test("Import lehnt fremde Dateien ab", async ({ page }) => {
    const resp = await page.evaluate(async () => {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "paprika", recipes: [] }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(resp.status).toBe(400);
    expect(resp.body.error).toContain("kein gültiges Rezeptmeister-Backup");
  });
});

// ── 21.5 · Ersatz-Assistent ──────────────────────────────────────────────────

const SUBSTITUTE_STUB = {
  substitutes: [
    { name: "Sauerrahm", amount_hint: "2 dl", effect: "Etwas säuerlicher, gleiche Bindung.", confidence: "gut" },
    { name: "Vollrahm mit Zitrone", amount_hint: "2 dl + 1 TL", effect: "Milder, etwas dünner.", confidence: "brauchbar" },
    { name: "Naturjoghurt", amount_hint: "2 dl", effect: "Kann bei Hitze ausflocken — erst am Schluss zugeben.", confidence: "notloesung" },
  ],
  note: "Sauce ggf. 2 Minuten länger einkochen.",
};

test.describe("Phase 21.5 – Ersatz-Assistent", () => {
  // Der Schluessel haengt an einem Konto, das sich alle Spec-Dateien teilen.
  test.beforeAll(async () => {
    await acquireLock(GEMINI_KEY_LOCK);
  });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    // Platzhalter-Schluessel: der KI-Aufruf wird in den Tests abgefangen.
    const status = await page.evaluate(async () => {
      const res = await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "AIzaSyTestPlaceholderKey000000000000000", provider: "gemini" }),
      });
      return res.status;
    });
    expect(status).toBeLessThan(300);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    try {
      if (!holdsLock(GEMINI_KEY_LOCK)) return;
      const page = await browser.newPage();
      await loginAdmin(page);
      await page.evaluate(() => fetch("/api/settings/api-key", { method: "DELETE" }));
      await page.close();
    } finally {
      releaseLock(GEMINI_KEY_LOCK);
    }
  });

  test("Detailseite: Ersatz-Knopf → drei Vorschlaege → Original auf die Einkaufsliste", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, {
      title: `Ersatz-${RUN_ID}`,
      instructions: "Alles vermengen.",
      ingredients: [
        { name: "Crème fraîche", amount: 2, unit: "dl" },
        { name: "Kalbfleisch", amount: 500, unit: "g" },
      ],
    });
    const calls: unknown[] = [];
    await page.route("**/api/ai/substitute", async (route) => {
      calls.push(route.request().postDataJSON());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUBSTITUTE_STUB) });
    });

    try {
      await page.goto(`/rezepte/${recipeId}`);
      const buttons = page.getByTestId("substitute-button");
      await expect(buttons).toHaveCount(2);
      await buttons.first().click();

      const dialog = page.getByTestId("substitution-dialog");
      await expect(dialog).toBeVisible();
      await page.getByTestId("substitution-reason-2").click(); // Laktosefrei
      await page.getByTestId("substitution-ask").click();

      await expect(page.getByTestId("substitution-item")).toHaveCount(3);
      await expect(page.getByTestId("substitution-results")).toContainText("Sauerrahm");
      await expect(page.getByTestId("substitution-results")).toContainText("Notlösung");
      await expect(page.getByTestId("substitution-note")).toContainText("2 Minuten");

      const sent = calls[0] as { ingredient: string; dietary: string[]; other_ingredients: string[]; amount: number };
      expect(sent.ingredient).toBe("Crème fraîche");
      expect(sent.dietary).toEqual(["Laktosefrei"]);
      expect(sent.other_ingredients).toEqual(["Kalbfleisch"]);
      expect(sent.amount).toBe(2);

      await page.getByRole("button", { name: "Original auf die Einkaufsliste" }).click();
      await page.getByRole("button", { name: "Fertig" }).click();
      await expect(dialog).toHaveCount(0);

      const items = await page.evaluate(async () => {
        const res = await fetch("/api/shopping-list");
        const data = await res.json();
        return (data.items ?? data) as { ingredientName: string; id: string }[];
      });
      const hit = items.find((i) => i.ingredientName === "Crème fraîche");
      expect(hit).toBeTruthy();
      await page.evaluate((id: string) => fetch(`/api/shopping-list/${id}`, { method: "DELETE" }), hit!.id);
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });

  test("Kochmodus: Ersatz-Knopf im Schritt-Panel; Fehlermeldung des Backends wird angezeigt", async ({ page }) => {
    await loginAdmin(page);
    const recipeId = await createRecipeViaApi(page, {
      title: `Ersatz-Koch-${RUN_ID}`,
      instructions: "Butter schmelzen.",
      ingredients: [{ name: "Butter", amount: 50, unit: "g" }],
    });
    await page.route("**/api/ai/substitute", (route) =>
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: "Kontingent des KI-Schlüssels erschöpft — bitte später erneut versuchen." }),
      }),
    );
    try {
      await page.goto(`/rezepte/${recipeId}/kochmodus`);
      await page.getByTestId("step-ingredients").getByTestId("substitute-button").click();
      await page.getByTestId("substitution-ask").click();
      await expect(page.getByTestId("substitution-error")).toContainText("Kontingent");
    } finally {
      await deleteRecipeViaApi(page, recipeId);
    }
  });
});

// ── 21.4 · KI-Wochenplan ─────────────────────────────────────────────────────

/** Montag der Woche, die 8 Wochen in der Zukunft liegt — kollidiert mit nichts. */
function testWeekMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 56);
  const day = (d.getDay() + 6) % 7; // 0 = Montag
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

test.describe("Phase 21.4 – KI-Wochenplan (Bulk-Endpunkt und Dialog)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("Bulk-Endpunkt: einfuegen, ohne overwrite ueberspringen, mit overwrite ersetzen, fremde ID 404", async ({ page }) => {
    const monday = testWeekMonday();
    const a = await createRecipeViaApi(page, { title: `Plan-A-${RUN_ID}`, instructions: "Kochen.", ingredients: [] });
    const b = await createRecipeViaApi(page, { title: `Plan-B-${RUN_ID}`, instructions: "Kochen.", ingredients: [] });
    try {
      const res = await page.evaluate(
        async (args: { monday: string; a: string; b: string; tue: string }) => {
          const post = async (body: unknown) => {
            const r = await fetch("/api/meal-plans/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            return { status: r.status, body: await r.json() };
          };
          const first = await post({
            entries: [
              { date: args.monday, mealType: "abendessen", recipeId: args.a },
              { date: args.tue, mealType: "abendessen", recipeId: args.b },
            ],
          });
          const again = await post({
            entries: [
              { date: args.monday, mealType: "abendessen", recipeId: args.b },
              { date: args.tue, mealType: "abendessen", recipeId: args.a },
            ],
          });
          const overwrite = await post({
            overwrite: true,
            entries: [{ date: args.monday, mealType: "abendessen", recipeId: args.b }],
          });
          const fremd = await post({
            entries: [{ date: args.monday, mealType: "mittagessen", recipeId: "00000000-0000-4000-8000-000000000000" }],
          });
          const doppelt = await post({
            entries: [
              { date: args.monday, mealType: "snack", recipeId: args.a },
              { date: args.monday, mealType: "snack", recipeId: args.b },
            ],
          });
          const week = await fetch(`/api/meal-plans?start=${args.monday}&end=${args.tue}`).then((r) => r.json());
          return { first, again, overwrite, fremd, doppelt, week };
        },
        { monday, a, b, tue: plusDays(monday, 1) },
      );
      expect(res.first.status).toBe(201);
      expect(res.first.body.entries).toHaveLength(2);
      expect(res.again.status).toBe(201);
      expect(res.again.body.entries).toHaveLength(0);
      expect(res.again.body.skipped).toBe(2);
      expect(res.overwrite.status).toBe(201);
      expect(res.overwrite.body.entries[0].recipeId).toBe(b);
      expect(res.fremd.status).toBe(404);
      expect(res.doppelt.status).toBe(400);
      const mondayEntry = res.week.entries.find((e: { date: string; mealType: string }) => e.date === monday && e.mealType === "abendessen");
      expect(mondayEntry.recipeId).toBe(b);
    } finally {
      // Cascade: Loeschen der Rezepte raeumt die Plan-Eintraege mit auf
      await deleteRecipeViaApi(page, a);
      await deleteRecipeViaApi(page, b);
    }
  });

});

test.describe("Phase 21.4 – KI-Wochenplan Dialog (Platzhalter-Schlüssel, KI gestubbt)", () => {
  test.beforeAll(async () => {
    await acquireLock(GEMINI_KEY_LOCK);
  });
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await page.evaluate(async () => {
      await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "AIzaSyTestPlaceholderKey000000000000000", provider: "gemini" }),
      });
    });
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    try {
      if (!holdsLock(GEMINI_KEY_LOCK)) return;
      const page = await browser.newPage();
      await loginAdmin(page);
      await page.evaluate(() => fetch("/api/settings/api-key", { method: "DELETE" }));
      await page.close();
    } finally {
      releaseLock(GEMINI_KEY_LOCK);
    }
  });

  test("Dialog: Standard Mo–So nur Abendessen; Vorschau ueber gestubbte KI; Uebernehmen schreibt den Plan", async ({ page }) => {
    await loginAdmin(page);
    const monday = testWeekMonday();
    const a = await createRecipeViaApi(page, { title: `Plan-Dialog-A-${RUN_ID}`, instructions: "Kochen.", ingredients: [], tags: ["Vegetarisch"], cuisine: "Italienisch" });
    const b = await createRecipeViaApi(page, { title: `Plan-Dialog-B-${RUN_ID}`, instructions: "Kochen.", ingredients: [], cuisine: "Thai" });

    // KI-Antwort stubben — Rueckabbildung, Vorschau und Bulk laufen echt.
    await page.route("**/api/ai/plan-week", async (route) => {
      const req = route.request().postDataJSON() as { days: number[]; mealTypes: string[] };
      const proposals = [
        { key: `${monday}-abendessen`, date: monday, mealType: "abendessen", recipeId: a, recipeTitle: `Plan-Dialog-A-${RUN_ID}`, recipeServings: 4, newTitle: null, newDescription: null, reason: "Vegetarisch und lange nicht gekocht.", isFallback: false, leftoverOfDate: null },
        { key: `${plusDays(monday, 1)}-abendessen`, date: plusDays(monday, 1), mealType: "abendessen", recipeId: b, recipeTitle: `Plan-Dialog-B-${RUN_ID}`, recipeServings: 4, newTitle: null, newDescription: null, reason: "Andere Küche als am Montag.", isFallback: true, leftoverOfDate: null },
        { key: `${plusDays(monday, 2)}-abendessen`, date: plusDays(monday, 2), mealType: "abendessen", recipeId: null, recipeTitle: null, recipeServings: null, newTitle: "Fischknusperli", newDescription: "Knusprig aus dem Ofen.", reason: "Wunsch nach Fisch.", isFallback: false, leftoverOfDate: null },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ proposals, skippedOccupied: 0, notes: [], echo: req }),
      });
    });

    try {
      await page.goto("/wochenplan");
      const aiButton = page.getByTestId("meal-plan-ai-button");
      await expect(aiButton).toBeEnabled();

      // Zur Testwoche navigieren (8 Wochen vor)
      for (let i = 0; i < 8; i++) await page.getByTestId("meal-plan-next-week").click();
      await aiButton.click();

      const form = page.getByTestId("plan-week-form");
      await expect(form).toBeVisible();
      for (let d = 0; d < 7; d++) await expect(page.getByTestId(`plan-week-day-${d}`)).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("plan-week-meal-abendessen")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("plan-week-meal-mittagessen")).toHaveAttribute("aria-pressed", "false");
      await expect(form).toContainText("7 Plätze");

      await page.getByTestId("plan-week-submit").click();
      const preview = page.getByTestId("plan-week-preview");
      await expect(preview).toBeVisible();
      await expect(preview.getByTestId(`plan-week-proposal-${monday}-abendessen`)).toContainText("Vegetarisch und lange nicht gekocht");
      await expect(preview.getByTestId(`plan-week-proposal-${plusDays(monday, 1)}-abendessen`)).toContainText("automatisch ergänzt");
      await expect(preview.getByTestId(`plan-week-proposal-${plusDays(monday, 2)}-abendessen`)).toContainText("Neu");
      // Neue Vorschlaege zaehlen nicht zum Uebernehmen
      await expect(page.getByTestId("plan-week-apply")).toHaveText("Übernehmen (2)");

      await page.getByTestId(`plan-week-remove-${plusDays(monday, 1)}-abendessen`).click();
      await expect(page.getByTestId("plan-week-apply")).toHaveText("Übernehmen (1)");
      await page.getByTestId("plan-week-apply").click();
      await expect(page.getByTestId("plan-week-preview")).toHaveCount(0);

      const week = await page.evaluate(
        async (args: { monday: string }) => fetch(`/api/meal-plans?start=${args.monday}&end=${args.monday}`).then((r) => r.json()),
        { monday },
      );
      expect(week.entries).toHaveLength(1);
      expect(week.entries[0].recipeId).toBe(a);
    } finally {
      await deleteRecipeViaApi(page, a);
      await deleteRecipeViaApi(page, b);
    }
  });
});

test.describe("Phase 21.4 – KI-Wochenplan Live (mit API-Schlüssel)", () => {
  test.beforeAll(async () => {
    await acquireLock(GEMINI_KEY_LOCK);
  });
  test.describe.configure({ mode: "serial" });
  test.skip(!GEMINI_TEST_KEY, "GEMINI_TEST_KEY nicht gesetzt – Live-Test übersprungen");

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    await page.evaluate(async (key: string) => {
      await fetch("/api/settings/api-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key, provider: "gemini" }),
      });
    }, GEMINI_TEST_KEY);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    try {
      if (!holdsLock(GEMINI_KEY_LOCK)) return;
      const page = await browser.newPage();
      await loginAdmin(page);
      await page.evaluate(() => fetch("/api/settings/api-key", { method: "DELETE" }));
      await page.close();
    } finally {
      releaseLock(GEMINI_KEY_LOCK);
    }
  });

  test("Ersatz-Assistent liefert drei Vorschlaege mit Menge und Wirkung", async ({ page }) => {
    await loginAdmin(page);
    const result = await callLiveAi(() =>
      page.evaluate(async () => {
        const res = await fetch("/api/ai/substitute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ingredient: "Crème fraîche",
            amount: 2,
            unit: "dl",
            recipe_title: "Zürcher Geschnetzeltes",
            other_ingredients: ["Kalbfleisch", "Champignons", "Weisswein"],
            dietary: ["Laktosefrei"],
            reason: "soll laktosefrei sein",
          }),
        });
        return { status: res.status, body: await res.json() };
      }),
    );
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const body = result.body as { substitutes: { name: string; amount_hint: string; effect: string; confidence: string }[] };
    expect(body.substitutes).toHaveLength(3);
    for (const s of body.substitutes) {
      expect(s.name.length).toBeGreaterThan(1);
      expect(s.effect.length).toBeGreaterThan(10);
      expect(["gut", "brauchbar", "notloesung"]).toContain(s.confidence);
    }
  });

  test("plant zwei Tage aus den eigenen Rezepten", async ({ page }) => {
    await loginAdmin(page);
    const monday = testWeekMonday();
    const ids = [
      await createRecipeViaApi(page, { title: `Live-Plan-Rösti-${RUN_ID}`, instructions: "Kochen.", ingredients: [{ name: "Kartoffeln", amount: 800, unit: "g" }], cuisine: "Schweizer", totalTimeMinutes: 30 }),
      await createRecipeViaApi(page, { title: `Live-Plan-Curry-${RUN_ID}`, instructions: "Kochen.", ingredients: [{ name: "Kokosmilch", amount: 4, unit: "dl" }], cuisine: "Thai", tags: ["Vegetarisch"], totalTimeMinutes: 25 }),
      await createRecipeViaApi(page, { title: `Live-Plan-Pasta-${RUN_ID}`, instructions: "Kochen.", ingredients: [{ name: "Spaghetti", amount: 400, unit: "g" }], cuisine: "Italienisch", totalTimeMinutes: 20 }),
    ];
    try {
      const result = await callLiveAi(() =>
        page.evaluate(async (weekStart: string) => {
          const res = await fetch("/api/ai/plan-week", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weekStart, days: [0, 1], mealTypes: ["abendessen"], vegetarianMin: 1, varyCuisine: true }),
          });
          return { status: res.status, body: await res.json() };
        }, monday),
      );
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      const body = result.body as { proposals: { recipeId: string | null; reason: string; date: string }[] };
      expect(body.proposals).toHaveLength(2);
      for (const p of body.proposals) {
        expect(p.recipeId && p.reason.length > 5).toBeTruthy();
      }
      expect(new Set(body.proposals.map((p) => p.date)).size).toBe(2);
    } finally {
      for (const id of ids) await deleteRecipeViaApi(page, id);
    }
  });
});
