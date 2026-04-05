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

export type SwissUnit = (typeof SWISS_UNITS)[number];

// ── US → Schweizer Masseinheiten ─────────────────────────────────────────────

const CONVERSIONS: Record<string, { factor: number; unit: string }> = {
  cup: { factor: 2.37, unit: "dl" },
  cups: { factor: 2.37, unit: "dl" },
  oz: { factor: 28.35, unit: "g" },
  lb: { factor: 453.59, unit: "g" },
  lbs: { factor: 453.59, unit: "g" },
  pound: { factor: 453.59, unit: "g" },
  pounds: { factor: 453.59, unit: "g" },
  tbsp: { factor: 1, unit: "EL" },
  tablespoon: { factor: 1, unit: "EL" },
  tablespoons: { factor: 1, unit: "EL" },
  tsp: { factor: 1, unit: "TL" },
  teaspoon: { factor: 1, unit: "TL" },
  teaspoons: { factor: 1, unit: "TL" },
};

/**
 * Konvertiert US-Einheiten in Schweizer Einheiten.
 * Gibt null zurück wenn keine Konvertierung bekannt.
 */
export function convertAmount(
  amount: number,
  fromUnit: string,
): { amount: number; unit: string } | null {
  const conv = CONVERSIONS[fromUnit.toLowerCase().trim()];
  if (!conv) return null;
  return {
    amount: Math.round(amount * conv.factor * 100) / 100,
    unit: conv.unit,
  };
}

/** Konvertiert Grad Fahrenheit in Grad Celsius. */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return Math.round(((fahrenheit - 32) * 5) / 9);
}

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
