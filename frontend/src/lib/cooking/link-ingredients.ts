/**
 * Zutaten ↔ Zubereitungsschritte verknüpfen — rein deterministisch.
 *
 * Aus «2 Zwiebeln» und dem Schritt «Die Zwiebeln im Olivenöl andünsten» wird
 * die Information, dass Schritt 1 die Zutaten «Zwiebel» und «Olivenöl»
 * braucht, samt Position im Text fürs Hervorheben. Kein LLM: das muss bei
 * jedem Rezept sofort, offline und reproduzierbar funktionieren.
 *
 * Kernideen:
 * - Zeichennormalisierung ist **längenerhaltend** (ä→a, nicht ä→ae), damit
 *   Positionen im normalisierten Text 1:1 auf den Originaltext passen.
 *   Deshalb bewusst nicht `normalizeForSearch` aus der Suche.
 * - Beide Seiten werden gleich gestemmt (Zwiebeln/Zwiebel → «zwiebel»,
 *   Tomaten/Tomate → «tomat»), Umlaut-Plurale fallen durch die Faltung
 *   zusammen (Äpfel/Apfel → «apfel»).
 * - Längster Treffer gewinnt: «Olivenöl» vor «Öl», «rote Zwiebel» vor
 *   «Zwiebel», «Tomatenmark» vor «Tomate».
 */

export interface LinkableIngredient {
  id: string;
  name: string;
  isOptional?: boolean;
}

export interface IngredientSpan {
  ingredientId: string;
  /** Position im Originaltext des Schritts. */
  startIndex: number;
  /** Exklusiv. */
  endIndex: number;
  matchedText: string;
}

export interface StepLinks {
  /** Eindeutig, in Reihenfolge des ersten Vorkommens. */
  ingredientIds: string[];
  /** Nach startIndex sortiert, überlappungsfrei. */
  spans: IngredientSpan[];
}

export interface LinkResult {
  /** steps[i] gehört zu steps[i] der Eingabe. */
  steps: StepLinks[];
  /** In keinem Schritt erwähnt — gehören in die Gesamtliste «Weitere Zutaten». */
  unmatchedIngredientIds: string[];
}

// ── Zeichennormalisierung (längenerhaltend) ──────────────────────────────────

const CHAR_MAP: Record<string, string> = {
  ä: "a",
  ö: "o",
  ü: "u",
  ß: "s",
  à: "a",
  á: "a",
  â: "a",
  è: "e",
  é: "e",
  ê: "e",
  ë: "e",
  ì: "i",
  í: "i",
  î: "i",
  ï: "i",
  ò: "o",
  ó: "o",
  ô: "o",
  ù: "u",
  ú: "u",
  û: "u",
  ç: "c",
  ñ: "n",
};

function normalizeChar(c: string): string {
  const lower = c.toLowerCase();
  // toLowerCase kann bei exotischen Zeichen die Länge ändern — dann Original behalten.
  const single = lower.length === 1 ? lower : c;
  return CHAR_MAP[single] ?? single;
}

/** Gleich lang wie die Eingabe — Voraussetzung für die Span-Indizes. */
export function normalizeText(text: string): string {
  let out = "";
  for (const c of text) out += c.length === 1 ? normalizeChar(c) : c;
  return out;
}

// ── Stemming ─────────────────────────────────────────────────────────────────

/** Formen, die die Suffixregeln falsch behandeln würden. Beide Seiten landen hier. */
const IRREGULAR: Record<string, string> = {
  ei: "ei",
  eier: "ei",
  eiern: "ei",
  nuss: "nuss",
  nusse: "nuss",
  nussen: "nuss",
  brot: "brot",
  brote: "brot",
  broten: "brot",
  kase: "kase",
  kases: "kase",
  ol: "ol",
  ole: "ol",
  olen: "ol",
  butter: "butter",
  wasser: "wasser",
  zucker: "zucker",
  pfeffer: "pfeffer",
  kraut: "kraut",
  krauter: "kraut",
  krautern: "kraut",
};

export function stemWord(word: string): string {
  const w = normalizeText(word);
  const irregular = IRREGULAR[w];
  if (irregular) return irregular;
  if (w.endsWith("en") && w.length - 2 >= 3) return w.slice(0, -2);
  if (w.endsWith("er") && w.length - 2 >= 4) return w.slice(0, -2);
  if (w.endsWith("n") && w.length - 1 >= 3) return w.slice(0, -1);
  if (w.endsWith("e") && w.length - 1 >= 3) return w.slice(0, -1);
  if (w.endsWith("s") && w.length - 1 >= 4) return w.slice(0, -1);
  return w;
}

