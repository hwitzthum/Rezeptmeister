/**
 * C1.5 — Einkaufsliste im Funkloch.
 *
 * Der Ablauf, den der Laden erzwingt: Netz weg, abhaken, Netz zurueck.
 * Geprueft wird die ganze Kette — die Anzeige bleibt richtig, die Aenderung
 * wird gemerkt, und nach der Rueckkehr steht sie **auf dem Server**.
 * Ein Test, der nur die Anzeige prueft, wuerde eine verlorene Aenderung nicht
 * bemerken.
 */

import type { Page } from "@playwright/test";
import { test, expect, CREDS_AVAILABLE, RUN_ID } from "./mobile-helpers";

test.skip(!CREDS_AVAILABLE, "TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD fehlen in .env");

interface ServerItem {
  id: string;
  ingredientName: string;
  isChecked: boolean;
}

async function addItemViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.evaluate(async (ingredientName: string) => {
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ingredientName, amount: 1, unit: "Stk." }),
    });
    if (!res.ok) return { error: await res.text() };
    return res.json();
  }, name);
  if ("error" in resp) throw new Error(`Eintrag anlegen fehlgeschlagen: ${resp.error}`);
  const item = (resp as { item?: ServerItem; id?: string }).item;
  return item?.id ?? (resp as { id: string }).id;
}

async function serverItem(page: Page, id: string): Promise<ServerItem | undefined> {
  const data = await page.evaluate(
    async () => (await fetch("/api/shopping-list")).json() as Promise<{ items?: ServerItem[] }>,
  );
  return data.items?.find((i) => i.id === id);
}

/**
 * Wartet, bis React die Seite uebernommen hat.
 *
 * Vor der Hydration verpufft jeder Tap: das Markup steht, aber es haengt noch
 * kein Ereignis daran — und eine gesetzte Eingabe wird beim Hydrieren wieder
 * verworfen. Genau daran scheiterte die Suite unter Last (drei Geraeteprojekte
 * am selben Dev-Server) sporadisch. Der Hinzufuegen-Knopf ist die ehrlichste
 * Sonde: er wird nur aktiv, wenn React die Eingabe wirklich verarbeitet hat.
 */
