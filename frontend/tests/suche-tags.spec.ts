/**
 * Suche nach den automatisch erzeugten Tags (z. B. "Asiatisch", "Geflügel").
 *
 * Die Tags stehen nicht in Titel oder Anleitung, sollen aber ueber das
 * Suchfeld und einen eigenen Tag-Filter auffindbar sein.
 *
 * Voraussetzungen: PostgreSQL laeuft, Dev-Server via playwright.config.ts.
 * Self-contained: legt eigene Rezepte an und raeumt sie wieder auf.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAdmin } from "./mobile-helpers";

const RUN_ID = Date.now().toString(36);
const TAG = `Asiatisch${RUN_ID}`;
const TITEL_MIT = `Wokgemuese ${RUN_ID}`;
const TITEL_OHNE = `Kartoffelgratin ${RUN_ID}`;

async function createRecipe(page: Page, title: string, tags: string[]) {
  const res = await page.evaluate(
    async (a: { title: string; tags: string[] }) => {
      const r = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: a.title,
          instructions: "Alles zusammen garen und servieren.",
          servings: 2,
          difficulty: "einfach",
          tags: a.tags,
          ingredients: [
            { name: "Zutat", amount: 100, unit: "g", sortOrder: 0, isOptional: false },
          ],
        }),
      });
      return r.ok ? await r.json() : { error: await r.text() };
    },
    { title, tags },
  );
  if ("error" in res) throw new Error(`Rezept anlegen fehlgeschlagen: ${res.error}`);
  return res.id as string;
}

test.describe("Suche nach Tags", () => {
  const ids: string[] = [];

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);
    ids.push(await createRecipe(page, TITEL_MIT, [TAG, "Vegetarisch"]));
    ids.push(await createRecipe(page, TITEL_OHNE, ["Vegetarisch"]));
  });

  test.afterEach(async ({ page }) => {
    for (const id of ids.splice(0)) {
      await page.evaluate((i) => fetch(`/api/recipes/${i}`, { method: "DELETE" }), id);
    }
  });

  test("das Suchfeld findet ein Rezept ueber seinen Tag", async ({ page }) => {
    await page.goto("/suche");
    await page.getByRole("textbox").first().fill(TAG.toLowerCase());
    await expect(page.getByText(TITEL_MIT)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(TITEL_OHNE)).toHaveCount(0);
  });

  test("der Tag-Filter listet den Tag mit Anzahl und filtert die Treffer", async ({ page }) => {
    await page.goto("/suche");
    const select = page.locator("select[name=tag]").first();
    await expect(select.locator("option", { hasText: `${TAG} (1)` })).toHaveCount(1, {
      timeout: 10_000,
    });

    await select.selectOption({ label: `${TAG} (1)` });
    await expect(page).toHaveURL(new RegExp(`tag=${TAG}`));
    await expect(page.getByText(TITEL_MIT)).toBeVisible();
    await expect(page.getByText(TITEL_OHNE)).toHaveCount(0);

    // Der Filter bleibt auch ohne Treffer waehlbar und laesst sich zuruecksetzen.
    await select.selectOption("");
    await expect(page.getByText(TITEL_OHNE)).toBeVisible();
  });
});