// ── Kandidaten aus Zutatennamen ─────────────────────────────────────────────

const UNIT_WORDS = new Set(
  [
    "g",
    "kg",
    "mg",
    "ml",
    "dl",
    "cl",
    "l",
    "el",
    "tl",
    "kl",
    "msp",
    "prise",
    "prisen",
    "stk",
    "stuck",
    "stucke",
    "bund",
    "pkg",
    "packung",
    "packungen",
    "scheibe",
    "scheiben",
    "dose",
    "dosen",
    "becher",
    "pfd",
    "pfund",
    "gramm",
    "liter",
    "essloffel",
    "teeloffel",
    "kaffeeloffel",
    "messerspitze",
    "tasse",
    "tassen",
    "glas",
    "glaser",
    "zweig",
    "zweige",
    "blatt",
    "blatter",
    "wurfel",
    "tropfen",
    "spritzer",
    "schuss",
    "handvoll",
    "cm",
    "mm",
  ].map(normalizeText),
);

const QUALIFIER_WORDS = new Set(
  [
    "frisch",
    "frische",
    "frischer",
    "frisches",
    "frischen",
    "gehackt",
    "gehackte",
    "gehackter",
    "gerieben",
    "geriebene",
    "geriebener",
    "gross",
    "grosse",
    "grosser",
    "grosses",
    "klein",
    "kleine",
    "kleiner",
    "kleines",
    "weich",
    "weiche",
    "kalt",
    "kalte",
    "warm",
    "warme",
    "fein",
    "feine",
    "feiner",
    "grob",
    "grobe",
    "grober",
    "etwas",
    "wenig",
    "ca",
    "ungefahr",
    "nach",
    "belieben",
    "zum",
    "zur",
    "fur",
    "bio",
    "ganz",
    "ganze",
    "ganzer",
    "halbe",
    "halber",
    "halbiert",
    "geschalt",
    "geschalte",
    "gewurfelt",
    "getrocknet",
    "getrocknete",
    "gemahlen",
    "gemahlene",
    "gemahlener",
    "rest",
    "teil",
    "halfte",
    "portion",
    "evtl",
    "optional",
    "alternativ",
    "reif",
    "reife",
    "roh",
    "rohe",
    "gekocht",
    "gekochte",
    "geraucht",
    "gerauchte",
    "mittelgross",
    "mittelgrosse",
    "zimmerwarm",
    "zimmerwarme",
    "flussig",
    "flussige",
    "fluessig",
    "abgeriebene",
    "abgerieben",
    "ausgepresst",
    "ausgepresste",
    "servieren",
    "garnieren",
    "dazu",
    "oder",
    "und",
    "mit",
    "ohne",
    "aus",
    "vom",
    "von",
    "der",
    "die",
    "das",
    "ein",
    "eine",
    "einen",
    "wenige",
    "einige",
    "je",
    "pro",
    "ist",
    "in",
  ].map(normalizeText),
);

/** Ohne diese Ausnahme dürften Stämme unter 3 Zeichen nicht matchen. */
const SHORT_STEM_ALLOW = new Set(["ei", "ol"]);

const WORD_RE = /\p{L}+/gu;

function isUsefulWord(word: string, stem: string): boolean {
  if (UNIT_WORDS.has(word) || UNIT_WORDS.has(stem)) return false;
  if (QUALIFIER_WORDS.has(word) || QUALIFIER_WORDS.has(stem)) return false;
  if (stem.length < 3 && !SHORT_STEM_ALLOW.has(stem)) return false;
  return true;
}

/**
 * Stamm-Folgen, gegen die ein Schritt abgeglichen wird — längste zuerst.
 * «Butter, weich» → [["butter"]]; «Salz und Pfeffer» → [["salz"], ["pfeffer"]];
 * «rote Zwiebel (gross)» → [["rot","zwiebel"], ["zwiebel"]].
 */
