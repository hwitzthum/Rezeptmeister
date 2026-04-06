/**
 * Zuordnung von Zutaten zu Supermarkt-Abteilungen (Schweizer Standard).
 * Verwendet Schlüsselwort-Matching (case-insensitive) mit Fallback auf "Sonstiges".
 */

export const AISLE_CATEGORIES = [
  "Obst & Gemüse",
  "Milchprodukte",
  "Backwaren",
  "Fleisch & Fisch",
  "Gewürze & Öle",
  "Getränke",
  "Tiefkühl",
  "Konserven & Saucen",
  "Sonstiges",
] as const;

export type AisleCategory = (typeof AISLE_CATEGORIES)[number];

/** Keyword → Abteilung.  Alle Schlüsselwörter klein geschrieben. */
const KEYWORD_MAP: [string[], AisleCategory][] = [
  // Obst & Gemüse
  [
    [
      "apfel", "birne", "banane", "orange", "zitrone", "limette", "traube",
      "erdbeere", "himbeere", "blaubeere", "tomate", "karotte", "kartoffel",
      "zwiebel", "knoblauch", "salat", "gurke", "paprika", "zucchini",
      "aubergine", "brokkoli", "blumenkohl", "spinat", "lauch", "sellerie",
      "fenchel", "radieschen", "champignon", "pilz", "petersilie", "basilikum",
      "schnittlauch", "dill", "koriander", "rosmarin", "thymian", "minze",
      "rucola", "avocado", "mango", "ananas", "peperoni", "kürbis",
      "randen", "kohlrabi", "rettich", "ingwer",
    ],
    "Obst & Gemüse",
  ],
  // Milchprodukte
  [
    [
      "milch", "butter", "rahm", "sahne", "joghurt", "quark", "käse",
      "mozzarella", "parmesan", "gruyere", "emmentaler", "appenzeller",
      "mascarpone", "ricotta", "frischkäse", "schmand", "creme fraiche",
      "ei", "eier",
    ],
    "Milchprodukte",
  ],
  // Backwaren
  [
    [
      "brot", "brötchen", "toast", "weggli", "zopf", "gipfeli", "croissant",
      "mehl", "hefe", "backpulver", "paniermehl", "semmelbrösel",
    ],
    "Backwaren",
  ],
  // Fleisch & Fisch
  [
    [
      "poulet", "huhn", "hähnchen", "rind", "schwein", "lamm", "kalb",
      "hackfleisch", "speck", "schinken", "salami", "wurst", "bratwurst",
      "cervelat", "lachs", "forelle", "thunfisch", "crevetten", "garnele",
      "pangasius", "kabeljau", "fleisch", "fisch", "pouletbrust",
    ],
    "Fleisch & Fisch",
  ],
  // Gewürze & Öle
  [
    [
      "salz", "pfeffer", "paprikapulver", "kurkuma", "zimt", "muskat",
      "oregano", "curry", "chili", "nelke", "lorbeer", "safran",
      "olivenöl", "sonnenblumenöl", "rapsöl", "essig", "balsamico",
      "sesamöl", "kokosöl", "öl", "vanille", "zucker", "honig",
      "ahornsirup", "sojasauce", "worcestersauce",
    ],
    "Gewürze & Öle",
  ],
  // Getränke
  [
    [
      "wasser", "mineralwasser", "saft", "orangensaft", "apfelsaft",
      "limonade", "bier", "wein", "prosecco", "kaffee", "tee",
    ],
    "Getränke",
  ],
  // Tiefkühl
  [
    [
      "tiefkühl", "tiefgekühlt", "erbsen", "blätterteig", "pizzateig",
      "glacestk.", "eiswürfel",
    ],
    "Tiefkühl",
  ],
  // Konserven & Saucen
  [
    [
      "dose", "konserve", "passata", "tomatensauce", "ketchup", "senf",
      "mayonnaise", "pesto", "bouillon", "brühe", "kokosmilch",
      "kichererbsen", "bohnen", "linsen", "mais", "tomatenmark",
      "sauerkraut",
    ],
    "Konserven & Saucen",
  ],
];

/**
 * Ermittelt die Supermarkt-Abteilung für eine Zutat.
 * Prüft ob der Zutatname (case-insensitive) eines der Schlüsselwörter enthält.
 * Gibt "Sonstiges" zurück wenn keine Zuordnung gefunden wird.
 */
export function getAisleCategory(ingredientName: string): AisleCategory {
  const lower = ingredientName.toLowerCase().trim();

  for (const [keywords, category] of KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return "Sonstiges";
}
