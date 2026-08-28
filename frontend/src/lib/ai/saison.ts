/**
 * Schweizer Saisonkalender.
 *
 * Welche Zutaten gerade Saison haben, ist eine feststehende Tatsache — kein
 * Fall fuer das Sprachmodell. Die Liste des laufenden Monats geht woertlich in
 * den Prompt, statt das Modell raten zu lassen; das ist der Unterschied
 * zwischen "irgendein Gemuese" und "Federkohl, Nuesslisalat, Pastinaken".
 *
 * Quelle: Saisontabelle der Schweizer Gemuese- und Obstproduzenten
 * (gaengige Freiland- und Lagerware, ohne Import).
 */

export interface Saison {
  /** "Januar", "Februar", … */
  monat: string;
  /** "Winter", "Frühling", "Sommer", "Herbst" */
  jahreszeit: string;
  gemuese: string[];
  fruechte: string[];
  /** Was in diesem Monat kulinarisch ansteht (Feste, Traditionen). */
  anlass: string[];
}

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
] as const;

function jahreszeitFuer(monat1bis12: number): string {
  if (monat1bis12 <= 2 || monat1bis12 === 12) return "Winter";
  if (monat1bis12 <= 5) return "Frühling";
  if (monat1bis12 <= 8) return "Sommer";
  return "Herbst";
}

/** Index 0 = Januar. */
const GEMUESE: string[][] = [
  ["Federkohl", "Nüsslisalat", "Pastinaken", "Randen", "Rosenkohl", "Lauch", "Sellerie", "Wirz"],
  ["Federkohl", "Nüsslisalat", "Randen", "Schwarzwurzeln", "Lauch", "Chicorée", "Rüebli"],
  ["Bärlauch", "Nüsslisalat", "Radieschen", "Lauch", "Chicorée", "Randen", "Rüebli"],
  ["Bärlauch", "Spargeln", "Radieschen", "Frühlingszwiebeln", "Spinat", "Rhabarber"],
  ["Spargeln", "Kohlrabi", "Kopfsalat", "Spinat", "Erbsen", "Radieschen", "Rhabarber"],
  ["Kefen", "Fenchel", "Zucchetti", "Bohnen", "Kohlrabi", "Neue Kartoffeln", "Kopfsalat"],
  ["Zucchetti", "Tomaten", "Bohnen", "Peperoni", "Gurken", "Fenchel", "Mangold"],
  ["Tomaten", "Zucchetti", "Peperoni", "Auberginen", "Bohnen", "Mais", "Mangold"],
  ["Kürbis", "Federkohl", "Randen", "Fenchel", "Lauch", "Wirz", "Zwiebeln"],
  ["Kürbis", "Wirz", "Rosenkohl", "Randen", "Pastinaken", "Sellerie", "Nüsslisalat"],
  ["Rosenkohl", "Federkohl", "Nüsslisalat", "Schwarzwurzeln", "Lauch", "Sellerie", "Kürbis"],
  ["Rosenkohl", "Federkohl", "Nüsslisalat", "Lauch", "Randen", "Wirz", "Chicorée"],
];

const FRUECHTE: string[][] = [
  ["Äpfel", "Birnen", "Baumnüsse"],
  ["Äpfel", "Birnen", "Baumnüsse"],
  ["Äpfel", "Birnen"],
  ["Äpfel", "Rhabarber"],
  ["Erdbeeren", "Rhabarber", "Kirschen"],
  ["Erdbeeren", "Kirschen", "Johannisbeeren", "Aprikosen"],
  ["Aprikosen", "Himbeeren", "Heidelbeeren", "Zwetschgen", "Kirschen"],
  ["Zwetschgen", "Brombeeren", "Pfirsiche", "Trauben", "Aprikosen"],
  ["Trauben", "Zwetschgen", "Äpfel", "Birnen", "Feigen"],
  ["Äpfel", "Birnen", "Trauben", "Quitten", "Kastanien"],
  ["Äpfel", "Birnen", "Quitten", "Kastanien", "Baumnüsse"],
  ["Äpfel", "Birnen", "Kastanien", "Baumnüsse", "Mandarinen"],
];

const ANLAESSE: string[][] = [
  ["Kalte Tage — Eintöpfe, Gratins, Fondue"],
  ["Fasnacht", "Fondue- und Raclette-Saison"],
  ["Beginn der Frühlingsküche", "Ostervorbereitung"],
  ["Ostern — Osterfladen, Lammgerichte", "Spargelzeit"],
  ["Spargelzeit", "Erste Grillabende"],
  ["Grillsaison", "Leichte Sommerküche"],
  ["1. August — Brunch und Bauernbrot", "Grillsaison"],
  ["1. August — Brunch und Bauernbrot", "Konservieren und Einmachen"],
  ["Erntedank", "Wildsaison beginnt", "Zwiebelmarkt"],
  ["Wildsaison", "Kastanien und Vermicelles", "Metzgete"],
  ["Wildsaison", "Metzgete", "Beginn der Guetzli-Zeit"],
  ["Advent und Weihnachten — Guetzli, Fondue chinoise", "Silvester"],
];

/**
 * Saison des angegebenen Zeitpunkts in Schweizer Zeit.
 *
 * Ohne Argument der aktuelle Monat in Europe/Zurich — dieselbe
 * Zeitzonen-Logik wie das Dashboard, damit die Saison nicht nachts um die
 * Jahreswende an der UTC-Grenze umspringt.
 */
export function saisonFuer(date: Date = new Date()): Saison {
  const zurichMonat = Number(
    date.toLocaleString("en-CA", { timeZone: "Europe/Zurich", month: "numeric" }),
  );
  const idx = zurichMonat - 1;
  return {
    monat: MONATSNAMEN[idx],
    jahreszeit: jahreszeitFuer(zurichMonat),
    gemuese: GEMUESE[idx],
    fruechte: FRUECHTE[idx],
    anlass: ANLAESSE[idx],
  };
}

/** Gemuese und Fruechte des Monats als eine flache Liste fuer den Prompt. */
export function saisonaleZutaten(date: Date = new Date()): string[] {
  const s = saisonFuer(date);
  return [...s.gemuese, ...s.fruechte];
}
