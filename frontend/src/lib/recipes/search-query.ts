/**
 * Aufbereitung der Sucheingabe fuer die Rezeptsuche.
 *
 * Postgres' `websearch_to_tsquery` findet nur vollstaendige (gestemmte)
 * Woerter — "Zop" findet "Zopf" nicht. Hier entstehen daraus die Bausteine
 * fuer eine Suche, die schon beim Tippen greift und Tippfehler verzeiht.
 */

/** Zerlegt an allem, was weder Buchstabe noch Ziffer ist. */
function tokenize(q: string): string[] {
  return q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Baut eine Praefix-tsquery: "zop bro" -> "zop:* & bro:*".
 *
 * Die Tokens bestehen nach `tokenize` ausschliesslich aus Buchstaben und
 * Ziffern, enthalten also keine tsquery-Operatoren (`&`, `|`, `!`, `:`, `(`).
 * Das Ergebnis geht trotzdem ausschliesslich als gebundener Parameter an
 * `to_tsquery`, nie per Interpolation.
 *
 * Gibt `null` zurueck, wenn die Eingabe kein verwertbares Token enthaelt —
 * dann bleibt der Suchbegriff wirkungslos, statt die Liste zu leeren.
 */
export function buildPrefixTsQuery(q: string): string | null {
  const tokens = tokenize(q);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/**
 * Muss zeichengenau der SQL-Funktion `rm_normalize` entsprechen
 * (siehe `drizzle/0004_smart_search.sql`): kleinschreiben, Umlaute und
 * Eszett auf ihre Ersatzschreibung abbilden.
 *
 * Beide Seiten des Vergleichs normalisiert zu halten ist der Punkt: Trigramme
 * vergleichen buchstabengetreu, "Rösti" und "Roesti" teilen sonst zu wenige.
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

/**
 * Maskiert LIKE-Metazeichen, damit Nutzereingaben das Suchmuster nicht
 * aufweiten koennen. Passt zum `ESCAPE '!'` der aufrufenden Abfrage.
 */
export function escapeLike(value: string): string {
  return value.replace(/!/g, "!!").replace(/%/g, "!%").replace(/_/g, "!_");
}

/**
 * Schwellen fuer `word_similarity(suchbegriff, feld)`.
 *
 * An echten Daten kalibriert: Tippfehler ("risoto" -> "Risotto Milanese",
 * "geschnetzelts" -> "Zürcher Geschnetzeltes") liegen bei 0.5 bis 0.88,
 * unpassende Paare ("mehlsuppe" -> "Bündner Gerstensuppe") bei hoechstens
 * 0.40. Zutatennamen sind kurz und eindeutig, dort darf strenger geprueft
 * werden.
 */
export const TITLE_SIMILARITY_THRESHOLD = 0.42;
export const INGREDIENT_SIMILARITY_THRESHOLD = 0.5;
