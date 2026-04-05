/**
 * Bidirektionaler Einheitenumrechner mit zutatenbewusster Konvertierung
 *
 * Unterstützt: Volumen, Gewicht, Temperatur, Löffel (US ↔ CH)
 */

// ── Konvertierungskategorien ────────────────────────────────────────────────

export type ConversionCategory = "volumen" | "gewicht" | "temperatur" | "loeffel";

export interface UnitInfo {
  id: string;
  label: string;
  category: ConversionCategory;
}

export const UNITS: UnitInfo[] = [
  // Volumen
  { id: "cup", label: "Cup (US)", category: "volumen" },
  { id: "fl_oz", label: "fl oz (US)", category: "volumen" },
  { id: "pint", label: "Pint (US)", category: "volumen" },
  { id: "quart", label: "Quart (US)", category: "volumen" },
  { id: "gallon", label: "Gallon (US)", category: "volumen" },
  { id: "ml", label: "ml", category: "volumen" },
  { id: "dl", label: "dl", category: "volumen" },
  { id: "l", label: "l", category: "volumen" },

  // Gewicht
  { id: "oz", label: "oz (Unze)", category: "gewicht" },
  { id: "lb", label: "lb (Pfund)", category: "gewicht" },
  { id: "g", label: "g", category: "gewicht" },
  { id: "kg", label: "kg", category: "gewicht" },

  // Temperatur
  { id: "fahrenheit", label: "°F", category: "temperatur" },
  { id: "celsius", label: "°C", category: "temperatur" },

  // Löffel
  { id: "tbsp", label: "tbsp (US)", category: "loeffel" },
  { id: "tsp", label: "tsp (US)", category: "loeffel" },
  { id: "EL", label: "EL", category: "loeffel" },
  { id: "TL", label: "TL", category: "loeffel" },
  { id: "KL", label: "KL (Kaffeelöffel)", category: "loeffel" },
];

export const CATEGORY_LABELS: Record<ConversionCategory, string> = {
  volumen: "Volumen",
  gewicht: "Gewicht",
  temperatur: "Temperatur",
  loeffel: "Löffel",
};

export function getUnitsForCategory(category: ConversionCategory): UnitInfo[] {
  return UNITS.filter((u) => u.category === category);
}

// ── Konvertierungsfaktoren (alles auf Basiseinheit normalisiert) ─────────────

// Volumen: Basis = ml
const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  dl: 100,
  l: 1000,
  cup: 236.588,
  fl_oz: 29.5735,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

// Gewicht: Basis = g
const WEIGHT_TO_G: Record<string, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

// Löffel: Basis = ml
const SPOON_TO_ML: Record<string, number> = {
  tbsp: 14.787,
  tsp: 4.929,
  EL: 15,
  TL: 5,
  KL: 3,
};

// ── Zutatenbewusste Konvertierung (Dichte: g pro 1 US Cup = 236.588 ml) ────

export interface IngredientInfo {
  id: string;
  label: string;
  gramsPerCup: number;
}

export const INGREDIENT_DENSITIES: IngredientInfo[] = [
  { id: "mehl", label: "Mehl (Weissmehl)", gramsPerCup: 125 },
  { id: "mehl_vollkorn", label: "Mehl (Vollkorn)", gramsPerCup: 130 },
  { id: "zucker", label: "Zucker", gramsPerCup: 200 },
  { id: "puderzucker", label: "Puderzucker", gramsPerCup: 120 },
  { id: "brauner_zucker", label: "Brauner Zucker", gramsPerCup: 220 },
  { id: "butter", label: "Butter", gramsPerCup: 227 },
  { id: "milch", label: "Milch", gramsPerCup: 245 },
  { id: "wasser", label: "Wasser", gramsPerCup: 237 },
  { id: "reis", label: "Reis", gramsPerCup: 185 },
  { id: "haferflocken", label: "Haferflocken", gramsPerCup: 90 },
  { id: "kakao", label: "Kakao", gramsPerCup: 85 },
  { id: "honig", label: "Honig", gramsPerCup: 340 },
  { id: "oel", label: "Öl", gramsPerCup: 218 },
  { id: "rahm", label: "Rahm (Sahne)", gramsPerCup: 240 },
  { id: "maisstaerke", label: "Maisstärke", gramsPerCup: 128 },
  { id: "mandeln_gemahlen", label: "Mandeln (gemahlen)", gramsPerCup: 96 },
  { id: "nuesse_gehackt", label: "Nüsse (gehackt)", gramsPerCup: 120 },
  { id: "schokoladenstueckchen", label: "Schokoladenstückchen", gramsPerCup: 170 },
  { id: "parmesan", label: "Parmesan (gerieben)", gramsPerCup: 100 },
  { id: "paniermehl", label: "Paniermehl", gramsPerCup: 108 },
  { id: "griess", label: "Griess", gramsPerCup: 170 },
];

