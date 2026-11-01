/**
 * Gruppenbezeichner bei Zutaten (z. B. "Für die Sauce"):
 * Eingabe im Rezept-Editor, Speichern und gruppierte Anzeige im Rezept.
 *
 * Voraussetzungen: PostgreSQL laeuft, Dev-Server via playwright.config.ts.
 * Self-contained: legt ein eigenes Rezept an und raeumt es wieder auf.
 */

import { test, expect } from "@playwright/test";
import { loginAdmin } from "./mobile-helpers";

const RUN_ID = Date.now().toString(36);
const TITEL = `Pasta mit Sauce ${RUN_ID}`;

test.describe("Zutaten-Gruppen", () => {
  let id = "";

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);
    const res = await page.evaluate(async (title: string) => {
      const r = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          instructions: "Pasta kochen, Sauce zubereiten, mischen.",
          servings: 2,
          difficulty: "einfach",
          ingredients: [
            { name: "Spaghetti", amount: 200, unit: "g", sortOrder: 0, isOptional: false },
            { name: "Tomaten", amount: 400, unit: "g", groupName: "Für die Sauce", sortOrder: 1, isOptional: false },
            { name: "Basilikum", amount: 1, unit: "Bund", sortOrder: 2, isOptional: false },
          ],
        }),
      });
      return r.ok ? await r.json() : { error: await r.text() };
    }, TITEL);
    if ("error" in res) throw new Error(`Rezept anlegen fehlgeschlagen: ${res.error}`);
    id = res.id;
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate((i) => fetch(`/api/recipes/${i}`, { method: "DELETE" }), id);
  });

  test("Detailseite zeigt Zutaten unter ihrer Gruppenueberschrift", async ({ page }) => {
    await page.goto(`/rezepte/${id}`);
    await expect(page.getByTestId("ingredient-group-heading")).toHaveText("Für die Sauce");
    await expect(page.getByText("Spaghetti")).toBeVisible();
  });

  test("Editor erlaubt, einen Gruppenbezeichner einzutragen und zu speichern", async ({ page }) => {
    await page.goto(`/rezepte/${id}/bearbeiten`);
    await page.getByRole("button", { name: /Weiter/ }).click();

    // Bestehende Gruppe ist vorbelegt
    const inputs = page.getByLabel("Gruppenbezeichner");
    await expect(inputs).toHaveCount(1);
    await expect(inputs.first()).toHaveValue("Für die Sauce");

    // Neue Gruppe an der dritten Zeile eintragen
    await page.getByRole("button", { name: "Gruppe festlegen" }).nth(2).click();
    await page.getByLabel("Gruppenbezeichner").nth(1).fill("Zum Garnieren");

    await page.getByRole("button", { name: /Weiter/ }).click();
    await page.getByRole("button", { name: /Weiter/ }).click();
    await page.getByRole("button", { name: "Änderungen speichern" }).click();

    await page.waitForURL(new RegExp(`/rezepte/${id}$`));
    await expect(page.getByTestId("ingredient-group-heading")).toHaveText([
      "Für die Sauce",
      "Zum Garnieren",
    ]);
  });
});
