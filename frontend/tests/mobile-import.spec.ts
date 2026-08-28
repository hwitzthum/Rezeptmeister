/**
 * C1.4 — Share-Target und Kurzbefehl fuellen den URL-Dialog vor.
 *
 * Der Android-Teilen-Sheet ruft `/rezepte/importieren` mit `url`, `text` oder
 * `title` auf — welche Felder gefuellt sind, entscheidet die teilende App.
 * Der iOS-Kurzbefehl haengt die Adresse unkodiert an `?url=` an. Alle drei
 * Faelle muessen im Dialog landen.
 *
 * `/api/ai/import-url` ist abgefangen: geprueft wird die Uebergabe der Adresse,
 * nicht die Importqualitaet.
 */

import type { Page, Request } from "@playwright/test";
import { test, expect, ADMIN_EMAIL, ADMIN_PASSWORD, CREDS_AVAILABLE, RUN_ID } from "./mobile-helpers";

test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

const SHARED_URL = "https://beispiel.test/rezepte/zuercher-geschnetzeltes";

function importStub(title: string) {
  return {
    title,
    description: null,
    servings: 4,
    prep_time_minutes: 10,
    cook_time_minutes: 20,
    difficulty: "einfach",
    ingredients: [{ name: "Kalbfleisch", amount: 600, unit: "g" }],
    instructions: "Schritt 1: Fleisch anbraten.",
    tags: [],
    source_type: "url",
  };
}

/** Faengt den Import ab; `fail` laesst den Dialog auf dem Adress-Schritt stehen. */
async function stubImport(page: Page, title: string, fail = false) {
  const calls: Request[] = [];
  await page.route("**/api/ai/import-url", async (route) => {
    calls.push(route.request());
    if (fail) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: "Testabbruch — Adresse bleibt im Feld." }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(importStub(title)),
    });
  });
  return calls;
}

test.describe("C1.4 — Geteilte Adresse", () => {
  test("Das Manifest schickt geteilte Links auf die Import-Seite", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = (await res.json()) as {
      share_target?: { action?: string; method?: string; params?: Record<string, string> };
    };
    expect(manifest.share_target?.action).toBe("/rezepte/importieren");
    expect(manifest.share_target?.method?.toUpperCase()).toBe("GET");
    expect(manifest.share_target?.params).toMatchObject({
      title: "title",
      text: "text",
      url: "url",
    });
  });

  test("`?url=` startet den Import mit genau dieser Adresse", async ({ page }) => {
    const title = `Geteilt-${RUN_ID}`;
    const calls = await stubImport(page, title);

    await page.goto(`/rezepte/importieren?url=${encodeURIComponent(SHARED_URL)}`);

    // Die Seite zeigt die uebernommene Adresse …
    await expect(page.getByTestId("import-shared-url")).toHaveText(SHARED_URL);

    // … und der Dialog laeuft von selbst weiter (autoStart) bis zur Vorschau.
    await expect.poll(() => calls.length, { timeout: 15_000 }).toBe(1);
    expect((calls[0].postDataJSON() as { url?: string }).url).toBe(SHARED_URL);
    await expect(
      page.getByRole("dialog").locator('input[type="text"]').first(),
    ).toHaveValue(title, { timeout: 15_000 });
  });

  test("`?text=` aus dem Android-Sheet fuellt das Adressfeld vor", async ({ page }) => {
    // Viele Apps teilen „Titel https://…" im Textfeld und lassen `url` leer.
    const calls = await stubImport(page, `Text-${RUN_ID}`, true);

    const text = `Zürcher Geschnetzeltes ${SHARED_URL}`;
    await page.goto(
      `/rezepte/importieren?title=${encodeURIComponent("Rezept")}&text=${encodeURIComponent(text)}`,
    );

    await expect(page.getByTestId("import-shared-url")).toHaveText(SHARED_URL);
    // Der Import scheitert im Test bewusst — dadurch bleibt das Feld sichtbar
    // und die vorbefuellte Adresse pruefbar.
    await expect.poll(() => calls.length, { timeout: 15_000 }).toBe(1);
    await expect(page.getByTestId("url-import-input")).toHaveValue(SHARED_URL);
  });

  test("Ohne Parameter bleibt die Seite bedienbar und startet nichts von selbst", async ({
    page,
  }) => {
    const calls = await stubImport(page, `Leer-${RUN_ID}`);

    await page.goto("/rezepte/importieren");
    await expect(page.getByTestId("import-page")).toBeVisible();
    await expect(page.getByTestId("import-shared-url")).toHaveCount(0);
    await expect(page.getByTestId("url-import-input")).toHaveValue("");
    expect(calls).toHaveLength(0);
  });

  test("Das Adressfeld behaelt den Fokus waehrend der Eingabe", async ({ page }) => {
    // Auf dem iPhone schloss sich die Tastatur nach dem ersten Buchstaben:
    // die Eingabe verlor den Fokus, das Feld blieb fast leer zurueck.
    await stubImport(page, `Tippen-${RUN_ID}`, true);
    await page.goto("/rezepte/importieren");

    const feld = page.getByTestId("url-import-input");
    await expect(feld).toBeVisible();
    await feld.tap();
    await feld.pressSequentially(SHARED_URL, { delay: 30 });

    // Jedes Zeichen ist angekommen …
    await expect(feld).toHaveValue(SHARED_URL);
    // … und der Fokus liegt immer noch im Feld (sonst faellt die Tastatur zu).
    await expect(feld).toBeFocused();
  });

  test("Die geteilte Adresse ueberlebt die Anmeldung", async ({ browser }) => {
    // Eigener, abgemeldeter Kontext — die geteilte Sitzung waere hier falsch.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    // Der reale Kaltstart: geteilt wird aus einer anderen App, die PWA ist noch
    // nicht angemeldet. Verwirft der Login-Redirect die Query, ist die Adresse weg.
    const title = `Kaltstart-${RUN_ID}`;
    const calls = await stubImport(page, title);

    const target = `/rezepte/importieren?url=${encodeURIComponent(SHARED_URL)}`;
    await page.goto(target);
    await expect(page).toHaveURL(/\/auth\/anmelden/);

    await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page).toHaveURL(/\/rezepte\/importieren\?/, { timeout: 20_000 });
    await expect(page.getByTestId("import-shared-url")).toHaveText(SHARED_URL);
    await expect.poll(() => calls.length, { timeout: 15_000 }).toBe(1);

    await context.close();
  });
});
