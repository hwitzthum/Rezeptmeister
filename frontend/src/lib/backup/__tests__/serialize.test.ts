import { describe, it, expect } from "vitest";
import { buildBackup, backupFileName, type ExportRow } from "../serialize";
import { backupSchema } from "../schema";
import { recipeDuplicateKey } from "../duplicates";

function row(): ExportRow {
  return {
    email: "test@example.ch",
    name: "Test",
    recipes: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        title: "Zopf",
        description: null,
        instructions: "Kneten. Backen.",
        servings: 4,
        prepTimeMinutes: 20,
        cookTimeMinutes: 40,
        difficulty: "mittel",
        sourceType: "manual",
        sourceUrl: null,
        category: "Backen",
        cuisine: "Schweizer",
        tags: ["Sonntag"],
        isFavorite: true,
        nutritionInfo: null,
        createdAt: new Date("2026-02-02T10:00:00Z"),
        updatedAt: new Date("2026-02-03T10:00:00Z"),
        ingredients: [
          {
            name: "Butter",
            amount: "60.000",
            unit: "g",
            groupName: null,
            sortOrder: 1,
            isOptional: false,
          },
          {
            name: "Mehl",
            amount: "500.000",
            unit: "g",
            groupName: null,
            sortOrder: 0,
            isOptional: false,
          },
        ],
        images: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            filePath: "uploads/originals/x.jpg",
            fileName: "x.jpg",
            mimeType: "image/jpeg",
            width: 10,
            height: 10,
            sourceType: "upload",
            altText: null,
            isPrimary: true,
          },
        ],
        recipeNotes: [
          {
            content: "Toll",
            noteType: "bewertung",
            rating: 5,
            createdAt: new Date("2026-02-04T10:00:00Z"),
          },
        ],
        recipeCookLogs: [{ cookedOn: "2026-02-05", servings: 4, note: null }],
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        title: "Älter",
        description: "d",
        instructions: "x",
        servings: 2,
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        difficulty: null,
        sourceType: "url_import",
        sourceUrl: "https://example.com",
        category: null,
        cuisine: null,
        tags: null,
        isFavorite: false,
        nutritionInfo: { kcal: 100 },
        createdAt: new Date("2026-01-01T10:00:00Z"),
        updatedAt: new Date("2026-01-01T10:00:00Z"),
        ingredients: [],
        images: [],
        recipeNotes: [],
        recipeCookLogs: [],
      },
    ],
    collections: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        name: "Sonntag",
        description: null,
        coverImageId: null,
        createdAt: new Date("2026-02-06T10:00:00Z"),
        collectionRecipes: [
          { recipeId: "33333333-3333-4333-8333-333333333333", sortOrder: 1 },
          { recipeId: "11111111-1111-4111-8111-111111111111", sortOrder: 0 },
        ],
      },
    ],
    mealPlans: [
      {
        date: "2026-03-01",
        mealType: "abendessen",
        recipeId: "11111111-1111-4111-8111-111111111111",
        servingsOverride: 2,
        notes: null,
      },
    ],
    shoppingListItems: [
      {
        ingredientName: "Milch",
        amount: "1.000",
        unit: "l",
        isChecked: false,
        aisleCategory: "Milchprodukte",
        sortOrder: 0,
        recipeId: null,
      },
    ],
  };
}

describe("buildBackup", () => {
  it("erzeugt ein Backup, das das eigene Schema besteht", () => {
    const backup = buildBackup(row(), new Date("2026-08-30T12:00:00Z"));
    const result = backupSchema.safeParse(backup);
    expect(result.success, JSON.stringify(result.error?.flatten())).toBe(true);
    expect(backup.exportedAt).toBe("2026-08-30T12:00:00.000Z");
  });

  it("sortiert Rezepte nach Erstellung und Zutaten/Sammlungen nach sortOrder", () => {
    const backup = buildBackup(row());
    expect(backup.recipes.map((r) => r.title)).toEqual(["Älter", "Zopf"]);
    const zopf = backup.recipes[1];
    expect(zopf.ingredients.map((i) => i.name)).toEqual(["Mehl", "Butter"]);
    expect(zopf.ingredients.map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(backup.collections[0].recipeIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("wandelt Dezimal-Strings in Zahlen und Bildpfade in App-URLs", () => {
    const backup = buildBackup(row());
    const zopf = backup.recipes[1];
    expect(zopf.ingredients[0].amount).toBe(500);
    expect(zopf.images[0].url).toBe("/api/uploads/originals/x.jpg");
    expect(backup.shoppingList[0].amount).toBe(1);
  });

  it("enthaelt keine sensiblen oder schweren Felder", () => {
    const json = JSON.stringify(buildBackup(row()));
    expect(json).not.toContain("embedding");
    expect(json).not.toContain("extractedText");
    expect(json).not.toContain("apiKey");
    expect(json).not.toContain("passwordHash");
  });

  it("benennt die Datei nach dem Datum", () => {
    expect(backupFileName(new Date("2026-08-30T22:00:00Z"))).toBe(
      "rezeptmeister-backup-2026-08-30.json",
    );
  });
});

describe("backupSchema", () => {
  it("lehnt fremde Formate und Versionen ab", () => {
    const backup = buildBackup(row());
    expect(
      backupSchema.safeParse({ ...backup, format: "paprika" }).success,
    ).toBe(false);
    expect(backupSchema.safeParse({ ...backup, version: 2 }).success).toBe(
      false,
    );
    expect(backupSchema.safeParse({ recipes: [] }).success).toBe(false);
  });

  it("verlangt gueltige Rezepte (Titel, Anleitung, UUID)", () => {
    const backup = buildBackup(row());
    const kaputt = {
      ...backup,
      recipes: [{ ...backup.recipes[0], title: "" }],
    };
    expect(backupSchema.safeParse(kaputt).success).toBe(false);
    const ohneId = {
      ...backup,
      recipes: [{ ...backup.recipes[0], id: "nope" }],
    };
    expect(backupSchema.safeParse(ohneId).success).toBe(false);
  });

  it("fuellt fehlende Listen mit Defaults", () => {
    const backup = buildBackup(row());
    const minimal = {
      format: backup.format,
      version: backup.version,
      exportedAt: backup.exportedAt,
      recipes: [],
    };
    const parsed = backupSchema.parse(minimal);
    expect(parsed.collections).toEqual([]);
    expect(parsed.mealPlans).toEqual([]);
    expect(parsed.shoppingList).toEqual([]);
  });
});

describe("recipeDuplicateKey", () => {
  it("ignoriert Reihenfolge, Gross-/Kleinschreibung und Leerzeichen", () => {
    expect(recipeDuplicateKey("Zopf", ["Mehl", "Butter"])).toBe(
      recipeDuplicateKey(" zopf ", ["butter ", "MEHL"]),
    );
  });

  it("unterscheidet Rezepte mit anderen Zutaten", () => {
    expect(recipeDuplicateKey("Zopf", ["Mehl"])).not.toBe(
      recipeDuplicateKey("Zopf", ["Mehl", "Ei"]),
    );
  });
});
