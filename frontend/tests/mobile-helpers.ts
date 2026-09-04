/**
 * Geteilte Bausteine der Mobile-Suite (Welle 3 / C1).
 *
 * Keine Testdatei — der Name faengt zwar mit `mobile` an, endet aber nicht auf
 * `.spec.ts` und wird deshalb von `testMatch` nicht eingesammelt.
 */

import { test as base, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * Der Dev-Overlay von Next.js (`<nextjs-portal>`) sitzt unten links und faengt
 * auf Handy-Breite die Taps auf die Tab-Leiste ab. Er gehoert nicht zum Produkt,
 * darf die Messung also weder blockieren noch verfaelschen — deshalb wird er in
 * der Mobile-Suite ausgeblendet.
 */
export const test = base.extend<{ ohneDevOverlay: void }>({
  ohneDevOverlay: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const css = "nextjs-portal{display:none !important}";
        const inject = () => {
          const style = document.createElement("style");
          style.textContent = css;
          (document.head ?? document.documentElement)?.appendChild(style);
        };
        if (document.head) inject();
        else
          document.addEventListener("DOMContentLoaded", inject, { once: true });
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

// ── Env ──────────────────────────────────────────────────────────────────────

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

export const ADMIN_EMAIL = loadEnvVar("TEST_ADMIN_EMAIL");
export const ADMIN_PASSWORD = loadEnvVar("TEST_ADMIN_PASSWORD");
export const CREDS_AVAILABLE = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);

/** Kurzer Lauf-Stempel, damit parallele Projekte sich nicht ins Gehege kommen. */
export const RUN_ID = Date.now().toString(36);

/** Ablage der einmal angemeldeten Sitzung (siehe `mobile-auth.setup.ts`). */
export const STORAGE_STATE = path.resolve(__dirname, "../.auth/mobile.json");

// ── Seitenruhe ───────────────────────────────────────────────────────────────

/**
 * Wartet, bis die Seite geladen ist und auf Eingaben reagieren kann.
 *
 * Das server-gerenderte Markup ist sichtbar, lange bevor React seine
 * Ereignis-Handler angehaengt hat. Ein `fill()` oder `setInputFiles()` in
 * diesem Fenster setzt zwar den DOM-Zustand, loest aber keinen React-Handler
 * aus: die Seite reagiert nie, und der Test wartet auf etwas, das nicht mehr
 * kommt. Unter WebKit (mobile-safari, tablet) ist die Hydration langsam genug,
 * dass die Suite regelmaessig hineinlief — auf Chromium blieb es unsichtbar.
 *
 * `networkidle` ist dafuer ein Stellvertreter, kein direktes Hydrations-Signal:
 * React meldet den Abschluss nicht nach aussen. In der Praxis heisst «keine
 * Netzaktivitaet mehr», dass die Bundles geladen und ausgefuehrt sind — das
 * genuegt, wie die zuvor reproduzierbar fehlschlagenden Faelle zeigen.
 * Sichtbarkeit einer Schaltflaeche genuegt ausdruecklich *nicht*.
 */
export async function warteAufSeitenruhe(page: Page) {
  await page.waitForLoadState("networkidle");
}

// ── Anmeldung ────────────────────────────────────────────────────────────────

/**
 * Traegt die Zugangsdaten ein und wartet, bis React sie uebernommen hat.
 *
 * Das Anmeldeformular arbeitet mit kontrollierten Feldern (`value={email}`).
 * Ein `fill()` vor der Hydration setzt nur den DOM-Wert; React ueberschreibt
 * ihn beim ersten eigenen Render wieder mit seinem leeren State. Der
 * «Anmelden»-Knopf (`disabled={loading || !email || !password}`) bleibt dann
 * deaktiviert und der Test laeuft in den Timeout.
 *
 * Gemessen: Nach abgeschlossener Hydration nimmt WebKit die Eingabe zuverlaessig
 * an. Der Fehler trat nur auf, wenn die drei Geraeteprojekte parallel laufen und
 * der Dev-Server dabei noch uebersetzt — dann dauert die Hydration laenger als
 * ein knapp bemessenes Zeitfenster.
 *
 * Deshalb: erst die Bundles abwarten, dann Eingabe *und* Knopfpruefung
 * wiederholen. Der DOM-Wert taugt nicht als Nachweis (er ueberlebt bis zum
 * naechsten Render); belastbar ist nur der Knopf, denn er haengt am State.
 */
export async function fillCredentials(page: Page) {
  const email = page.getByLabel(/E-Mail/);
  const password = page.locator("#password");
  const submit = page.getByRole("button", { name: "Anmelden" });
  await warteAufSeitenruhe(page);
  await expect(async () => {
    await email.fill(ADMIN_EMAIL);
    await password.fill(ADMIN_PASSWORD);
    await expect(submit).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

export async function loginAdmin(page: Page) {
  await page.goto("/auth/anmelden");
  await fillCredentials(page);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });
}

// ── Geraeteform ──────────────────────────────────────────────────────────────

/**
 * Handy oder Tablet? Der Umbruch liegt bei `md` (768 px): darunter fuehrt die
 * Tab-Leiste, darueber die Sidebar. Die Suite fragt die tatsaechliche
 * Sichtbarkeit ab statt die Breite zu raten — so bleibt sie richtig, falls der
 * Breakpoint noch einmal wandert.
 */
export async function isPhoneLayout(page: Page): Promise<boolean> {
  return page.locator('[data-testid="nav-tabbar"]').isVisible();
}

// ── Layout-Pruefung ──────────────────────────────────────────────────────────

export interface OverflowNode {
  selector: string;
  right: number;
  width: number;
}

export interface SmallTarget {
  selector: string;
  width: number;
  height: number;
}

export interface SmallInput {
  selector: string;
  fontSize: number;
}

export interface LayoutReport {
  scrollWidth: number;
  clientWidth: number;
  overflow: OverflowNode[];
  smallTargets: SmallTarget[];
  smallInputs: SmallInput[];
}

/**
 * Misst eine gerenderte Seite gegen die Kriterien aus SPEC_1 §7.
 *
 * Warum nicht nur `scrollWidth`: `#main-content` traegt `overflow-x-hidden`.
 * Ueberlaufende Inhalte werden dort lautlos **abgeschnitten** statt scrollbar —
 * `scrollWidth` bleibt sauber, waehrend Bedienelemente ausserhalb des Bildes und
 * damit unerreichbar liegen. Welle 2 hat genau so drei Funktionsfehler
 * gefunden, die ein reiner `scrollWidth`-Test nicht gesehen haette. Deshalb
 * misst diese Funktion zusaetzlich jede Element-Box gegen die Viewport-Breite.
 */
export async function measureLayout(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    // 1 px Toleranz: Subpixel-Rundung erzeugt sonst Rauschen.
    const TOL = 1;

    function describe(el: Element): string {
      const parts = [el.tagName.toLowerCase()];
      const testId = el.getAttribute("data-testid");
      if (testId) parts.push(`[data-testid="${testId}"]`);
      else if (el.id) parts.push(`#${el.id}`);
      else {
        const cls = (el.getAttribute("class") ?? "")
          .trim()
          .split(/\s+/)
          .slice(0, 3);
        if (cls[0]) parts.push(`.${cls.join(".")}`);
      }
      const text = (el.textContent ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
      if (text) parts.push(`— „${text}"`);
      return parts.join("");
    }

    /**
     * Nur fuer Screenreader da (Tailwind `sr-only`): 1 px gross und
     * weggeschnitten. Solche Knoten sind kein Tippziel und kein Ueberlauf —
     * das erkennt man am Zuschnitt, nicht am Klassennamen.
     */
    function isScreenReaderOnly(cs: CSSStyleDeclaration): boolean {
      const clip = (cs.clip ?? "").replace(/\s+/g, "");
      const clipPath = (cs.clipPath ?? "").replace(/\s+/g, "");
      return clip === "rect(0px,0px,0px,0px)" || clipPath === "inset(50%)";
    }

    function isVisible(el: Element, rect: DOMRect): boolean {
      if (rect.width <= 0 || rect.height <= 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return false;
      if (Number(cs.opacity) === 0) return false;
      if (isScreenReaderOnly(cs)) return false;
      return true;
    }

    /** Absichtlich waagrecht rollende Leisten sind kein Ueberlauf-Fehler. */
    function insideHorizontalScroller(el: Element): boolean {
      let node: Element | null = el.parentElement;
      while (node && node !== document.documentElement) {
        const ox = getComputedStyle(node).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
        node = node.parentElement;
      }
      return false;
    }

    /**
     * Traegt der Knoten selbst Bedeutung? Nur dann ist ein Ueberlauf ein
     * Befund. Dekorative Farbverlaeufe ragen absichtlich ueber ihre Karte
     * hinaus und werden dort von `overflow-hidden` beschnitten — sichtbar
     * bleibt genau das Gewollte. Abgeschnittener Text oder ein abgeschnittenes
     * Bedienelement dagegen ist der Fehler, den Welle 2 dreimal gefunden hat.
     */
    function carriesMeaning(el: Element): boolean {
      if (el.matches(TARGET_SELECTOR) || el.matches("img, video, canvas"))
        return true;
      return Array.from(el.childNodes).some(
        (n) =>
          n.nodeType === Node.TEXT_NODE &&
          (n.textContent ?? "").trim().length > 0,
      );
    }

    /**
     * Das echte Tippziel eines Ankreuzfelds ist sein umschliessendes `<label>` —
     * ein Tipp darauf schaltet um. Ein 16-px-Kaestchen in einer 44-px-Zeile ist
     * also in Ordnung; eine 20-px-Zeile ist es nicht.
     */
    function effectiveTarget(el: Element): Element {
      if (el.matches('input[type="checkbox"], input[type="radio"]')) {
        const label = el.closest("label");
        if (label) return label;
      }
      return el;
    }

    /**
     * WCAG 2.5.5 nimmt Links im Fliesstext ausdruecklich aus: ihre Groesse
     * bestimmt der Textfluss, nicht das Layout.
     */
    function isInlineInText(el: Element): boolean {
      if (getComputedStyle(el).display !== "inline") return false;
      const parent = el.parentElement;
      if (!parent) return false;
      return Array.from(parent.childNodes).some(
        (n) =>
          n.nodeType === Node.TEXT_NODE &&
          (n.textContent ?? "").trim().length > 0,
      );
    }

    const overflow: { selector: string; right: number; width: number }[] = [];
    const smallTargets: { selector: string; width: number; height: number }[] =
      [];
    const smallInputs: { selector: string; fontSize: number }[] = [];

    const TARGET_SELECTOR =
      'a[href], button, [role="button"], summary, select, textarea, ' +
      'input:not([type="hidden"])';
    const FIELD_SELECTOR =
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), ' +
      "select, textarea";

    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect)) continue;

      // Ueberlauf: ragt die Box rechts aus dem Bild?
      if (
        rect.right > vw + TOL &&
        !insideHorizontalScroller(el) &&
        carriesMeaning(el)
      ) {
        overflow.push({
          selector: describe(el),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }

      // Tippziel: mindestens 44 x 44 px.
      if (el.matches(TARGET_SELECTOR) && !isInlineInText(el)) {
        const target = effectiveTarget(el);
        const box = target === el ? rect : target.getBoundingClientRect();
        if (box.width < 44 - TOL || box.height < 44 - TOL) {
          smallTargets.push({
            selector: describe(target),
            width: Math.round(box.width),
            height: Math.round(box.height),
          });
        }
      }

      // Eingabefeld: unter 16 px zoomt iOS beim Fokus hinein.
      if (el.matches(FIELD_SELECTOR)) {
        const fontSize = parseFloat(getComputedStyle(el).fontSize);
        if (fontSize < 16) {
          smallInputs.push({ selector: describe(el), fontSize });
        }
      }
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflow,
      smallTargets,
      smallInputs,
    };
  });
}

/** Formatiert einen Befund so, dass die Fehlermeldung allein zum Fix reicht. */
export function formatLayoutReport(
  route: string,
  report: LayoutReport,
): string {
  const lines: string[] = [`Layout-Befunde auf ${route}:`];
  if (report.scrollWidth > report.clientWidth) {
    lines.push(
      `  waagrechter Scroll: scrollWidth ${report.scrollWidth} > clientWidth ${report.clientWidth}`,
    );
  }
  for (const o of report.overflow) {
    lines.push(
      `  ueberlaeuft (rechts bei ${o.right}, breit ${o.width}): ${o.selector}`,
    );
  }
  for (const t of report.smallTargets) {
    lines.push(`  Tippziel ${t.width}x${t.height} < 44: ${t.selector}`);
  }
  for (const i of report.smallInputs) {
    lines.push(`  Schriftgroesse ${i.fontSize}px < 16: ${i.selector}`);
  }
  return lines.join("\n");
}

/** Prueft eine bereits geladene Seite gegen alle Kriterien aus §7. */
export async function expectMobileLayout(page: Page, route: string) {
  const report = await measureLayout(page);
  const clean =
    report.scrollWidth <= report.clientWidth &&
    report.overflow.length === 0 &&
    report.smallTargets.length === 0 &&
    report.smallInputs.length === 0;
  expect(clean, formatLayoutReport(route, report)).toBe(true);
}
