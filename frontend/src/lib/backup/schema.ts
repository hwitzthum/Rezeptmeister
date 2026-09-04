/**
 * Backup-Format v1 — eine Quelle für Export-Typisierung und Import-Validierung.
 *
 * Rezepte bauen auf `recipeBodySchema` auf, damit ein Backup exakt das
 * enthält, was `POST /api/recipes` auch annehmen würde. Bilder sind nur als
 * Verweis (Pfad/URL) enthalten; Einbettungen und Schlüssel nie.
 */

import { z } from "zod";
import { recipeBodySchema, ingredientSchema } from "@/lib/schemas";

export const BACKUP_FORMAT = "rezeptmeister-backup" as const;
export const BACKUP_VERSION = 1 as const;

const uuid = z.string().uuid();
const isoDate = z.string().min(1);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const backupImageSchema = z.object({
  id: uuid,
  filePath: z.string(),
  fileName: z.string().nullable(),
  mimeType: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sourceType: z.enum(["upload", "ai_generated", "web_import"]),
  altText: z.string().nullable(),
  isPrimary: z.boolean(),
  /** Relative App-URL (/api/uploads/…) — gültig nur in der exportierenden Installation. */
  url: z.string(),
});

export const backupNoteSchema = z.object({
  content: z.string().min(1).max(10000),
  noteType: z.enum([
    "tipp",
    "variation",
    "erinnerung",
    "bewertung",
    "allgemein",
  ]),
  rating: z.number().int().min(1).max(5).nullable(),
  createdAt: isoDate,
});

export const backupCookLogSchema = z.object({
  cookedOn: dateOnly,
  servings: z.number().int().min(1).max(999).nullable(),
  note: z.string().max(500).nullable(),
});

export const backupRecipeSchema = recipeBodySchema.extend({
  id: uuid,
  sourceUrl: z.string().nullable().optional(),
  isFavorite: z.boolean().default(false),
  nutritionInfo: z.unknown().nullable().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
  ingredients: z.array(ingredientSchema).max(200).default([]),
  notes: z.array(backupNoteSchema).max(500).default([]),
  cookLogs: z.array(backupCookLogSchema).max(2000).default([]),
  images: z.array(backupImageSchema).max(100).default([]),
});

export const backupCollectionSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(255),
  description: z.string().nullable(),
  coverImageId: uuid.nullable(),
  /** In Sortierreihenfolge. Ohne Obergrenze, aus demselben Grund wie die
   *  Listen in `backupSchema`: eine Sammlung darf jedes Rezept enthalten. */
  recipeIds: z.array(uuid),
  createdAt: isoDate,
});

export const backupMealPlanSchema = z.object({
  date: dateOnly,
  mealType: z.enum(["fruehstueck", "mittagessen", "abendessen", "snack"]),
  recipeId: uuid,
  servingsOverride: z.number().int().min(1).nullable(),
  notes: z.string().max(2000).nullable(),
});

export const backupShoppingItemSchema = z.object({
  ingredientName: z.string().min(1).max(255),
  amount: z.number().nullable(),
  unit: z.string().max(50).nullable(),
  isChecked: z.boolean(),
  aisleCategory: z.string().max(100).nullable(),
  sortOrder: z.number().int(),
  recipeId: uuid.nullable(),
});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: isoDate,
  app: z.object({ name: z.string(), version: z.string() }).optional(),
  user: z
    .object({ email: z.string().nullable(), name: z.string().nullable() })
    .optional(),
  // Bewusst ohne Stueckzahl-Grenzen: /api/export schreibt alles, was der
  // Nutzerin gehoert, ohne Obergrenze. Jede Zahl hier waere kleiner als das,
  // was der Export erzeugen kann, sobald ein Konto entsprechend waechst — das
  // Backup liesse sich dann herunterladen, aber nicht mehr einspielen (real
  // aufgetreten bei mehr als 1000 Sammlungen). Die Nutzlast begrenzt die
  // Import-Route ueber ihre 20-MB-Schranke; die gilt unabhaengig davon, wie
  // sich die Eintraege auf die Listen verteilen, und kann nicht auseinander-
  // driften. Die Grenzen *innerhalb* eines Eintrags bleiben bestehen: sie
  // schuetzen die Spaltenbreiten der Datenbank.
  recipes: z.array(backupRecipeSchema),
  collections: z.array(backupCollectionSchema).default([]),
  mealPlans: z.array(backupMealPlanSchema).default([]),
  shoppingList: z.array(backupShoppingItemSchema).default([]),
});

export type BackupV1 = z.infer<typeof backupSchema>;
export type BackupRecipe = z.infer<typeof backupRecipeSchema>;
export type BackupCollection = z.infer<typeof backupCollectionSchema>;
