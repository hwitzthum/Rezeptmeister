/**
 * C1.2 — Erreichbarkeit und Layout auf Handy und Tablet.
 *
 * Zwei Zusagen aus SPEC_1:
 *   1. Jeder Bereich ist **rein per Antippen** erreichbar — der urspruengliche
 *      Hauptmangel war, dass sieben Seiten nur ueber eine getippte URL zu
 *      erreichen waren.
 *   2. Jede Seite erfuellt die Kriterien aus §7: kein waagrechter Ueberlauf,
 *      Tippziele >= 44 px, Eingabefelder >= 16 px.
 *
 * Voraussetzungen: PostgreSQL laeuft, Dev-Server via playwright.config.ts.
 */

import type { Page } from "@playwright/test";
import {
  test,
  expect,
  ADMIN_EMAIL,
  CREDS_AVAILABLE,
  RUN_ID,
  expectMobileLayout,
  isPhoneLayout,
} from "./mobile-helpers";

test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

// ── Erwartete Ziele ──────────────────────────────────────────────────────────

/** Tab-Leiste: vier Links plus das [+]-Sheet (dieses prueft C1.3). */
const TAB_TARGETS = [
  { testId: "nav-tab-rezepte", url: "/rezepte" },
  { testId: "nav-tab-suche", url: "/suche" },
  { testId: "nav-tab-einkaufsliste", url: "/einkaufsliste" },
  { testId: "nav-tab-mehr", url: "/mehr" },
];

/** Genau die Bereiche, die vor Welle 1 mobil nur per URL erreichbar waren. */
const MEHR_TARGETS = [
  { testId: "mehr-link-dashboard", url: "/" },
  { testId: "mehr-link-wochenplan", url: "/wochenplan" },
  { testId: "mehr-link-bilder", url: "/bilder" },
  { testId: "mehr-link-vorschlaege", url: "/vorschlaege" },
  { testId: "mehr-link-sammlungen", url: "/sammlungen" },
  { testId: "mehr-link-werkzeuge", url: "/werkzeuge" },
  { testId: "mehr-link-einstellungen", url: "/einstellungen" },
  { testId: "mehr-link-admin", url: "/admin" },
];

/** Sidebar-Beschriftungen ab `md` — dieselben Ziele, andere Navigation. */
const SIDEBAR_TARGETS = [
  { label: "Dashboard", url: "/" },
  { label: "Meine Rezepte", url: "/rezepte" },
  { label: "Rezept erstellen", url: "/rezepte/neu" },
  { label: "Einkaufsliste", url: "/einkaufsliste" },
  { label: "Wochenplan", url: "/wochenplan" },
  { label: "Suche", url: "/suche" },
  { label: "Bildergalerie", url: "/bilder" },
  { label: "Vorschläge", url: "/vorschlaege" },
  { label: "Sammlungen", url: "/sammlungen" },
  { label: "Werkzeuge", url: "/werkzeuge" },
  { label: "Einstellungen", url: "/einstellungen" },
  { label: "Admin", url: "/admin" },
];

/** Alle Seiten ohne Parameter, die eine angemeldete Person erreichen kann. */
const STATIC_ROUTES = [
  "/",
  "/rezepte",
  "/rezepte/neu",
  "/rezepte/scannen",
  "/rezepte/importieren",
  "/suche",
  "/einkaufsliste",
  "/wochenplan",
  "/sammlungen",
  "/bilder",
  "/vorschlaege",
  "/werkzeuge",
  "/einstellungen",
  "/mehr",
  "/admin",
  "/offline",
];

// ── Helfer ───────────────────────────────────────────────────────────────────

/** Wartet, bis die Seite wirklich steht — sonst misst man ein Skelett. */
async function settle(page: Page) {
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {
    // Dauerhaft offene Verbindungen (HMR im Dev-Server) duerfen nicht blockieren.
  });
}

async function createRecipe(page: Page, suffix: string): Promise<string> {
  const resp = await page.evaluate(
    async (title: string) => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          instructions: "Schritt 1: Zwiebeln andünsten.\nSchritt 2: Servieren.",
          servings: 4,
          totalTimeMinutes: 30,
          difficulty: "einfach",
          category: "Hauptgericht",
          ingredients: [
            { name: "Zwiebeln", amount: 2, unit: "Stk.", sortOrder: 0, isOptional: false },
            { name: "Butter", amount: 1, unit: "EL", sortOrder: 1, isOptional: false },
          ],
        }),
      });
      if (!res.ok) return { error: await res.text() };
      return res.json();
    },
    `Mobil-${suffix}-${RUN_ID}`,
  );
  if ("error" in resp) throw new Error(`Rezept erstellen fehlgeschlagen: ${resp.error}`);
  return (resp as { id: string }).id;
}

