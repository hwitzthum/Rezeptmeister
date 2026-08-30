/**
 * Normalisierung von KI-/Import-Extraktionen auf das Rezept-Schema.
 *
 * URL-Import, OCR und Rezeptgenerierung liefern freie Strings und Zahlen
 * (Schwierigkeit «Einfach»/«leicht», Menge 0, leere Zutatennamen, 30 Tags,
 * 80 Zeichen lange Kategorien). `recipeBodySchema` ist bewusst strikt und
 * lehnt das mit «Validierungsfehler.» ab — ohne dass die Nutzerin im
 * Vorschau-Panel etwas Falsches sieht. Diese Schicht bringt jede Extraktion
 * deterministisch in eine Form, die das Schema besteht; das Schema bleibt
 * die einzige Wahrheit, was gültig ist.
 */

import { recipeBodySchema, type ingredientSchema } from "@/lib/schemas";
import type { z } from "zod";

export type RecipePayload = z.input<typeof recipeBodySchema>;
type IngredientPayload = z.input<typeof ingredientSchema>;
type Difficulty = "einfach" | "mittel" | "anspruchsvoll";
type SourceType = RecipePayload["sourceType"];

/** Rohform, wie sie OCR, URL-Import und `generate-recipe` liefern. */
export interface ExtractedIngredient {
  name: string;
  amount?: number | null;
  unit?: string | null;
  notes?: string | null;
}

export interface ExtractedRecipe {
  title: string;
  description?: string | null;
  servings?: number | null;
  prep_time_minutes?: number | null;
  cook_time_minutes?: number | null;
  difficulty?: string | null;
  ingredients?: ExtractedIngredient[] | null;
  instructions: string;
  tags?: string[] | null;
  category?: string | null;
  cuisine?: string | null;
}

/** Felder, die die Nutzerin im Vorschau-Panel überschreiben kann. */
export interface ExtractionOverrides {
  title?: string;
  description?: string;
  instructions?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  difficulty?: string;
}

// Schemalimits — spiegeln `recipeBodySchema`, damit das Kürzen dort greift,
// wo das Schema sonst ablehnen würde.
const LIMITS = {
  title: 500,
  description: 5000,
  instructions: 50000,
  category: 100,
  cuisine: 100,
  tag: 50,
  tags: 20,
  ingredientName: 255,
  unit: 50,
  ingredients: 200,
  servingsMax: 999,
  minutesMax: 9999,
} as const;

const DIFFICULTY_ALIASES: Record<string, Difficulty> = {
  einfach: "einfach",
  leicht: "einfach",
  simpel: "einfach",
  simple: "einfach",
  easy: "einfach",
  anfaenger: "einfach",
  mittel: "mittel",
  medium: "mittel",
  mittelschwer: "mittel",
  normal: "mittel",
  anspruchsvoll: "anspruchsvoll",
  schwer: "anspruchsvoll",
  schwierig: "anspruchsvoll",
  hard: "anspruchsvoll",
  difficult: "anspruchsvoll",
  fortgeschritten: "anspruchsvoll",
};

/** «Einfach», «leicht», «Medium» → Schema-Wert; Unbekanntes → undefined. */
export function normalizeDifficulty(
  value: string | null | undefined,
): Difficulty | undefined {
  if (!value) return undefined;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  return DIFFICULTY_ALIASES[key];
}

function clampText(
  value: string | null | undefined,
  max: number,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

function clampMinutes(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  if (rounded <= 0) return undefined;
  return Math.min(rounded, LIMITS.minutesMax);
}

function clampServings(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 4;
  const rounded = Math.round(value);
  if (rounded < 1) return 4;
  return Math.min(rounded, LIMITS.servingsMax);
}

function normalizeAmount(value: number | null | undefined): number | undefined {
  if (value == null || !Number.isFinite(value) || value <= 0) return undefined;
  // decimal(10,3) in der DB — mehr Stellen wären ohnehin verloren.
  return Math.round(value * 1000) / 1000;
}

export function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const tag = clampText(raw, LIMITS.tag);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= LIMITS.tags) break;
  }
  return result;
}

