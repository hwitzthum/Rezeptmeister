/**
 * C1.6 — Zurueck auf den Home-Bildschirm.
 *
 * Ein abgelegtes Symbol kann verschwinden, ohne dass die App etwas dafuer
 * kann: iOS entfernt abgelegte Web-Apps beim Loeschen der Websitedaten, und
 * der Home-Bildschirm gleicht sich ueber iCloud zwischen Geraeten ab. Wer dann
 * im Browser landet, muss den Weg zurueck in der App finden — sonst ist die
 * App fuer ihn weg.
 *
 * Voraussetzungen: PostgreSQL laeuft, Dev-Server via playwright.config.ts.
 */

import { test, expect, CREDS_AVAILABLE, isPhoneLayout } from "./mobile-helpers";

test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

test.describe("C1.6 — Hinweis auf den Home-Bildschirm", () => {
  test("erscheint auf dem Dashboard, solange die App im Browser laeuft", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible();

    const hinweis = page.getByTestId("install-hint");
    await expect(hinweis).toBeVisible();
    await expect(hinweis).toContainText("Home-Bildschirm");
    // Auf iOS ist der Browser entscheidend — Chrome kann dort nichts ablegen.
    if (test.info().project.name.includes("safari") || test.info().project.name === "tablet") {
      await expect(hinweis).toContainText("Safari");
    }
  });

  test("bleibt nach dem Wegtippen weg, auch nach dem Neuladen", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("install-hint")).toBeVisible();

    await page.getByTestId("install-hint-dismiss").click();
    await expect(page.getByTestId("install-hint")).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByTestId("install-hint")).toHaveCount(0);
  });

  test("schweigt in der installierten App", async ({ page }) => {
    // Standalone laesst sich nicht echt herstellen; Safari meldet den Zustand
    // ueber navigator.standalone, und genau das liest die App.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        value: true,
      });
    });
    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByTestId("install-hint")).toHaveCount(0);
  });

  test("die vollstaendige Anleitung steht dauerhaft unter Mehr", async ({ page }) => {
    await page.goto("/mehr");
    const anleitung = page.getByTestId("mehr-install-guide");
    await expect(anleitung).toBeVisible();

    // Zugeklappt: nur die Ueberschrift. Aufgeklappt: die Schritte.
    await anleitung.locator("summary").click();
    await expect(anleitung.locator("ol > li")).not.toHaveCount(0);
    expect(await anleitung.locator("ol > li").count()).toBeGreaterThanOrEqual(3);

    // Die Schritte richten sich nach dem Geraet — Android legt auf dem
    // Startbildschirm ab, iOS ueber das Teilen-Menue auf dem Home-Bildschirm.
    const titel = (await anleitung.locator("summary").textContent()) ?? "";
    if (titel.includes("iPhone")) {
      await expect(anleitung).toContainText("Teilen");
      await expect(anleitung).toContainText("Zum Home-Bildschirm");
      // Die Beruhigung gehoert dazu — sonst fuerchtet man um seine Rezepte.
      await expect(anleitung).toContainText("gehen dabei nicht verloren");
    } else {
      await expect(anleitung).toContainText("Startbildschirm");
    }
  });

  test("die Anleitung bleibt auch in der installierten App erreichbar", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", {
        configurable: true,
        value: true,
      });
    });
    await page.goto("/mehr");
    await expect(page.getByTestId("mehr-install-guide")).toBeVisible();
    await expect(page.getByTestId("install-guide-status")).toContainText(
      "Bereits abgelegt",
    );
  });

  test("der Hinweis haelt die Mobil-Kriterien ein", async ({ page }) => {
    await page.goto("/");
    const hinweis = page.getByTestId("install-hint");
    await expect(hinweis).toBeVisible();

    const box = await hinweis.boundingBox();
    expect(box).not.toBeNull();
    const breite = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(breite + 1);

    if (await isPhoneLayout(page)) {
      const knopf = await page.getByTestId("install-hint-dismiss").boundingBox();
      expect(knopf!.width).toBeGreaterThanOrEqual(44);
      expect(knopf!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
