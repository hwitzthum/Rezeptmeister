import { describe, it, expect } from "vitest";
import {
  clampGenerateImagePayload,
  GENERATE_IMAGE_LIMITS,
} from "../generate-image-payload";

function payload(over: Partial<{ title: string; ingredients: string[]; category: string }> = {}) {
  return {
    title: "Zürcher Geschnetzeltes",
    ingredients: ["Kalbfleisch", "Rahm"],
    category: "Hauptgericht",
    ...over,
  };
}

describe("clampGenerateImagePayload", () => {
  it("lässt eine Nutzlast innerhalb der Grenzen unverändert", () => {
    const p = payload();
    expect(clampGenerateImagePayload(p)).toEqual(p);
  });

  it("kürzt die Zutatenliste auf das Backend-Maximum statt abzulehnen", () => {
    // Genau der Fall aus der Abnahme: ein importiertes Rezept mit mehr als
    // 20 Zutaten liess Pydantic mit 422 antworten.
    const many = Array.from({ length: 25 }, (_, i) => `Zutat ${i + 1}`);
    const result = clampGenerateImagePayload(payload({ ingredients: many }));
    expect(result.ingredients).toHaveLength(GENERATE_IMAGE_LIMITS.ingredients);
    // Die ersten Zutaten bleiben erhalten — das Backend baut den Prompt aus ihnen.
    expect(result.ingredients[0]).toBe("Zutat 1");
    expect(result.ingredients.at(-1)).toBe("Zutat 20");
  });

  it("kürzt zu lange Zutatennamen", () => {
    const lang = "A".repeat(150);
    const result = clampGenerateImagePayload(payload({ ingredients: [lang] }));
    expect(result.ingredients[0]).toHaveLength(GENERATE_IMAGE_LIMITS.ingredientName);
  });

  it("kürzt einen zu langen Titel", () => {
    const result = clampGenerateImagePayload(payload({ title: "T".repeat(300) }));
    expect(result.title).toHaveLength(GENERATE_IMAGE_LIMITS.title);
  });

  it("kürzt eine zu lange Kategorie", () => {
    const result = clampGenerateImagePayload(payload({ category: "K".repeat(300) }));
    expect(result.category).toHaveLength(GENERATE_IMAGE_LIMITS.category);
  });

  it("behält andere Felder bei", () => {
    const result = clampGenerateImagePayload({
      ...payload(),
      recipe_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(result.recipe_id).toBe("11111111-1111-1111-1111-111111111111");
  });
});
