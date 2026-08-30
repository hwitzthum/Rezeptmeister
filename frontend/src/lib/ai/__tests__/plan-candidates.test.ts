import { describe, it, expect } from "vitest";
import {
  compactCandidates,
  isVegetarianTags,
  mapPlanEntries,
  type PlanCandidate,
} from "../plan-candidates";

function cand(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    index: 0,
    recipeId: "11111111-1111-4111-8111-111111111111",
    title: "Rösti",
    category: null,
    cuisine: null,
    totalTimeMinutes: null,
    servings: 4,
    tags: [],
    isFavorite: false,
    averageRating: null,
    cookCount: 0,
    lastCookedDaysAgo: null,
    isVegetarian: false,
    ...overrides,
  };
}

describe("isVegetarianTags", () => {
  it("erkennt die gaengigen Tags unabhaengig von Schreibweise", () => {
    expect(isVegetarianTags(["Vegetarisch"])).toBe(true);
    expect(isVegetarianTags(["vegan", "Schnell"])).toBe(true);
    expect(isVegetarianTags(["Fleisch", "Grill"])).toBe(false);
    expect(isVegetarianTags(null)).toBe(false);
  });
});

describe("compactCandidates", () => {
  it("laesst Nullwerte weg und rundet Bewertungen", () => {
    const out = compactCandidates([
      cand(),
      cand({
        index: 1,
        cuisine: "Thai",
        totalTimeMinutes: 25,
        isFavorite: true,
        averageRating: 4.26,
        cookCount: 2,
        lastCookedDaysAgo: 12,
        isVegetarian: true,
        tags: ["a"],
      }),
    ]);
    expect(out[0]).toEqual({ i: 0, t: "Rösti", p: 4 });
    expect(out[1]).toEqual({
      i: 1,
      t: "Rösti",
      p: 4,
      k: "Thai",
      m: 25,
      tg: ["a"],
      f: 1,
      r: 4.3,
      n: 2,
      d: 12,
      v: 1,
    });
  });
});

describe("mapPlanEntries", () => {
  const candidates = [
    cand(),
    cand({
      index: 1,
      recipeId: "22222222-2222-4222-8222-222222222222",
      title: "Curry",
      servings: 8,
    }),
  ];

  it("bildet Tag-Index auf Datum und Kandidat auf Rezept ab", () => {
    const out = mapPlanEntries(
      [
        {
          day_index: 0,
          meal_type: "abendessen",
          candidate_index: 1,
          new_title: null,
          new_description: null,
          reason: "x",
          leftover_of_day: null,
        },
        {
          day_index: 6,
          meal_type: "mittagessen",
          candidate_index: 0,
          new_title: null,
          new_description: null,
          reason: "y",
          leftover_of_day: null,
        },
      ],
      candidates,
      "2026-08-31",
      ["6-mittagessen"],
    );
    expect(out[0]).toMatchObject({
      key: "2026-08-31-abendessen",
      date: "2026-08-31",
      recipeId: candidates[1].recipeId,
      recipeTitle: "Curry",
      recipeServings: 8,
      isFallback: false,
    });
    expect(out[1]).toMatchObject({
      date: "2026-09-06",
      mealType: "mittagessen",
      recipeTitle: "Rösti",
      isFallback: true,
    });
  });

  it("uebernimmt neue Vorschlaege ohne Rezept-ID und Resten-Datum", () => {
    const out = mapPlanEntries(
      [
        {
          day_index: 1,
          meal_type: "abendessen",
          candidate_index: null,
          new_title: "Fischknusperli",
          new_description: "Knusprig.",
          reason: "z",
          leftover_of_day: null,
        },
        {
          day_index: 2,
          meal_type: "abendessen",
          candidate_index: 1,
          new_title: null,
          new_description: null,
          reason: "Reste",
          leftover_of_day: 1,
        },
      ],
      candidates,
      "2026-08-31",
    );
    expect(out[0]).toMatchObject({
      recipeId: null,
      newTitle: "Fischknusperli",
      newDescription: "Knusprig.",
    });
    expect(out[1].leftoverOfDate).toBe("2026-09-01");
  });

  it("verwirft ungueltige Indizes, Tage und leere Eintraege", () => {
    const out = mapPlanEntries(
      [
        {
          day_index: 0,
          meal_type: "abendessen",
          candidate_index: 99,
          new_title: null,
          new_description: null,
          reason: "",
          leftover_of_day: null,
        },
        {
          day_index: 9,
          meal_type: "abendessen",
          candidate_index: 0,
          new_title: null,
          new_description: null,
          reason: "",
          leftover_of_day: null,
        },
        {
          day_index: 0,
          meal_type: "abendessen",
          candidate_index: null,
          new_title: null,
          new_description: null,
          reason: "",
          leftover_of_day: null,
        },
      ],
      candidates,
      "2026-08-31",
    );
    expect(out).toEqual([]);
  });
});
