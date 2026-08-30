/**
 * Aus den DB-Zeilen eines Nutzers wird ein `BackupV1`. Reine Funktion —
 * ohne DB testbar. Sensible Spalten (Einbettungen, OCR-Text, Schlüssel)
 * kommen hier gar nicht erst an: der Aufrufer selektiert sie nicht.
 */

import { normaliseImageSrc } from "@/lib/images";
import { BACKUP_FORMAT, BACKUP_VERSION, type BackupV1 } from "./schema";

type Difficulty = "einfach" | "mittel" | "anspruchsvoll";
type SourceType =
  "manual" | "image_ocr" | "url_import" | "ai_generated" | "web_search";

export interface ExportRow {
  email: string;
  name: string | null;
  recipes: {
    id: string;
    title: string;
    description: string | null;
    instructions: string;
    servings: number;
    prepTimeMinutes: number | null;
    cookTimeMinutes: number | null;
    difficulty: Difficulty | null;
    sourceType: SourceType;
    sourceUrl: string | null;
    category: string | null;
    cuisine: string | null;
    tags: string[] | null;
    isFavorite: boolean;
    nutritionInfo: unknown;
    createdAt: Date;
    updatedAt: Date;
    ingredients: {
      name: string;
      amount: string | null;
      unit: string | null;
      groupName: string | null;
      sortOrder: number;
      isOptional: boolean;
    }[];
    images: {
      id: string;
      filePath: string;
      fileName: string | null;
      mimeType: string;
      width: number | null;
      height: number | null;
      sourceType: "upload" | "ai_generated" | "web_import";
      altText: string | null;
      isPrimary: boolean;
    }[];
    recipeNotes: {
      content: string;
      noteType: "tipp" | "variation" | "erinnerung" | "bewertung" | "allgemein";
      rating: number | null;
      createdAt: Date;
    }[];
    recipeCookLogs: {
      cookedOn: string;
      servings: number | null;
      note: string | null;
    }[];
  }[];
  collections: {
    id: string;
    name: string;
    description: string | null;
    coverImageId: string | null;
    createdAt: Date;
    collectionRecipes: { recipeId: string; sortOrder: number }[];
  }[];
  mealPlans: {
    date: string;
    mealType: "fruehstueck" | "mittagessen" | "abendessen" | "snack";
    recipeId: string;
    servingsOverride: number | null;
    notes: string | null;
  }[];
  shoppingListItems: {
    ingredientName: string;
    amount: string | null;
    unit: string | null;
    isChecked: boolean;
    aisleCategory: string | null;
    sortOrder: number;
    recipeId: string | null;
  }[];
}

function toNumber(value: string | null): number | null {
  if (value == null) return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function buildBackup(row: ExportRow, now: Date = new Date()): BackupV1 {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    app: { name: "Rezeptmeister", version: "1" },
    user: { email: row.email, name: row.name },
    recipes: row.recipes
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description ?? undefined,
        instructions: r.instructions,
        servings: r.servings,
        prepTimeMinutes: r.prepTimeMinutes,
        cookTimeMinutes: r.cookTimeMinutes,
        difficulty: r.difficulty,
        category: r.category ?? undefined,
        cuisine: r.cuisine ?? undefined,
        tags: r.tags ?? [],
        sourceType: r.sourceType,
        sourceUrl: r.sourceUrl,
        isFavorite: r.isFavorite,
        nutritionInfo: r.nutritionInfo ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        ingredients: r.ingredients
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((ing, idx) => ({
            name: ing.name,
            amount: toNumber(ing.amount),
            unit: ing.unit ?? undefined,
            groupName: ing.groupName ?? undefined,
            sortOrder: idx,
            isOptional: ing.isOptional,
          })),
        notes: r.recipeNotes.map((n) => ({
          content: n.content,
          noteType: n.noteType,
          rating: n.rating,
          createdAt: n.createdAt.toISOString(),
        })),
        cookLogs: r.recipeCookLogs.map((c) => ({
          cookedOn: c.cookedOn,
          servings: c.servings,
          note: c.note,
        })),
        images: r.images.map((img) => ({
          id: img.id,
          filePath: img.filePath,
          fileName: img.fileName,
          mimeType: img.mimeType,
          width: img.width,
          height: img.height,
          sourceType: img.sourceType,
          altText: img.altText,
          isPrimary: img.isPrimary,
          url: normaliseImageSrc(img.filePath),
        })),
      })),
    collections: row.collections.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      coverImageId: c.coverImageId,
      recipeIds: c.collectionRecipes
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cr) => cr.recipeId),
      createdAt: c.createdAt.toISOString(),
    })),
    mealPlans: row.mealPlans.map((m) => ({
      date: m.date,
      mealType: m.mealType,
      recipeId: m.recipeId,
      servingsOverride: m.servingsOverride,
      notes: m.notes,
    })),
    shoppingList: row.shoppingListItems.map((s) => ({
      ingredientName: s.ingredientName,
      amount: toNumber(s.amount),
      unit: s.unit,
      isChecked: s.isChecked,
      aisleCategory: s.aisleCategory,
      sortOrder: s.sortOrder,
      recipeId: s.recipeId,
    })),
  };
}

export function backupFileName(now: Date = new Date()): string {
  return `rezeptmeister-backup-${now.toISOString().slice(0, 10)}.json`;
}
