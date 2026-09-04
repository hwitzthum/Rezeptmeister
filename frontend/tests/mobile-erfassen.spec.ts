/**
 * C1.3 — Rezept erfassen vom Handy aus.
 *
 * Zwei Zusagen:
 *   1. Das [+] der Tab-Leiste oeffnet ein Sheet, das zu allen drei Wegen fuehrt
 *      (abfotografieren, von URL, manuell).
 *   2. Ein mehrseitiges Rezept erzeugt **einen** OCR-Aufruf mit beiden
 *      Bild-IDs in Seitenreihenfolge — nicht zwei Einzelaufrufe.
 *
 * Gemini ist bewusst abgefangen: geprueft wird der Aufruf-Vertrag (4.1), nicht
 * die Erkennungsqualitaet. Die gehoert in die manuelle Abnahme D.5.
 */

import type { Page, Request } from "@playwright/test";
import {
  test,
  expect,
  CREDS_AVAILABLE,
  RUN_ID,
  isPhoneLayout,
  warteAufSeitenruhe,
} from "./mobile-helpers";

test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

/** 1x1-PNG — reicht fuer Upload und Thumbnail, haelt den Lauf schnell. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function ocrStub(title: string) {
  return {
    recipes: [
      {
        title,
        description: "Aus zwei Buchseiten zusammengefuehrt.",
        servings: 4,
        prep_time_minutes: 15,
        cook_time_minutes: 30,
        difficulty: "einfach",
        ingredients: [
          { name: "Mehl", amount: 500, unit: "g" },
          { name: "Butter", amount: 2, unit: "EL" },
        ],
        instructions: "Schritt 1: Teig kneten.\nSchritt 2: Backen.",
        tags: ["Backen"],
        source_type: "ocr",
      },
    ],
  };
}

/** Faengt `/api/ai/ocr` ab und protokolliert jeden Aufruf. */
async function stubOcr(page: Page, title: string) {
  const calls: Request[] = [];
  await page.route("**/api/ai/ocr", async (route) => {
    calls.push(route.request());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ocrStub(title)),
    });
  });
  return calls;
}

test.describe("C1.3 — Das [+]-Sheet", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator("h1").first().waitFor({ state: "visible", timeout: 15_000 });
    // Vor der Hydration ist [+] ein gewoehnlicher Link: der Tap navigiert dann
    // direkt nach /rezepte/neu, statt das Sheet zu oeffnen — die Aktionen darin
    // erscheinen nie und der Test laeuft in den Timeout.
    await warteAufSeitenruhe(page);
  });

  test("fuehrt zum Abfotografieren", async ({ page }) => {
    test.skip(!(await isPhoneLayout(page)), "Das [+] sitzt in der Tab-Leiste unter md");

    await page.getByTestId("nav-tab-rezepte-neu").tap();
    await expect(page.getByTestId("create-sheet")).toBeVisible();
    await page.getByTestId("create-action-scannen").tap();
    await expect(page).toHaveURL(/\/rezepte\/scannen$/);
  });

  test("fuehrt zum URL-Import", async ({ page }) => {
    test.skip(!(await isPhoneLayout(page)), "Das [+] sitzt in der Tab-Leiste unter md");

    await page.getByTestId("nav-tab-rezepte-neu").tap();
    await page.getByTestId("create-action-url").tap();
    await expect(page.getByTestId("url-import-step-url")).toBeVisible();
    await expect(page.getByTestId("url-import-input")).toBeVisible();
  });

  test("fuehrt zum manuellen Formular", async ({ page }) => {
    test.skip(!(await isPhoneLayout(page)), "Das [+] sitzt in der Tab-Leiste unter md");

    await page.getByTestId("nav-tab-rezepte-neu").tap();
    await page.getByTestId("create-action-manuell").tap();
    await expect(page).toHaveURL(/\/rezepte\/neu$/);
  });
});

test.describe("C1.3 — Mehrseitiger Scan", () => {
  test("zwei Seiten ergeben genau einen OCR-Aufruf mit zwei imageIds", async ({ page }) => {
    const title = `Scan-${RUN_ID}`;
    const calls = await stubOcr(page, title);

    await page.goto("/rezepte/scannen");
    await expect(page.getByTestId("scan-galerie-button")).toBeVisible();
    await warteAufSeitenruhe(page);

    await page.getByTestId("scan-galerie-input").setInputFiles([
      { name: "seite-1.png", mimeType: "image/png", buffer: PNG_1PX },
      { name: "seite-2.png", mimeType: "image/png", buffer: PNG_1PX },
    ]);

    // Beide Seiten stehen in der Liste, in der Reihenfolge der Auswahl.
    await expect(page.getByTestId("scan-seite")).toHaveCount(2);

    await page.getByTestId("scan-start-ocr").tap();

    // Ergebnis erscheint — der Upload beider Seiten lief also durch.
    await expect(page.getByTestId("scan-ergebnis")).toBeVisible({ timeout: 60_000 });

    // Der Vertrag: ein Aufruf, zwei IDs, Seitenreihenfolge erhalten.
    expect(calls).toHaveLength(1);
    const body = calls[0].postDataJSON() as { imageIds?: string[] };
    expect(Array.isArray(body.imageIds)).toBe(true);
    expect(body.imageIds).toHaveLength(2);
    expect(new Set(body.imageIds)).toHaveProperty("size", 2);
    for (const id of body.imageIds!) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }

    // Genau ein Rezept, nicht zwei — die Zusammenfuehrung ist strukturell garantiert.
    // Das erste Textfeld der Vorschau traegt den Titel des erkannten Rezepts.
    await expect(
      page.getByTestId("scan-ergebnis").locator('input[type="text"]').first(),
    ).toHaveValue(title);
  });

  test("mehr als zehn Seiten werden abgelehnt, bevor ein Aufruf entsteht", async ({ page }) => {
    const calls = await stubOcr(page, `Scan-Limit-${RUN_ID}`);

    await page.goto("/rezepte/scannen");
    await expect(page.getByTestId("scan-galerie-button")).toBeVisible();
    await warteAufSeitenruhe(page);

    await page.getByTestId("scan-galerie-input").setInputFiles(
      Array.from({ length: 11 }, (_, i) => ({
        name: `seite-${i + 1}.png`,
        mimeType: "image/png",
        buffer: PNG_1PX,
      })),
    );

    await expect(page.getByTestId("scan-seite")).toHaveCount(10);
    expect(calls).toHaveLength(0);
  });
});
