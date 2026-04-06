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

  test("Design-Token: Terrakotta-Farbe (#c24d2c) als CSS-Variable definiert", async ({ page }) => {
    await page.goto("/");
    const terra = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-terra-500")
        .trim(),
    );
    // #c24d2c oder äquivalente Notation
    expect(terra).toBeTruthy();
    expect(terra.toLowerCase()).toMatch(/c24d2c|194.*77.*44/);
  });

  test("Design-Token: Gold-Farbe (#d4a843) als CSS-Variable definiert", async ({ page }) => {
    await page.goto("/");
    const gold = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-gold-500")
        .trim(),
    );
    // #d4a843 oder äquivalente Notation
    expect(gold).toBeTruthy();
    expect(gold.toLowerCase()).toMatch(/d4a843|212.*168.*67/);
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

  test("Anmeldeseite ist erreichbar und zeigt Login-Formular", async ({ page }) => {
    await page.goto("/auth/anmelden");
    const form = page.locator("form");
    await expect(form).toBeVisible();
    await expect(page.getByLabel(/E-Mail/)).toBeVisible();
  });

  test("Design-Token: Alle drei Hauptfarben als CSS-Variablen vorhanden", async ({ page }) => {
    await page.goto("/");
    const vars = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        terra: s.getPropertyValue("--color-terra-500").trim(),
        gold: s.getPropertyValue("--color-gold-500").trim(),
        bgBase: s.getPropertyValue("--bg-base").trim(),
      };
    });
    expect(vars.terra).toBeTruthy();
    expect(vars.gold).toBeTruthy();
    expect(vars.bgBase).toBeTruthy();
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