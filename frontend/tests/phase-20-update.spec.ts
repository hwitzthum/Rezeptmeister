/**
 * Phase 20 — Hinweis auf eine neue App-Version.
 *
 * Zuvor uebernahm der Service Worker still im Hintergrund und schrieb das nur
 * auf die Entwicklerkonsole. Wer die App vom Home-Bildschirm nutzte, sah
 * beliebig lange den alten Stand — genau der gemeldete Fall.
 *
 * Diese Datei prueft den echten Ablauf im Browser: laufender Service Worker,
 * geaenderte sw.js, Suchlauf, Hinweis, Uebernahme.
 *
 * Voraussetzungen: PostgreSQL laeuft, Dev-Server via playwright.config.ts.
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

test.skip(
  !(ADMIN_EMAIL && ADMIN_PASSWORD),
  "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env",
);

async function loginAdmin(page: Page) {
  await page.goto("/auth/anmelden");
  await page.getByLabel(/E-Mail/).fill(ADMIN_EMAIL);
  await page.locator("#password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

/** Wartet, bis ein Service Worker die Seite tatsaechlich steuert. */
async function waitForController(page: Page) {
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker?.controller),
    undefined,
    { timeout: 20_000 },
  );
}

test.describe("Phase 20 – Hinweis auf neue Version", () => {
  test("der Service Worker uebernimmt nicht mehr ungefragt", async () => {
    // Der Vertrag hinter dem Hinweis: ohne skipWaiting beim Installieren
    // wartet eine neue Fassung, statt die laufende Seite zu ueberholen.
    const sw = fs.readFileSync(
      path.resolve(__dirname, "../public/sw.js"),
      "utf-8",
    );
    const installBlock = sw.slice(
      sw.indexOf('addEventListener("install"'),
      sw.indexOf('addEventListener("activate"'),
    );
    expect(installBlock).not.toContain("skipWaiting");
    // Uebernommen wird ausschliesslich auf Zuruf.
    expect(sw).toContain('event.data?.type === "SKIP_WAITING"');
    expect(sw).toContain("self.skipWaiting()");
  });

  test("kein Hinweis, solange es nichts Neues gibt", async ({ page }) => {
    await loginAdmin(page);
    await waitForController(page);
    await page.reload();
    await expect(page.getByTestId("dashboard")).toBeVisible();
    await expect(page.getByTestId("sw-update-banner")).toHaveCount(0);
  });

  /**
   * Eine echte Service-Worker-Aktualisierung laesst sich im Test nicht
   * ausloesen: Playwright faengt das Nachladen von sw.js nicht ab, weil die
   * Anfrage vom Browser stammt und nicht von der Seite. Stattdessen wird die
   * Browser-Schnittstelle selbst durch die vertraglich zugesicherte Attrappe
   * ersetzt — Komponente, Modul und DOM laufen dabei echt.
   */
  async function mitWartenderFassung(page: Page) {
    await page.addInitScript(() => {
      // Nach der Uebernahme wartet nichts mehr — sonst liefe die Seite in eine
      // Neuladeschleife.
      const schonAktualisiert = sessionStorage.getItem("test-sw-applied") === "1";
      const listeners: (() => void)[] = [];
      const waiting = {
        state: "installed",
        addEventListener() {},
        removeEventListener() {},
        postMessage(message: { type?: string }) {
          if (message?.type !== "SKIP_WAITING") return;
          (window as unknown as { __skipWaiting: boolean }).__skipWaiting = true;
          sessionStorage.setItem("test-sw-applied", "1");
          // Der Controllerwechsel ist das Signal, auf das die App wartet.
          listeners.slice().forEach((l) => l());
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          controller: {},
          register: async () => ({
            waiting: schonAktualisiert ? null : waiting,
            installing: null,
            update: async () => {},
            addEventListener() {},
            removeEventListener() {},
          }),
          addEventListener(type: string, l: () => void) {
            if (type === "controllerchange") listeners.push(l);
          },
          removeEventListener(type: string, l: () => void) {
            if (type !== "controllerchange") return;
            const i = listeners.indexOf(l);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
      });
    });
  }

  test("neue Fassung wird gemeldet und auf Tippen uebernommen", async ({
    page,
  }) => {
    await mitWartenderFassung(page);
    await loginAdmin(page);

    const banner = page.getByTestId("sw-update-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText("Neue Version verfügbar");
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toHaveAttribute("aria-live", "polite");

    // Tippziel nach WCAG 2.5.5
    const box = await page.getByTestId("sw-update-button").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Uebernahme: SKIP_WAITING geht raus und die Seite laedt neu.
    await page.getByTestId("sw-update-button").click();
    await expect(page.getByTestId("dashboard")).toBeVisible({ timeout: 20_000 });
    // Nach dem Neuladen wartet nichts mehr — der Hinweis ist weg.
    await expect(page.getByTestId("sw-update-banner")).toHaveCount(0);
    expect(
      await page.evaluate(() => sessionStorage.getItem("test-sw-applied")),
    ).toBe("1");
  });

  test("der Hinweis verdeckt die Tab-Leiste nicht", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mitWartenderFassung(page);
    await loginAdmin(page);

    const banner = page.getByTestId("sw-update-banner");
    await expect(banner).toBeVisible({ timeout: 20_000 });
    const box = await banner.boundingBox();
    expect(box).not.toBeNull();
    // Innerhalb des Bildes, kein waagrechter Ueberlauf.
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  });

  test("der Hinweis laesst sich wegtippen", async ({ page }) => {
    await mitWartenderFassung(page);
    await loginAdmin(page);

    await expect(page.getByTestId("sw-update-banner")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("sw-update-dismiss").click();
    await expect(page.getByTestId("sw-update-banner")).toHaveCount(0);
  });
});
