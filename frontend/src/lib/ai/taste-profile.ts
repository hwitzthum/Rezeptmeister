import { db } from "@/lib/db";
import { recipes, ingredients, recipeNotes, recipeCookLogs } from "@/lib/db/schema";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

/**
 * Was die KI ueber die Sammlung dieses Nutzers wissen muss.
 *
 * Ohne diesen Kontext schlaegt das Modell generische Standardgerichte vor —
 * es kennt weder die vorhandenen Rezepte noch den Geschmack. Bewusst
 * kompakt gehalten: Titel und Haeufigkeiten genuegen, ganze Rezepte wuerden
 * das Kontextfenster fuellen, ohne die Vorschlaege besser zu machen.
 */
export interface TasteProfile {
  /** Titel bereits vorhandener Rezepte — nichts davon darf vorgeschlagen werden. */
  vorhandeneTitel: string[];
  /** Als Favorit markiert — der staerkste Geschmacksindikator. */
  favoritenTitel: string[];
  /** Mit Durchschnitt ab 4 bewertet. */
  bestbewerteteTitel: string[];
  /** Laut Kochhistorie am haeufigsten tatsaechlich gekocht — staerker als «gespeichert». */
  haeufigGekochteTitel: string[];
  /** Haeufigste Kuechen, absteigend: [{ wert: "Schweizer", anzahl: 12 }] */
  haeufigsteKuechen: { wert: string; anzahl: number }[];
  haeufigsteKategorien: { wert: string; anzahl: number }[];
  /** Zutaten, die immer wieder vorkommen — die Vorratskammer des Nutzers. */
  haeufigsteZutaten: string[];
  haeufigsteTags: string[];
  /** Gesamtzahl der Rezepte; sagt dem Modell, wie belastbar das Profil ist. */
  rezeptAnzahl: number;
}

/**
 * Obergrenzen: das Profil soll den Prompt praegen, nicht fluten.
 * 60 Titel decken auch grosse Sammlungen ausreichend ab, um Doppel zu
 * vermeiden, und kosten nur wenige hundert Tokens.
 */
const MAX_TITEL = 60;
const MAX_FAVORITEN = 15;
const MAX_BEWERTET = 10;
const MAX_GEKOCHT = 15;
const MAX_DIMENSIONEN = 5;
const MAX_ZUTATEN = 20;
const MAX_TAGS = 12;

export async function buildTasteProfile(userId: string): Promise<TasteProfile> {
  const [titelRows, favoritenRows, bewertetRows, gekochtRows, kuechenRows, kategorieRows, zutatenRows, tagRows, [anzahlRow]] =
    await Promise.all([
      // Favoriten zuerst, dann die zuletzt bearbeiteten — das ist der Teil der
      // Sammlung, der den aktuellen Geschmack am ehesten abbildet.
      db
        .select({ title: recipes.title })
        .from(recipes)
        .where(eq(recipes.userId, userId))
        .orderBy(desc(recipes.isFavorite), desc(recipes.updatedAt))
        .limit(MAX_TITEL),

      db
        .select({ title: recipes.title })
        .from(recipes)
        .where(and(eq(recipes.userId, userId), eq(recipes.isFavorite, true)))
        .orderBy(desc(recipes.updatedAt))
        .limit(MAX_FAVORITEN),

      db
        .select({
          title: recipes.title,
          avgRating: sql<number>`AVG(${recipeNotes.rating})::double precision`,
        })
        .from(recipeNotes)
        .innerJoin(recipes, eq(recipes.id, recipeNotes.recipeId))
        .where(
          and(
            eq(recipeNotes.userId, userId),
            isNotNull(recipeNotes.rating),
          ),
        )
        .groupBy(recipes.id, recipes.title)
        .having(sql`AVG(${recipeNotes.rating}) >= 4`)
        .orderBy(sql`AVG(${recipeNotes.rating}) DESC`)
        .limit(MAX_BEWERTET),

      db
        .select({ title: recipes.title })
        .from(recipeCookLogs)
        .innerJoin(recipes, eq(recipes.id, recipeCookLogs.recipeId))
        .where(eq(recipeCookLogs.userId, userId))
        .groupBy(recipes.id, recipes.title)
        .orderBy(sql`count(*) DESC`, sql`max(${recipeCookLogs.cookedOn}) DESC`)
        .limit(MAX_GEKOCHT),

      db
        .select({ wert: recipes.cuisine, anzahl: sql<number>`count(*)::int` })
        .from(recipes)
        .where(and(eq(recipes.userId, userId), isNotNull(recipes.cuisine)))
        .groupBy(recipes.cuisine)
        .orderBy(sql`count(*) DESC`)
        .limit(MAX_DIMENSIONEN),

      db
        .select({ wert: recipes.category, anzahl: sql<number>`count(*)::int` })
        .from(recipes)
        .where(and(eq(recipes.userId, userId), isNotNull(recipes.category)))
        .groupBy(recipes.category)
        .orderBy(sql`count(*) DESC`)
        .limit(MAX_DIMENSIONEN),

      db
        .select({ name: sql<string>`lower(${ingredients.name})` })
        .from(ingredients)
        .innerJoin(recipes, eq(recipes.id, ingredients.recipeId))
        .where(eq(recipes.userId, userId))
        .groupBy(sql`lower(${ingredients.name})`)
        .orderBy(sql`count(*) DESC`)
        .limit(MAX_ZUTATEN),

      db
        .select({ tag: sql<string>`unnest(${recipes.tags})` })
        .from(recipes)
        .where(eq(recipes.userId, userId))
        .groupBy(sql`unnest(${recipes.tags})`)
        .orderBy(sql`count(*) DESC`)
        .limit(MAX_TAGS),

      db
        .select({ anzahl: sql<number>`count(*)::int` })
        .from(recipes)
        .where(eq(recipes.userId, userId)),
    ]);

  return {
    vorhandeneTitel: titelRows.map((r) => r.title),
    favoritenTitel: favoritenRows.map((r) => r.title),
    bestbewerteteTitel: bewertetRows.map((r) => r.title),
    haeufigGekochteTitel: gekochtRows.map((r) => r.title),
    haeufigsteKuechen: kuechenRows
      .filter((r) => r.wert)
      .map((r) => ({ wert: r.wert!, anzahl: r.anzahl })),
    haeufigsteKategorien: kategorieRows
      .filter((r) => r.wert)
      .map((r) => ({ wert: r.wert!, anzahl: r.anzahl })),
    haeufigsteZutaten: zutatenRows.map((r) => r.name).filter(Boolean),
    haeufigsteTags: tagRows.map((r) => r.tag).filter(Boolean),
    rezeptAnzahl: anzahlRow?.anzahl ?? 0,
  };
}