async function warteAufHydration(page: Page) {
  const feld = page.getByTestId("shopping-list-ingredient-input");
  const knopf = page.getByTestId("shopping-list-add-button");
  await expect
    .poll(
      async () => {
        await feld.fill("hydration-probe");
        return knopf.isEnabled();
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await feld.fill("");
  await expect(knopf).toBeDisabled();
}

async function deleteItemViaApi(page: Page, id: string) {
  await page
    .evaluate((itemId) => fetch(`/api/shopping-list/${itemId}`, { method: "DELETE" }), id)
    .catch(() => null);
}

/** Projektname im Eintrag: die drei Geraeteprojekte laufen parallel auf
 *  demselben Konto und duerfen sich nicht gegenseitig die Liste umsortieren. */
function itemName(prefix: string, projectName: string) {
  return `${prefix}-${projectName}-${RUN_ID}`;
}

test.describe("C1.5 — Offline abhaken und nachsynchronisieren", () => {
  test("Haken im Funkloch bleibt und landet danach auf dem Server", async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/einkaufsliste");
    await expect(page.getByTestId("shopping-list-page")).toBeVisible();

    const name = itemName("Offline-Zutat", testInfo.project.name);
    const id = await addItemViaApi(page, name);

    try {
      await page.reload();
      const checkbox = page.getByTestId(`shopping-list-checkbox-${id}`);
      await expect(checkbox).toBeVisible({ timeout: 15_000 });
      await warteAufHydration(page);
      await expect(checkbox).toHaveAttribute("aria-checked", "false");

      // ── Funkloch ────────────────────────────────────────────────────────────
      await context.setOffline(true);
      await checkbox.tap();

      // Der Haken bleibt — der optimistische Zustand wird nicht zurueckgerollt,
      // nur eine echte Ablehnung des Servers duerfte das tun.
      await expect(checkbox).toHaveAttribute("aria-checked", "true");
      await expect(page.getByTestId("offline-pending-count")).toBeVisible({
        timeout: 10_000,
      });

      // Der Server weiss davon noch nichts — der Zustand liegt nur lokal.
      await expect(checkbox).toHaveAttribute("aria-checked", "true");

      // ── Netz zurueck ────────────────────────────────────────────────────────
      await context.setOffline(false);

      // Nachsynchronisierung serverseitig sichtbar.
      await expect
        .poll(async () => (await serverItem(page, id))?.isChecked, { timeout: 30_000 })
        .toBe(true);

      // Und die Warteschlange ist leer: kein Rest bleibt liegen.
      await expect(page.getByTestId("offline-pending-count")).toHaveCount(0, {
        timeout: 15_000,
      });

      // Nach einem Neuladen steht derselbe Zustand — nichts wurde ueberschrieben.
      await page.reload();
      await expect(page.getByTestId(`shopping-list-checkbox-${id}`)).toHaveAttribute(
        "aria-checked",
        "true",
        { timeout: 15_000 },
      );
    } finally {
      // Nicht werfen: sonst verdeckt ein Aufraeumfehler den eigentlichen Befund.
      await context.setOffline(false).catch(() => null);
      await deleteItemViaApi(page, id);
    }
  });

  test("Ein Haken ueberlebt eine gleichzeitig laufende Aktualisierung", async ({
    page,
  }, testInfo) => {
    // Beim Aufbau der Seite laeuft ein GET auf /api/shopping-list. Wer in genau
    // diesem Moment abhakt, dessen Haken wurde von der zurueckkommenden
    // Server-Antwort wieder ueberschrieben — sie war ja vor dem Abhaken
    // losgeschickt worden. Am Geraet ein sichtbares Zurueckspringen, im Test
    // ein sporadisch deaktivierter „Erledigte loeschen"-Knopf.
    //
    // Das Zeitfenster wird hier erzwungen statt abgewartet: die erste
    // Aktualisierung wird angehalten, bis das Abhaken durch ist.
    await page.goto("/einkaufsliste");
    await expect(page.getByTestId("shopping-list-page")).toBeVisible();

    const name = itemName("Wettlauf", testInfo.project.name);
    const id = await addItemViaApi(page, name);

    let gesehen = 0;
    await page.route("**/api/shopping-list", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      gesehen += 1;
      if (gesehen !== 1) return route.fallback();
      // Wichtig: die Anfrage geht sofort raus, nur die *Antwort* wird
      // angehalten. Wuerde man die Anfrage verzoegern, holte der Server die
      // Daten erst nach dem Abhaken — dann gaebe es gar kein Rennen.
      const antwort = await route.fetch();
      await new Promise((r) => setTimeout(r, 3_000));
      await route.fulfill({ response: antwort });
    });

    try {
      await page.reload();
      const checkbox = page.getByTestId(`shopping-list-checkbox-${id}`);
      await expect(checkbox).toBeVisible({ timeout: 15_000 });
      await warteAufHydration(page);

      await checkbox.tap();
      await expect(checkbox).toHaveAttribute("aria-checked", "true");

      // Jetzt trifft die angehaltene Antwort ein. Sie ist aelter als der Haken
      // und darf ihn nicht ueberschreiben.
      await page.waitForTimeout(4_000);
      await expect(checkbox).toHaveAttribute("aria-checked", "true");

      // Und serverseitig steht er ebenfalls.
      await expect
        .poll(async () => (await serverItem(page, id))?.isChecked, { timeout: 15_000 })
        .toBe(true);
    } finally {
      await page.unroute("**/api/shopping-list").catch(() => null);
      await deleteItemViaApi(page, id);
    }
  });

  test("Offline hinzugefuegter Eintrag erreicht den Server nach der Rueckkehr", async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/einkaufsliste");
    await expect(page.getByTestId("shopping-list-page")).toBeVisible();

    const name = itemName("Offline-Neu", testInfo.project.name);
    let createdId: string | undefined;

    try {
      await warteAufHydration(page);
      // Der Name wird noch online eingetippt — was offline passieren muss, ist
      // das Hinzufuegen selbst, nicht das Tippen.
      await page.getByTestId("shopping-list-ingredient-input").fill(name);
      await context.setOffline(true);
      await page.getByTestId("shopping-list-add-button").tap();

      // Sofort sichtbar, obwohl kein Netz da ist.
      await expect(page.getByText(name, { exact: false })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("offline-pending-count")).toBeVisible({
        timeout: 10_000,
      });

      await context.setOffline(false);

      await expect
        .poll(
          async () => {
            const data = await page.evaluate(
              async () =>
                (await fetch("/api/shopping-list")).json() as Promise<{
                  items?: ServerItem[];
                }>,
            );
            const hit = data.items?.find((i) => i.ingredientName === name);
            createdId = hit?.id;
            return Boolean(hit);
          },
          { timeout: 30_000 },
        )
        .toBe(true);

      await expect(page.getByTestId("offline-pending-count")).toHaveCount(0, {
        timeout: 15_000,
      });
    } finally {
      await context.setOffline(false).catch(() => null);
      if (createdId) await deleteItemViaApi(page, createdId);
    }
  });
});