export function ingredientPatterns(name: string): string[][] {
  const base = name.replace(/\([^)]*\)/g, " ").split(/[,;:]/)[0] ?? "";
  const parts = base.split(/\s+(?:und|oder|&)\s+|\s*\/\s*/i);
  const patterns: string[][] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const words = Array.from(
      normalizeText(part).matchAll(WORD_RE),
      (m) => m[0],
    );
    const stems = words
      .map((w) => ({ word: w, stem: stemWord(w) }))
      .filter(({ word, stem }) => isUsefulWord(word, stem))
      .map(({ stem }) => stem);
    if (stems.length === 0) continue;
    const candidates: string[][] = [];
    if (stems.length > 1) candidates.push(stems);
    // Deutsche Komposita sind kopf-final: «rote Zwiebel» → «Zwiebel».
    candidates.push([stems[stems.length - 1]]);
    for (const c of candidates) {
      const key = c.join(" ");
      if (!seen.has(key)) {
        seen.add(key);
        patterns.push(c);
      }
    }
  }

  return patterns.sort((a, b) => b.join(" ").length - a.join(" ").length);
}

// ── Matching ─────────────────────────────────────────────────────────────────

interface Token {
  start: number;
  end: number;
  stem: string;
}

interface Hit {
  ingredientIndex: number;
  start: number;
  end: number;
  exact: boolean;
}

function tokenize(text: string): Token[] {
  const norm = normalizeText(text);
  return Array.from(norm.matchAll(WORD_RE), (m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    stem: stemWord(m[0]),
  }));
}

/** «Mehl» in «Vollkornmehl», «Knoblauch» in «Knoblauchzehen». Nur für Stämme ab 4 Zeichen. */
function compoundMatch(wordStem: string, patternStem: string): boolean {
  if (patternStem.length < 4 || wordStem === patternStem) return false;
  const rest = wordStem.length - patternStem.length;
  if (rest < 3) return false;
  return wordStem.endsWith(patternStem) || wordStem.startsWith(patternStem);
}

function hitsForStep(tokens: Token[], compiled: string[][][]): Hit[] {
  const hits: Hit[] = [];
  compiled.forEach((patterns, ingredientIndex) => {
    for (const pattern of patterns) {
      const k = pattern.length;
      const found: Hit[] = [];
      for (let i = 0; i + k <= tokens.length; i++) {
        let exact = true;
        for (let j = 0; j < k; j++) {
          if (tokens[i + j].stem !== pattern[j]) {
            exact = false;
            break;
          }
        }
        if (exact) {
          found.push({
            ingredientIndex,
            start: tokens[i].start,
            end: tokens[i + k - 1].end,
            exact: true,
          });
        } else if (k === 1 && compoundMatch(tokens[i].stem, pattern[0])) {
          found.push({
            ingredientIndex,
            start: tokens[i].start,
            end: tokens[i].end,
            exact: false,
          });
        }
      }
      if (found.length > 0) {
        // Exakte Treffer schlagen Komposita-Treffer desselben Musters. Kürzere
        // Muster derselben Zutat («Zwiebel» neben «rote Zwiebel») laufen
        // weiter — die Überlappungsregel lässt ohnehin den längeren gewinnen,
        // und Teil-Zutaten («Salz und Pfeffer») brauchen beide Treffer.
        const exactOnes = found.filter((h) => h.exact);
        hits.push(...(exactOnes.length > 0 ? exactOnes : found));
      }
    }
  });
  return hits;
}

export function linkIngredients(
  steps: string[],
  ingredients: LinkableIngredient[],
): LinkResult {
  const compiled = ingredients.map((ing) => ingredientPatterns(ing.name));
  const matchedIngredients = new Set<number>();

  const result: StepLinks[] = steps.map((text) => {
    const tokens = tokenize(text);
    const hits = hitsForStep(tokens, compiled).sort(
      (a, b) =>
        b.end - b.start - (a.end - a.start) ||
        Number(b.exact) - Number(a.exact) ||
        a.ingredientIndex - b.ingredientIndex ||
        a.start - b.start,
    );

    const accepted: Hit[] = [];
    for (const hit of hits) {
      const overlaps = accepted.some(
        (h) => hit.start < h.end && h.start < hit.end,
      );
      if (!overlaps) accepted.push(hit);
    }
    accepted.sort((a, b) => a.start - b.start);

    const spans: IngredientSpan[] = accepted.map((h) => ({
      ingredientId: ingredients[h.ingredientIndex].id,
      startIndex: h.start,
      endIndex: h.end,
      matchedText: text.slice(h.start, h.end),
    }));
    const ingredientIds: string[] = [];
    for (const h of accepted) {
      matchedIngredients.add(h.ingredientIndex);
      const id = ingredients[h.ingredientIndex].id;
      if (!ingredientIds.includes(id)) ingredientIds.push(id);
    }
    return { ingredientIds, spans };
  });

  return {
    steps: result,
    unmatchedIngredientIds: ingredients
      .filter((_, i) => !matchedIngredients.has(i))
      .map((i) => i.id),
  };
}