// ── Hauptfunktion ───────────────────────────────────────────────────────────

export interface ConversionResult {
  value: number;
  formatted: string;
  unit: string;
  ingredientUsed: boolean;
}

/**
 * Konvertiert einen Wert zwischen zwei Einheiten.
 *
 * Wenn eine Zutat angegeben ist UND die Konvertierung zwischen Volumen und
 * Gewicht stattfindet, wird die zutatenbewusste Dichte verwendet.
 */
export function convertUnit(
  amount: number,
  fromUnitId: string,
  toUnitId: string,
  ingredientId?: string,
): ConversionResult | null {
  if (fromUnitId === toUnitId) {
    return { value: amount, formatted: formatResult(amount), unit: toUnitId, ingredientUsed: false };
  }

  // Temperatur: Spezialfall (nicht linear skalierbar)
  if (fromUnitId === "fahrenheit" && toUnitId === "celsius") {
    const c = Math.round(((amount - 32) * 5) / 9);
    return { value: c, formatted: formatResult(c), unit: "celsius", ingredientUsed: false };
  }
  if (fromUnitId === "celsius" && toUnitId === "fahrenheit") {
    const f = Math.round((amount * 9) / 5 + 32);
    return { value: f, formatted: formatResult(f), unit: "fahrenheit", ingredientUsed: false };
  }

  // Prüfe ob Volumen ↔ Gewicht mit Zutat konvertiert werden soll
  const fromIsVolume = fromUnitId in VOLUME_TO_ML || fromUnitId in SPOON_TO_ML;
  const toIsVolume = toUnitId in VOLUME_TO_ML || toUnitId in SPOON_TO_ML;
  const fromIsWeight = fromUnitId in WEIGHT_TO_G;
  const toIsWeight = toUnitId in WEIGHT_TO_G;

  if (fromIsVolume && toIsWeight && ingredientId) {
    return convertVolumeToWeight(amount, fromUnitId, toUnitId, ingredientId);
  }
  if (fromIsWeight && toIsVolume && ingredientId) {
    return convertWeightToVolume(amount, fromUnitId, toUnitId, ingredientId);
  }

  // Volumen → Volumen (inkl. Löffel, beide in ml normalisiert)
  const allVolumeToMl = { ...VOLUME_TO_ML, ...SPOON_TO_ML };
  if (fromUnitId in allVolumeToMl && toUnitId in allVolumeToMl) {
    const ml = amount * allVolumeToMl[fromUnitId];
    const result = ml / allVolumeToMl[toUnitId];
    return { value: result, formatted: formatResult(result), unit: toUnitId, ingredientUsed: false };
  }

  // Gewicht → Gewicht
  if (fromIsWeight && toIsWeight) {
    const g = amount * WEIGHT_TO_G[fromUnitId];
    const result = g / WEIGHT_TO_G[toUnitId];
    return { value: result, formatted: formatResult(result), unit: toUnitId, ingredientUsed: false };
  }

  return null;
}

// ── Zutatenbewusste Helfer ──────────────────────────────────────────────────