export function normalizeIngredients(
  ingredients: ExtractedIngredient[] | null | undefined,
): IngredientPayload[] {
  if (!ingredients) return [];
  const result: IngredientPayload[] = [];
  for (const ing of ingredients) {
    const name = clampText(ing?.name, LIMITS.ingredientName);
    if (!name) continue;
    result.push({
      name,
      amount: normalizeAmount(ing.amount),
      unit: clampText(ing.unit, LIMITS.unit),
      sortOrder: result.length,
      isOptional: false,
    });
    if (result.length >= LIMITS.ingredients) break;
  }
  return result;
}

/**
 * Baut den Body für `POST /api/recipes` aus einer Extraktion. Overrides
 * (vom Vorschau-Formular) haben Vorrang vor den extrahierten Werten.
 * Wirft, falls das Ergebnis das Schema wider Erwarten nicht besteht — das
 * wäre ein Programmierfehler in dieser Datei, kein Nutzerfehler.
 */
export function toRecipePayload(
  result: ExtractedRecipe,
  sourceType: SourceType,
  overrides: ExtractionOverrides = {},
): RecipePayload {
  const payload: RecipePayload = {
    title: clampText(overrides.title ?? result.title, LIMITS.title) ?? "",
    description: clampText(
      overrides.description ?? result.description,
      LIMITS.description,
    ),
    instructions:
      clampText(
        overrides.instructions ?? result.instructions,
        LIMITS.instructions,
      ) ?? "",
    servings: clampServings(overrides.servings ?? result.servings),
    prepTimeMinutes: clampMinutes(
      overrides.prepTimeMinutes ?? result.prep_time_minutes,
    ),
    cookTimeMinutes: clampMinutes(
      overrides.cookTimeMinutes ?? result.cook_time_minutes,
    ),
    difficulty: normalizeDifficulty(overrides.difficulty ?? result.difficulty),
    category: clampText(result.category, LIMITS.category),
    cuisine: clampText(result.cuisine, LIMITS.cuisine),
    tags: normalizeTags(result.tags),
    sourceType,
    ingredients: normalizeIngredients(result.ingredients),
  };

  const check = recipeBodySchema.safeParse(payload);
  if (!check.success) {
    // Titel/Anleitung leer sind die einzigen legitimen Restfälle — die
    // Aufrufer prüfen sie vorher und zeigen eine verständliche Meldung.
    throw new Error(formatValidationDetails(check.error.flatten()));
  }
  return payload;
}

/** Deutsche Feldnamen für Validierungsmeldungen. */
const FIELD_LABELS: Record<string, string> = {
  title: "Titel",
  description: "Beschreibung",
  instructions: "Zubereitung",
  servings: "Portionen",
  prepTimeMinutes: "Vorbereitungszeit",
  cookTimeMinutes: "Kochzeit",
  difficulty: "Schwierigkeitsgrad",
  category: "Kategorie",
  cuisine: "Küche",
  tags: "Tags",
  ingredients: "Zutaten",
  imageId: "Bild",
};

/**
 * Macht aus `parsed.error.flatten()` eine Zeile für die Nutzerin:
 * «Schwierigkeitsgrad: Invalid option …». Ohne Details bleibt es bei der
 * generischen Meldung.
 */
export function formatValidationDetails(
  details:
    | {
        fieldErrors?: Record<string, string[] | undefined>;
        formErrors?: string[];
      }
    | undefined,
): string {
  const generic = "Validierungsfehler.";
  if (!details) return generic;
  const fieldErrors = details.fieldErrors ?? {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const message = messages?.[0];
    if (message)
      return `${generic} ${FIELD_LABELS[field] ?? field}: ${message}`;
  }
  const formError = details.formErrors?.[0];
  return formError ? `${generic} ${formError}` : generic;
}
