import { describe, it, expect } from "vitest";
import {
  filterMissingIngredients,
  type RecipeIngredient,
} from "../ingredient-match";

const mkIng = (
  name: string,
  opts?: Partial<RecipeIngredient>,
): RecipeIngredient => ({
  name,
  isOptional: false,
  amount: null,
  unit: null,
  ...opts,
});

describe("filterMissingIngredients", () => {
  it("gibt alle nicht-optionalen zurück wenn nichts verfügbar", () => {
    const recipe = [mkIng("Reis"), mkIng("Poulet"), mkIng("Salz")];
    expect(filterMissingIngredients(recipe, [])).toHaveLength(3);
  });

  it("schliesst verfügbare Zutaten aus (case-insensitive)", () => {
    const recipe = [mkIng("Reis"), mkIng("Poulet"), mkIng("Salz")];
    const result = filterMissingIngredients(recipe, ["reis", "SALZ"]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Poulet");
  });

  it("'ei' unterdrückt NICHT 'Reis' (kein Substring-Match)", () => {
    const recipe = [mkIng("Reis"), mkIng("Eier")];
    const result = filterMissingIngredients(recipe, ["ei"]);
    // "ei" ist kein exakter Match für "Reis" oder "Eier"
    expect(result.map((r) => r.name)).toEqual(["Reis", "Eier"]);
  });

  it("'Eier' matcht genau 'Eier'", () => {
    const recipe = [mkIng("Reis"), mkIng("Eier")];
    const result = filterMissingIngredients(recipe, ["Eier"]);
    expect(result.map((r) => r.name)).toEqual(["Reis"]);
  });

  it("überspringt optionale Zutaten", () => {
    const recipe = [
      mkIng("Reis"),
      mkIng("Petersilie", { isOptional: true }),
    ];
    const result = filterMissingIngredients(recipe, []);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Reis");
  });

  it("trimmt Whitespace beim Matching", () => {
    const recipe = [mkIng("  Reis  ")];
    const result = filterMissingIngredients(recipe, ["reis"]);
    expect(result).toHaveLength(0);
  });

  it("gibt leeres Array wenn alles verfügbar", () => {
    const recipe = [mkIng("Reis"), mkIng("Salz")];
    expect(filterMissingIngredients(recipe, ["Reis", "Salz"])).toHaveLength(0);
  });

  it("gibt leeres Array wenn alles optional", () => {
    const recipe = [
      mkIng("Petersilie", { isOptional: true }),
      mkIng("Dill", { isOptional: true }),
    ];
    expect(filterMissingIngredients(recipe, [])).toHaveLength(0);
  });
});
