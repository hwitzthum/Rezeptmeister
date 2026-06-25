import { db } from "@/lib/db";
import { recipes, recipeNotes } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { thumbnailUrl } from "@/lib/images";

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
  if (q)
    alwaysConditions.push(
      sql`recipes.fts_vector @@ websearch_to_tsquery('german', ${q})`,
    );
  if (favoriten === "true") alwaysConditions.push(eq(recipes.isFavorite, true));
  if (zeitaufwand)
    alwaysConditions.push(sql`${recipes.totalTimeMinutes} <= ${zeitaufwand}`);
  if (ernaehrungsform)
    // scalar = ANY(array_column): correct PostgreSQL idiom — "is this value in the array?"
    alwaysConditions.push(sql`${ernaehrungsform} = ANY(${recipes.tags})`);
  if (zutaten) {
    // Escape LIKE metacharacters so user input cannot widen the match pattern.
    const zutatenEscaped = zutaten
      .replace(/!/g, "!!")
      .replace(/%/g, "!%")
      .replace(/_/g, "!_");
    alwaysConditions.push(
      sql`${recipes.id} IN (SELECT recipe_id FROM ingredients WHERE name ILIKE ${`%${zutatenEscaped}%`} ESCAPE '!')`,
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

  const orderBy =
    sortierung === "relevanz" && q
      ? sql`ts_rank(recipes.fts_vector, websearch_to_tsquery('german', ${q})) DESC`
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