async function deleteRecipe(page: Page, id: string) {
  await page
    .evaluate((rid) => fetch(`/api/recipes/${rid}`, { method: "DELETE" }).then(() => null), id)
    .catch(() => null);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe("C1.2 — Navigation per Antippen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await settle(page);
  });

  test("Tab-Leiste fuehrt in alle Grundbereiche (Handy)", async ({ page }) => {
    test.skip(!(await isPhoneLayout(page)), "Tab-Leiste gibt es nur unter md");

    for (const target of TAB_TARGETS) {
      await page.goto("/");
      const tab = page.getByTestId(target.testId);
      await expect(tab).toBeVisible();
      await tab.tap();
      await expect(page).toHaveURL(new RegExp(`${target.url}$`), { timeout: 15_000 });
      await settle(page);
    }
  });

  test("Tab-Leiste sitzt ueber der Safe-Area und traegt keine Doppelbelegung", async ({
    page,
  }) => {
    test.skip(!(await isPhoneLayout(page)), "Tab-Leiste gibt es nur unter md");

    const bar = page.getByTestId("nav-tabbar");
    const box = await bar.boundingBox();
    expect(box, "Tab-Leiste muss sichtbar sein").not.toBeNull();
    // Fixiert am unteren Rand: die Unterkante liegt buendig auf dem sichtbaren
    // Bereich. Referenz ist der *visuelle* Viewport — daran richtet WebKit
    // `position: fixed` aus, und er ist dort 6 px kleiner als `innerHeight`
    // (Rollbalken-Rinne). `viewportSize()` oder `clientHeight` waeren um genau
    // diese 6 px daneben und der Test damit auf dem iPhone dauerhaft rot.
    const visibleBottom = await page.evaluate(
      () => window.visualViewport?.height ?? document.documentElement.clientHeight,
    );
    expect(Math.round(box!.y + box!.height)).toBe(Math.round(visibleBottom));

    // Fuenf Eintraege, jeder ein eigenes Ziel.
    await expect(bar.getByRole("listitem")).toHaveCount(5);
  });

  test("Mehr-Menue fuehrt in jeden uebrigen Bereich (Handy)", async ({ page }) => {
    test.skip(!(await isPhoneLayout(page)), "Das Mehr-Menue ersetzt die Sidebar nur unter md");

    // Der Einstieg selbst muss antippbar sein — nicht per URL angesteuert.
    await page.getByTestId("nav-tab-mehr").tap();
    await expect(page).toHaveURL(/\/mehr$/);

    // Kein Bereich fehlt: die Liste im Menue deckt genau die erwarteten Ziele ab.
    await expect(page.getByTestId("mehr-page")).toBeVisible();
    await expect(page.locator('[data-testid^="mehr-link-"]').first()).toBeVisible();
    const rendered = await page
      .locator('[data-testid^="mehr-link-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
    expect(new Set(rendered)).toEqual(new Set(MEHR_TARGETS.map((t) => t.testId)));

    for (const target of MEHR_TARGETS) {
      await page.goto("/mehr");
      const link = page.getByTestId(target.testId);
      await expect(link).toBeVisible();
      await link.tap();
      await expect(page).toHaveURL(new RegExp(`${target.url === "/" ? "/" : target.url}$`), {
        timeout: 15_000,
      });
      await settle(page);
    }
  });

  test("Abmelden ist aus dem Mehr-Menue erreichbar (Handy)", async ({ page }) => {
    test.skip(!(await isPhoneLayout(page)), "Das Mehr-Menue ersetzt die Sidebar nur unter md");

    await page.goto("/mehr");
    await expect(page.getByTestId("mehr-signout")).toBeVisible();
    // Der iOS-Kurzbefehl (A4.4) steht auf derselben Seite und ist aufklappbar.
    const shortcut = page.getByTestId("mehr-ios-shortcut");
    await expect(shortcut).toBeVisible();
    await shortcut.locator("summary").tap();
    await expect(shortcut.locator("ol li").first()).toBeVisible();
  });

  test("Sidebar fuehrt in alle Bereiche (Tablet)", async ({ page }) => {
    test.skip(await isPhoneLayout(page), "Ab md navigiert die Sidebar statt der Tab-Leiste");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toBeVisible();

    for (const target of SIDEBAR_TARGETS) {
      await page.goto("/");
      // Ueber `href`, nicht ueber den Namen: der Admin-Eintrag traegt zusaetzlich
      // ein „Admin"-Abzeichen, sein zugaenglicher Name lautet also „Admin Admin".
      const link = sidebar.locator("nav").locator(`a[href="${target.url}"]`);
      await expect(link).toBeVisible();
      await link.tap();
      await expect(page).toHaveURL(new RegExp(`${target.url}$`), { timeout: 15_000 });
      // Erst wenn die Zielseite steht, darf der naechste Durchlauf navigieren —
      // sonst bricht `goto` in eine noch laufende Navigation hinein.
      await settle(page);
    }
  });
});

test.describe("C1.2 — Layout-Kriterien je Seite", () => {
  for (const route of STATIC_ROUTES) {
    test(`Seite ${route} haelt die Mobil-Kriterien`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      await expectMobileLayout(page, route);
    });
  }

  test("Rezept-Detail, Bearbeiten und Kochmodus halten die Mobil-Kriterien", async ({
    page,
  }) => {
    await page.goto("/rezepte");
    const id = await createRecipe(page, "layout");
    try {
      for (const route of [
        `/rezepte/${id}`,
        `/rezepte/${id}/bearbeiten`,
        `/rezepte/${id}/kochmodus`,
      ]) {
        await page.goto(route);
        await settle(page);
        await expectMobileLayout(page, route);
      }
    } finally {
      await deleteRecipe(page, id);
    }
  });
});

test.describe("C1.2 — Anmeldeseiten", () => {
  // Bewusst abgemeldet: angemeldet leitet `proxy.ts` von /auth/* auf / um.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("Anmelden und Registrieren halten die Mobil-Kriterien", async ({ page }) => {
    for (const route of ["/auth/anmelden", "/auth/registrieren"]) {
      await page.goto(route);
      await page.locator("h1, h2").first().waitFor({ state: "visible" });
      await expectMobileLayout(page, route);
    }
    // Sicherstellen, dass die Anmeldemaske ueberhaupt zur bekannten Kennung passt.
    await page.goto("/auth/anmelden");
    await expect(page.getByLabel(/E-Mail/)).toBeVisible();
    expect(ADMIN_EMAIL.length).toBeGreaterThan(0);
  });
});
