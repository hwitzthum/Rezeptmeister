import { describe, it, expect } from "vitest";
import {
  toRecipePayload,
  normalizeDifficulty,
  normalizeTags,
  normalizeIngredients,
  formatValidationDetails,
  type ExtractedRecipe,
} from "../from-extraction";
import { recipeBodySchema } from "@/lib/schemas";

function basis(overrides: Partial<ExtractedRecipe> = {}): ExtractedRecipe {
  return {
    title: "Älplermagronen",
    instructions: "1. Kochen.\n2. Essen.",
    ingredients: [{ name: "Magronen", amount: 300, unit: "g" }],
    tags: ["Schweizer Küche"],
    ...overrides,
  };
}

describe("normalizeDifficulty", () => {
  it("bildet Gross-/Kleinschreibung und Synonyme auf das Schema ab", () => {
    expect(normalizeDifficulty("Einfach")).toBe("einfach");
    expect(normalizeDifficulty("leicht")).toBe("einfach");
    expect(normalizeDifficulty(" MITTEL ")).toBe("mittel");
    expect(normalizeDifficulty("medium")).toBe("mittel");
    expect(normalizeDifficulty("schwer")).toBe("anspruchsvoll");
    expect(normalizeDifficulty("Anspruchsvoll")).toBe("anspruchsvoll");
  });

  it("liefert undefined für Unbekanntes und Leeres", () => {
    expect(normalizeDifficulty("sehr schwer")).toBeUndefined();
    expect(normalizeDifficulty("")).toBeUndefined();
    expect(normalizeDifficulty(null)).toBeUndefined();
  });
});

describe("normalizeTags", () => {
  it("trimmt, dedupliziert (ohne Gross-/Kleinschreibung) und kappt auf 20", () => {
    const tags = Array.from({ length: 25 }, (_, i) => ` Tag ${i} `);
    tags.push("tag 0");
    const result = normalizeTags(tags);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("Tag 0");
    expect(result.filter((t) => t.toLowerCase() === "tag 0")).toHaveLength(1);
  });

  it("kürzt überlange Tags auf 50 Zeichen und verwirft leere", () => {
    const lang = "x".repeat(80);
    expect(normalizeTags([lang, "", "   "])).toEqual([lang.slice(0, 50)]);
  });
});

describe("normalizeIngredients", () => {
  it("verwirft Menge 0 und negative Mengen, behält den Namen", () => {
    const result = normalizeIngredients([
      { name: "Salz", amount: 0, unit: "Prise" },
      { name: "Pfeffer", amount: -1 },
    ]);
    expect(result).toEqual([
      {
        name: "Salz",
        amount: undefined,
        unit: "Prise",
        sortOrder: 0,
        isOptional: false,
      },
      {
        name: "Pfeffer",
        amount: undefined,
        unit: undefined,
        sortOrder: 1,
        isOptional: false,
      },
    ]);
  });

  it("verwirft Zutaten ohne Namen und nummeriert lückenlos", () => {
    const result = normalizeIngredients([
      { name: "  ", amount: 2 },
      { name: "Zwiebel", amount: 2, unit: "Stk." },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].sortOrder).toBe(0);
  });

  it("rundet Mengen auf drei Dezimalstellen", () => {
    expect(
      normalizeIngredients([{ name: "Mehl", amount: 1 / 3 }])[0].amount,
    ).toBe(0.333);
  });
});

describe("toRecipePayload", () => {
  it("besteht das Schema für eine saubere Extraktion", () => {
    const payload = toRecipePayload(basis(), "url_import");
    expect(recipeBodySchema.safeParse(payload).success).toBe(true);
    expect(payload.sourceType).toBe("url_import");
  });

  it("repariert alle bekannten Bruchstellen des URL-Imports in einem Durchgang", () => {
    const payload = toRecipePayload(
      basis({
        difficulty: "Einfach",
        ingredients: [
          { name: "Salz", amount: 0, unit: "Prise" },
          { name: "", amount: 1 },
          { name: "Butter", amount: 50, unit: "g".repeat(60) },
        ],
        tags: Array.from({ length: 25 }, (_, i) => `Tag ${i}`),
        prep_time_minutes: 1.5,
        cook_time_minutes: -3,
        servings: 0,
        category: "K".repeat(150),
        description: "D".repeat(6000),
      }),
      "url_import",
    );
    expect(recipeBodySchema.safeParse(payload).success).toBe(true);
    expect(payload.difficulty).toBe("einfach");
    expect(payload.ingredients).toHaveLength(2);
    expect(payload.tags).toHaveLength(20);
    expect(payload.prepTimeMinutes).toBe(2);
    expect(payload.cookTimeMinutes).toBeUndefined();
    expect(payload.servings).toBe(4);
    expect(payload.category).toHaveLength(100);
    expect(payload.description).toHaveLength(5000);
  });

  it("lässt Overrides aus dem Vorschau-Formular vorgehen", () => {
    const payload = toRecipePayload(
      basis({ difficulty: "schwer" }),
      "image_ocr",
      {
        title: "  Neuer Titel ",
        difficulty: "mittel",
        servings: 6,
        prepTimeMinutes: 0,
      },
    );
    expect(payload.title).toBe("Neuer Titel");
    expect(payload.difficulty).toBe("mittel");
    expect(payload.servings).toBe(6);
    expect(payload.prepTimeMinutes).toBeUndefined();
  });

  it("wirft bei leerem Titel mit einer deutschen Feldmeldung", () => {
    expect(() => toRecipePayload(basis({ title: "  " }), "url_import")).toThrow(
      /Titel/,
    );
  });
});

describe("formatValidationDetails", () => {
  it("nennt das erste fehlerhafte Feld auf Deutsch", () => {
    expect(
      formatValidationDetails({
        fieldErrors: { difficulty: ["Invalid option"] },
        formErrors: [],
      }),
    ).toBe("Validierungsfehler. Schwierigkeitsgrad: Invalid option");
  });

  it("fällt auf die generische Meldung zurück", () => {
    expect(formatValidationDetails(undefined)).toBe("Validierungsfehler.");
    expect(formatValidationDetails({ fieldErrors: {}, formErrors: [] })).toBe(
      "Validierungsfehler.",
    );
  });
});
