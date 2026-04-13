/**
 * Schweizer Masseinheiten – Konstanten, Konvertierung und Formatierung
 */

// ── Einheiten-Liste ───────────────────────────────────────────────────────────

export const SWISS_UNITS = [
  "g",
  "kg",
  "ml",
  "dl",
  "l",
  "EL",
  "TL",
  "KL",
  "Msp.",
  "Prise",
  "Stk.",
  "Bund",
  "Pkg.",
  "Scheibe",
  "Dose",
  "Becher",
  "Pfd.",
] as const;

// ── Anzeige-Formatierung ─────────────────────────────────────────────────────

const FRACTIONS: [number, string][] = [
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/**
 * Formatiert eine Zutatenmenge für die Anzeige.
 * 1.0 → "1",  0.5 → "½",  1.5 → "1½",  0.333 → "⅓",  2.75 → "2¾"
 */
export function formatAmount(n: number): string {
  if (!n || n <= 0) return "";
  const whole = Math.floor(n);
  const frac = n - whole;

  if (frac < 0.04) {
    return whole > 0 ? whole.toString() : "";
  }

  for (const [val, sym] of FRACTIONS) {
    if (Math.abs(frac - val) < 0.04) {
      return whole > 0 ? `${whole}${sym}` : sym;
    }
  }

  // Fallback: Dezimalzahl (max. 2 Nachkommastellen)
  const rounded = Math.round(n * 100) / 100;
  return rounded.toString().replace(/\.?0+$/, "");
}

// ── Kategorien & Küchen (Autocomplete) ───────────────────────────────────────

export const KATEGORIEN = [
  "Frühstück",
  "Mittagessen",
  "Abendessen",
  "Snack",
  "Dessert",
  "Beilage",
  "Suppe",
  "Salat",
  "Backen",
  "Getränke",
] as const;

export const KUECHEN = [
  "Schweizer",
  "Italienisch",
  "Französisch",
  "Deutsch",
  "Asiatisch",
  "Mexikanisch",
  "Griechisch",
  "Indisch",
  "Amerikanisch",
  "International",
] as const;

// ── Re-Exports aus converter.ts ─────────────────────────────────────────────

export {
  convertUnit,
  isIngredientRelevant,
  getUnitLabel,
  getUnitsForCategory,
  UNITS,
  CATEGORY_LABELS,
  INGREDIENT_DENSITIES,
  QUICK_REFERENCES,
} from "./converter";

export type {
  ConversionCategory,
  UnitInfo,
  IngredientInfo,
  ConversionResult,
  QuickReference,
} from "./converter";