function convertVolumeToWeight(
  amount: number,
  fromUnitId: string,
  toUnitId: string,
  ingredientId: string,
): ConversionResult | null {
  const ingredient = INGREDIENT_DENSITIES.find((i) => i.id === ingredientId);
  if (!ingredient) return null;

  // Volumeneinheit → Cups → Gramm → Ziel-Gewichtseinheit
  const allVolumeToMl = { ...VOLUME_TO_ML, ...SPOON_TO_ML };
  const mlFactor = allVolumeToMl[fromUnitId];
  if (mlFactor === undefined) return null;

  const cups = (amount * mlFactor) / 236.588;
  const grams = cups * ingredient.gramsPerCup;
  const result = grams / WEIGHT_TO_G[toUnitId];

  return { value: result, formatted: formatResult(result), unit: toUnitId, ingredientUsed: true };
}

function convertWeightToVolume(
  amount: number,
  fromUnitId: string,
  toUnitId: string,
  ingredientId: string,
): ConversionResult | null {
  const ingredient = INGREDIENT_DENSITIES.find((i) => i.id === ingredientId);
  if (!ingredient) return null;

  // Gewichtseinheit → Gramm → Cups → Ziel-Volumeneinheit
  const grams = amount * WEIGHT_TO_G[fromUnitId];
  const cups = grams / ingredient.gramsPerCup;
  const ml = cups * 236.588;

  const allVolumeToMl = { ...VOLUME_TO_ML, ...SPOON_TO_ML };
  const toFactor = allVolumeToMl[toUnitId];
  if (toFactor === undefined) return null;

  const result = ml / toFactor;
  return { value: result, formatted: formatResult(result), unit: toUnitId, ingredientUsed: true };
}

// ── Formatierung ────────────────────────────────────────────────────────────

function formatResult(n: number): string {
  if (n === 0 || Number.isInteger(n)) return n.toString();
  if (Math.abs(n) >= 100) return Math.round(n).toString();
  if (Math.abs(n) >= 10) return n.toFixed(1).replace(/\.0$/, "");
  if (Math.abs(n) >= 0.01) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  // Kleine Werte: signifikante Stellen beibehalten statt auf "0" zu runden
  return parseFloat(n.toPrecision(3)).toString();
}

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * Bestimmt ob eine Zutatenwahl bei der aktuellen Einheitenkombination
 * relevant ist (d.h. Volumen ↔ Gewicht).
 */
export function isIngredientRelevant(fromUnitId: string, toUnitId: string): boolean {
  const allVolume = { ...VOLUME_TO_ML, ...SPOON_TO_ML };
  const fromIsVolume = fromUnitId in allVolume;
  const toIsVolume = toUnitId in allVolume;
  const fromIsWeight = fromUnitId in WEIGHT_TO_G;
  const toIsWeight = toUnitId in WEIGHT_TO_G;

  return (fromIsVolume && toIsWeight) || (fromIsWeight && toIsVolume);
}

/** Gibt die Einheitsbezeichnung für die Anzeige zurück. */
export function getUnitLabel(unitId: string): string {
  return UNITS.find((u) => u.id === unitId)?.label ?? unitId;
}

// ── Schnellreferenz-Tabelle ─────────────────────────────────────────────────

export interface QuickReference {
  from: string;
  to: string;
  note?: string;
}

export const QUICK_REFERENCES: QuickReference[] = [
  { from: "1 Cup", to: "2.37 dl" },
  { from: "1 oz", to: "28.35 g" },
  { from: "1 lb", to: "453.6 g" },
  { from: "1 tbsp", to: "1 EL (15 ml)" },
  { from: "1 tsp", to: "1 TL (5 ml)" },
  { from: "350 °F", to: "177 °C" },
  { from: "1 Cup Mehl", to: "125 g", note: "zutatenbewusst" },
  { from: "1 Cup Zucker", to: "200 g", note: "zutatenbewusst" },
  { from: "1 Cup Butter", to: "227 g", note: "zutatenbewusst" },
  { from: "1 Pint", to: "4.73 dl" },
];