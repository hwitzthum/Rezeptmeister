import { db } from "@/lib/db";
import { recipes, recipeNotes, recipeCookLogs } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { thumbnailUrl } from "@/lib/images";
import {
  buildPrefixTsQuery,
  escapeLike,
  normalizeForSearch,
  INGREDIENT_SIMILARITY_THRESHOLD,
  TITLE_SIMILARITY_THRESHOLD,
} from "@/lib/recipes/search-query";

// Shared query schema for the recipe list. Used by the GET API route (parsing
// search params) and the recipe list page (server-rendering the default view).
export const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  kategorie: z.string().max(100).optional(),
  kueche: z.string().max(100).optional(),
  schwierigkeit: z.enum(["einfach", "mittel", "anspruchsvoll"]).optional(),
  favoriten: z.enum(["true", "false"]).optional(),
  zeitaufwand: z.coerce.number().int().positive().optional(),
  zutaten: z.string().max(100).optional(),
  ernaehrungsform: z.string().max(50).optional(),
  includeFacets: z.enum(["true", "false"]).default("false"),
  seite: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sortierung: z
    .enum(["neueste", "alphabetisch", "bearbeitet", "relevanz"])
    .default("neueste"),
});

export type RecipeListParams = z.infer<typeof listQuerySchema>;

export interface RecipeListItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  totalTimeMinutes: number | null;
  servings: number;
  isFavorite: boolean;
  tags: string[] | null;
  averageRating: number | null;
  /** Einträge in der Kochhistorie des Nutzers. */
  cookCount: number;
  thumbnailUrl: string | null;
}

export interface RecipeListFacets {
  categories: { value: string; count: number }[];
  cuisines: { value: string; count: number }[];
  difficulties: { value: string; count: number }[];
}

export interface RecipeListResult {
  recipes: RecipeListItem[];
  total: number;
  seite: number;
  hasMore: boolean;
  facets?: RecipeListFacets;
}

/**
 * Trifft der Suchbegriff eine Zutat dieses Rezepts — als Teilzeichenkette
 * oder trigramm-aehnlich? Wird in der WHERE-Bedingung und in der
 * Relevanzberechnung gebraucht, deshalb einmal an einer Stelle.
 *
 * `normQ` ist bereits normalisiert; verglichen wird gegen `rm_normalize(name)`,
 * worauf auch der GIN-Trigramm-Index liegt.
 */
function ingredientMatch(normQ: string) {
  return sql`EXISTS (
    SELECT 1 FROM ingredients i
    WHERE i.recipe_id = recipes.id
      AND (
        rm_normalize(i.name) LIKE ${`%${escapeLike(normQ)}%`} ESCAPE '!'
        OR word_similarity(${normQ}, rm_normalize(i.name)) > ${INGREDIENT_SIMILARITY_THRESHOLD}
      )
  )`;
}

/**
 * Wie aehnlich ist der Suchbegriff dem Rezepttitel? `word_similarity` sucht
 * den aehnlichsten Ausschnitt im Titel, statt die ganze Zeichenkette zu
 * vergleichen — sonst verduennt ein mehrwortiger Titel jeden Treffer
 * ("roesti" gegen "Berner Rösti" faellt von 1.0 auf 0.18).
 */
function titleSimilarity(normQ: string) {
  return sql`word_similarity(${normQ}, rm_normalize(recipes.title))`;
}

/**
 * Loads a paginated, filtered recipe list scoped to a single user.
 *
 * Extracted from the GET /api/recipes handler so both the route and the
 * server-rendered recipe list page share one query implementation.
 */
