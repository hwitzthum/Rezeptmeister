/**
 * Phase 1 E2E Tests – Fundament & Infrastruktur
 *
 * Prüft:
 * 1. Next.js-App lädt korrekt (HTTP 200, kein JS-Fehler)
 * 2. HTML-Sprache ist Deutsch (lang="de-CH")
 * 3. Design-System-Tokens sind aktiv (CSS-Variablen, Schriftarten)
 * 4. Terrakotta-, Cremeweis- und Gold-Farben sind korrekt gerendert
 * 5. Seite ist barrierefrei (kein leerer Titel, landmark vorhanden)
 * 6. FastAPI /health erreichbar (sofern Backend läuft)
 * 7. Keine JavaScript-Konsolenfehler beim Laden
 */

import { test, expect } from "@playwright/test";

const BACKEND_URL = "http://localhost:8000";

test.describe("Phase 1 – Projektfundament", () => {
  test("Startseite lädt ohne Fehler (HTTP 200)", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    // Kurz warten, damit alle Client-Skripte ausgeführt werden
    await page.waitForLoadState("networkidle");

    expect(consoleErrors).toHaveLength(0);
  });

  test("HTML-Sprache ist de-CH (Schweizer Deutsch)", async ({ page }) => {
    await page.goto("/");
    const lang = await page.getAttribute("html", "lang");
    expect(lang).toBe("de-CH");
  });

  test("Seitentitel enthält Rezeptmeister", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Rezeptmeister/i);
  });

  test("H1 zeigt Rezeptmeister-Überschrift mit Display-Font", async ({ page }) => {
    await page.goto("/");
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("Rezeptmeister");

    // Font-Family enthält unsere Display-Font-Variable
    const fontFamily = await h1.evaluate(
      (el) => getComputedStyle(el).fontFamily,
    );
    // Playfair Display oder Fallback Georgia muss enthalten sein
    expect(fontFamily.toLowerCase()).toMatch(/playfair|georgia|serif/i);
  });

  test("Design-Token: Terrakotta-Farbe (#c24d2c) ist gerendert", async ({ page }) => {
    await page.goto("/");
    const terraBox = page.locator('[title="Terrakotta"]');
    await expect(terraBox).toBeVisible();

    const bg = await terraBox.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // rgb(194, 77, 44) entspricht #C24D2C
    expect(bg).toBe("rgb(194, 77, 44)");
  });

  test("Design-Token: Gold-Farbe (#d4a843) ist gerendert", async ({ page }) => {
    await page.goto("/");
    const goldBox = page.locator('[title="Gold"]');
    await expect(goldBox).toBeVisible();

    const bg = await goldBox.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // rgb(212, 168, 67) entspricht #D4A843
    expect(bg).toBe("rgb(212, 168, 67)");
  });

  test("CSS-Variable --bg-base ist eine warme Creme-Farbe", async ({ page }) => {
    await page.goto("/");
    const bgBase = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-base")
        .trim(),
    );
    expect(bgBase).toBe("#fff8f0");
  });

  test("Phasenanzeige ist auf Seite sichtbar", async ({ page }) => {
    await page.goto("/");
    const indicator = page.locator('[data-testid="phase-indicator"]');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText("Phase 1");
  });

  test("Design-Token-Vorschau enthält 3 Farbfelder", async ({ page }) => {
    await page.goto("/");
    const tokenContainer = page.locator('[data-testid="design-tokens"]');
    await expect(tokenContainer).toBeVisible();
    const boxes = tokenContainer.locator("div");
    expect(await boxes.count()).toBe(3);
  });

  test("Keine 404-Ressourcen beim Laden der Seite", async ({ page }) => {
    const failedRequests: string[] = [];
    page.on("response", (res) => {
      if (res.status() === 404) failedRequests.push(res.url());
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(failedRequests).toHaveLength(0);
  });

  test("Seite ist auf Mobile-Viewport darstellbar (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // H1 darf nicht abgeschnitten oder unsichtbar sein
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();

    // Kein horizontaler Scroll
    const bodyWidth = await page.evaluate(
      () => document.body.scrollWidth,
    );
    const viewportWidth = page.viewportSize()?.width ?? 375;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });
});

test.describe("Phase 1 – FastAPI Backend (optional, läuft nur wenn Backend aktiv)", () => {
  test("GET /health gibt status:ok zurück", async ({ request }) => {
    let res;
    try {
      res = await request.get(`${BACKEND_URL}/health`, { timeout: 3000 });
    } catch {
      test.skip(true, "Backend läuft nicht – Test übersprungen");
      return;
    }

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});