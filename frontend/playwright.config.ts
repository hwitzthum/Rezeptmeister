import { defineConfig, devices } from "@playwright/test";

/**
 * Die Mobile-Suite (Welle 3 / C1) laeuft auf drei Geraeteprofilen, die
 * Bestands-Specs der 18 Phasen weiterhin nur auf dem Desktop.
 *
 * Die Trennung laeuft ueber den Dateinamen: `mobile-*.spec.ts` gehoert den
 * Geraeteprojekten, alles andere dem `chromium`-Projekt. Ohne diese Weiche
 * wuerden die 19 Phase-Specs viermal laufen — auf Viewports, fuer die sie nie
 * geschrieben wurden (Sidebar sichtbar, kein Tab-Bar-Ueberdeckung, kein Touch).
 */
const MOBILE_SPECS = /mobile-.*\.spec\.ts$/;
const MOBILE_SETUP = /mobile-auth\.setup\.ts$/;

/** Einmal angemeldete Sitzung, von allen drei Geraeteprojekten geteilt. */
const STORAGE_STATE = "./.auth/mobile.json";

/**
 * Die Mobile-Suite faehrt jede Route einzeln an; im Dev-Server uebersetzt der
 * erste Aufruf einer Seite noch. 30 s reichen dafuer nicht zuverlaessig, daher
 * hier 60 s — nur fuer die Geraeteprojekte, das `chromium`-Projekt behaelt die
 * Vorgabe.
 */
const MOBILE_TIMEOUT = 60_000;

/**
 * Ohne das faengt `page.route` in WebKit nichts ab: der Service Worker meldet
 * sich zwar bei `/api/`-Aufrufen sofort wieder ab (network-only), die Anfrage
 * gilt dem Browser danach aber als vom Worker ausgeloest — und die reicht
 * Playwright dort am Router vorbei. Die Suite wuerde dann echte Gemini-Aufrufe
 * absetzen statt den Vertrag zu pruefen. Registrierung, Caching und
 * Offline-Fallback des Workers deckt `phase-17` im `chromium`-Projekt ab.
 */
const MOBILE_CONTEXT = { serviceWorkers: "block" } as const;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 3,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3002",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [MOBILE_SPECS, MOBILE_SETUP],
    },
    {
      name: "mobile-setup",
      use: { ...devices["Desktop Chrome"] },
      testMatch: MOBILE_SETUP,
    },
    {
      // iPhone 14 (WebKit, 390 x 664 sichtbar) — das Referenzgeraet aus SPEC_1.
      name: "mobile-safari",
      use: { ...devices["iPhone 14"], storageState: STORAGE_STATE, ...MOBILE_CONTEXT },
      testMatch: MOBILE_SPECS,
      dependencies: ["mobile-setup"],
      timeout: MOBILE_TIMEOUT,
    },
    {
      // Pixel 7 (Chromium, 412 x 839) — Android inkl. Share-Target-Pfad.
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"], storageState: STORAGE_STATE, ...MOBILE_CONTEXT },
      testMatch: MOBILE_SPECS,
      dependencies: ["mobile-setup"],
      timeout: MOBILE_TIMEOUT,
    },
    {
      // iPad gen 7 (WebKit, 810 x 1080) — liegt zwischen `md` und `lg` und
      // sichert damit genau den Breakpoint-Wechsel ab, den Welle 2 verschoben hat.
      name: "tablet",
      use: { ...devices["iPad (gen 7)"], storageState: STORAGE_STATE, ...MOBILE_CONTEXT },
      testMatch: MOBILE_SPECS,
      dependencies: ["mobile-setup"],
      timeout: MOBILE_TIMEOUT,
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3002",
    url: "http://localhost:3002/api/health",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      DISABLE_RATE_LIMIT: "true",
      // The test server listens on 3002, but .env.local pins NEXTAUTH_URL to the
      // normal dev port (3001). Without this override, the auth middleware
      // redirects unauthenticated requests to localhost:3001 — which isn't
      // running during a standalone test run — so every redirect-based test
      // fails with ERR_CONNECTION_REFUSED. Align the auth origin with the test
      // port so redirects stay same-origin and reachable.
      NEXTAUTH_URL: "http://localhost:3002",
    },
  },
});