export async function listRecipes(
  userId: string,
  params: RecipeListParams,
): Promise<RecipeListResult> {
  const {
    q,
    kategorie,
    kueche,
    schwierigkeit,
    favoriten,
    zeitaufwand,
    zutaten,
    ernaehrungsform,
    includeFacets,
    seite,
    limit,
    sortierung,
  } = params;

  // Base conditions: applied to all queries including facet counts.
  // Does NOT include kategorie/kueche/schwierigkeit so facets can be computed
  // without the respective dimension's own filter.
  const alwaysConditions = [eq(recipes.userId, userId)];

  // Suchbegriff auf vier Wegen: Volltext mit Praefix (greift ab dem zweiten
  // Buchstaben), Teilzeichenkette im normalisierten Titel (faengt Treffer in
  // Wortmitte und abweichende Umlautschreibung), Trigramm-Aehnlichkeit
  // (faengt Tippfehler) und Treffer in den Zutatennamen. Ohne verwertbares
  // Token — etwa bei einer Eingabe aus reinen Satzzeichen — bleibt der
  // Suchbegriff wirkungslos, statt die Liste zu leeren.
  const prefixQuery = q ? buildPrefixTsQuery(q) : null;
  const normQ = q ? normalizeForSearch(q) : null;
  const searchActive = Boolean(prefixQuery && normQ);

  if (prefixQuery && normQ) {
    alwaysConditions.push(
      sql`(
        recipes.fts_vector @@ to_tsquery('german', ${prefixQuery})
        OR rm_normalize(recipes.title) LIKE ${`%${escapeLike(normQ)}%`} ESCAPE '!'
        OR ${titleSimilarity(normQ)} > ${TITLE_SIMILARITY_THRESHOLD}
        OR ${ingredientMatch(normQ)}
      )`,
    );
  }
  if (favoriten === "true") alwaysConditions.push(eq(recipes.isFavorite, true));
  if (zeitaufwand)
    alwaysConditions.push(sql`${recipes.totalTimeMinutes} <= ${zeitaufwand}`);
  if (ernaehrungsform)
    // scalar = ANY(array_column): correct PostgreSQL idiom — "is this value in the array?"
    alwaysConditions.push(sql`${ernaehrungsform} = ANY(${recipes.tags})`);
  if (zutaten) {
    alwaysConditions.push(
      sql`${recipes.id} IN (SELECT recipe_id FROM ingredients WHERE name ILIKE ${`%${escapeLike(zutaten)}%`} ESCAPE '!')`,
    );
  }

  // Dimension conditions for the main query
  const categoryCond = kategorie ? eq(recipes.category, kategorie) : null;
  const cuisineCond = kueche ? eq(recipes.cuisine, kueche) : null;
  const difficultyCond = schwierigkeit
    ? eq(recipes.difficulty, schwierigkeit)
    : null;

  const where = and(
    ...alwaysConditions,
    ...(categoryCond ? [categoryCond] : []),
    ...(cuisineCond ? [cuisineCond] : []),
    ...(difficultyCond ? [difficultyCond] : []),
  );

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(recipes)
    .where(where);

  // Relevanz setzt einen Suchbegriff voraus; die Oberflaeche waehlt sie
  // automatisch, sobald eine Suche beginnt (siehe SuchePage/RezeptListeClient).
  const relevanceRequested = searchActive && sortierung === "relevanz";

  const orderBy =
    relevanceRequested && prefixQuery && normQ
      ? sql`(
          ts_rank(recipes.fts_vector, to_tsquery('german', ${prefixQuery})) * 1.0
          + ${titleSimilarity(normQ)} * 0.6
          + (CASE WHEN ${ingredientMatch(normQ)} THEN 0.2 ELSE 0 END)
        ) DESC, recipes.created_at DESC`
      : sortierung === "alphabetisch"
        ? asc(recipes.title)
        : sortierung === "bearbeitet"
          ? desc(recipes.updatedAt)
          : desc(recipes.createdAt);

  const rawRows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      description: recipes.description,
      category: recipes.category,
      cuisine: recipes.cuisine,
      difficulty: recipes.difficulty,
      totalTimeMinutes: recipes.totalTimeMinutes,
      servings: recipes.servings,
      isFavorite: recipes.isFavorite,
      tags: recipes.tags,
      createdAt: recipes.createdAt,
      updatedAt: recipes.updatedAt,
      thumbnailPath: sql<string | null>`(
        SELECT file_path FROM images
        WHERE images.recipe_id = recipes.id
        ORDER BY images.is_primary DESC, images.created_at DESC
        LIMIT 1
      )`,
    })
    .from(recipes)
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset((seite - 1) * limit);

  // Compute average ratings in a single aggregation query
  let ratingsMap: Record<string, number | null> = {};
  if (rawRows.length > 0) {
    const recipeIds = rawRows.map((r) => r.id);
    const ratingRows = await db
      .select({
        recipeId: recipeNotes.recipeId,
        avgRating: sql<
          number | null
        >`AVG(${recipeNotes.rating})::double precision`,
      })
      .from(recipeNotes)
      .where(
        and(
          inArray(recipeNotes.recipeId, recipeIds),
          eq(recipeNotes.userId, userId),
          isNotNull(recipeNotes.rating),
        ),
      )
      .groupBy(recipeNotes.recipeId);
    ratingsMap = Object.fromEntries(
      ratingRows.map((r) => [r.recipeId, r.avgRating ?? null]),
    );
  }

  // Kochhistorie: Zähler je Rezept in einer Aggregation (Phase 21)
  let cookCountMap: Record<string, number> = {};
  if (rawRows.length > 0) {
    const recipeIds = rawRows.map((r) => r.id);
    const cookRows = await db
      .select({
        recipeId: recipeCookLogs.recipeId,
        count: sql<number>`count(*)::int`,
      })
      .from(recipeCookLogs)
      .where(
        and(
          inArray(recipeCookLogs.recipeId, recipeIds),
          eq(recipeCookLogs.userId, userId),
        ),
      )
      .groupBy(recipeCookLogs.recipeId);
    cookCountMap = Object.fromEntries(cookRows.map((r) => [r.recipeId, r.count]));
  }

  const rows: RecipeListItem[] = rawRows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    cuisine: r.cuisine,
    difficulty: r.difficulty,
    totalTimeMinutes: r.totalTimeMinutes,
    servings: r.servings,
    isFavorite: r.isFavorite,
    tags: r.tags,
    thumbnailUrl: r.thumbnailPath ? thumbnailUrl(r.thumbnailPath) : null,
    averageRating: ratingsMap[r.id] ?? null,
    cookCount: cookCountMap[r.id] ?? 0,
  }));

  // Faceted counts (optional, only when includeFacets=true)
  let facets: RecipeListFacets | undefined;

  if (includeFacets === "true") {
    const [cats, cuisineRows, diffRows] = await Promise.all([
      db
        .select({ value: recipes.category, count: sql<number>`count(*)::int` })
        .from(recipes)
        .where(
          and(
            ...alwaysConditions,
            ...(cuisineCond ? [cuisineCond] : []),
            ...(difficultyCond ? [difficultyCond] : []),
          ),
        )
        .groupBy(recipes.category),
      db
        .select({ value: recipes.cuisine, count: sql<number>`count(*)::int` })
        .from(recipes)
        .where(
          and(
            ...alwaysConditions,
            ...(categoryCond ? [categoryCond] : []),
            ...(difficultyCond ? [difficultyCond] : []),
          ),
        )
        .groupBy(recipes.cuisine),
      db
        .select({
          value: recipes.difficulty,
          count: sql<number>`count(*)::int`,
        })
        .from(recipes)
        .where(
          and(
            ...alwaysConditions,
            ...(categoryCond ? [categoryCond] : []),
            ...(cuisineCond ? [cuisineCond] : []),
          ),
        )
        .groupBy(recipes.difficulty),
    ]);
    facets = {
      categories: cats
        .filter((r) => r.value)
        .map((r) => ({ value: r.value!, count: r.count })),
      cuisines: cuisineRows
        .filter((r) => r.value)
        .map((r) => ({ value: r.value!, count: r.count })),
      difficulties: diffRows
        .filter((r) => r.value)
        .map((r) => ({ value: r.value!, count: r.count })),
    };
  }

  return {
    recipes: rows,
    total,
    seite,
    hasMore: seite * limit < total,
    ...(facets ? { facets } : {}),
  };
}
