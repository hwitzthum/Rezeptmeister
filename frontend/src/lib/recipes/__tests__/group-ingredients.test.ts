import { describe, it, expect } from "vitest";
import { groupIngredients } from "../group-ingredients";

const ing = (name: string, groupName: string | null) => ({ name, groupName });

describe("groupIngredients", () => {
  it("liefert eine einzige Gruppe ohne Namen, wenn keine Gruppen gesetzt sind", () => {
    expect(groupIngredients([ing("Mehl", null), ing("Salz", null)])).toEqual([
      { name: null, items: [ing("Mehl", null), ing("Salz", null)] },
    ]);
  });

  it("stellt Ungruppiertes voran und behält die Reihenfolge des ersten Auftretens", () => {
    const result = groupIngredients([
      ing("Tomaten", "Sauce"),
      ing("Mehl", null),
      ing("Rahm", "Guss"),
      ing("Zwiebel", "Sauce"),
    ]);
    expect(result.map((g) => g.name)).toEqual([null, "Sauce", "Guss"]);
    expect(result[1].items.map((i) => i.name)).toEqual(["Tomaten", "Zwiebel"]);
  });

  it("behandelt leere und nur aus Leerzeichen bestehende Namen als ungruppiert", () => {
    const result = groupIngredients([ing("Mehl", ""), ing("Salz", "  ")]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBeNull();
  });

  it("gibt bei leerer Liste nichts zurück", () => {
    expect(groupIngredients([])).toEqual([]);
  });
});
