import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { recipes, ingredients } from "@/lib/db/schema";
import { sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const matchSchema = z.object({
  ingredients: z.array(z.string().min(1).max(255)).min(1).max(30),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`ingredient-match:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body." }, { status: 400 });
  }

  const parsed = matchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierungsfehler.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { ingredients: userIngredients, limit, offset } = parsed.data;
  const userId = session.user.id;

  // Normalize user ingredients for matching
  const normalizedIngredients = userIngredients.map((i) => i.toLowerCase().trim());

  // Build bidirectional ILIKE conditions using parameterized sql.join
  // "Tomate" matches "Tomaten", "Cherry-Tomaten" and vice versa
  const likeConditions = normalizedIngredients.map(
    (ing) =>
      sql`(LOWER(TRIM(i.name)) LIKE '%' || ${ing} || '%' OR ${ing} LIKE '%' || LOWER(TRIM(i.name)) || '%')`,
  );
  const matchCondition = sql.join(likeConditions, sql` OR `);

  // CTE-based matching: count total vs matched non-optional ingredients per recipe
  const matchRows = await db.execute<{
    id: string;
    total_ingredients: number;
    matched_count: number;
    match_percentage: number;
  }>(
    sql`
      WITH recipe_matches AS (
        SELECT
          r.id,
          COUNT(CASE WHEN i.is_optional = false THEN 1 END)::int AS total_ingredients,
          COUNT(DISTINCT CASE WHEN i.is_optional = false AND (${matchCondition}) THEN i.id END)::int AS matched_count
        FROM recipes r
        JOIN ingredients i ON i.recipe_id = r.id
        WHERE r.user_id = ${userId}
        GROUP BY r.id
        HAVING COUNT(CASE WHEN i.is_optional = false THEN 1 END) > 0
      )
      SELECT
        id,
        total_ingredients,
        matched_count,
        ROUND(matched_count::numeric / total_ingredients * 100)::int AS match_percentage
      FROM recipe_matches
      WHERE matched_count > 0
      ORDER BY match_percentage DESC, matched_count DESC
    `,
  );

  const allMatches = [...matchRows];
  const total = allMatches.length;
  const paged = allMatches.slice(offset, offset + limit);

  if (paged.length === 0) {
    return NextResponse.json({ recipes: [], total: 0, hasMore: false });
  }

  // Fetch full recipe details + ingredients for the matched page
  const recipeIds = paged.map((m) => m.id);

  const recipeRows = await db.query.recipes.findMany({
    where: inArray(recipes.id, recipeIds),
    columns: {
      id: true,
      title: true,
      description: true,
      category: true,
      cuisine: true,
      difficulty: true,
      totalTimeMinutes: true,
      servings: true,
      isFavorite: true,
    },
    with: {
      ingredients: {
        columns: {
          name: true,
          amount: true,
          unit: true,
          isOptional: true,
        },
      },
    },
  });

  // Build response with matched/missing ingredient breakdowns
  const recipeMap = new Map(recipeRows.map((r) => [r.id, r]));

  const resultRecipes = paged.map((match) => {
    const recipe = recipeMap.get(match.id)!;
    const nonOptional = recipe.ingredients.filter((i) => !i.isOptional);

    const matched: string[] = [];
    const missing: { name: string; amount: string | null; unit: string | null }[] = [];

    for (const ing of nonOptional) {
      const ingNameLower = ing.name.toLowerCase().trim();
      const isMatched = normalizedIngredients.some(
        (ui) => ingNameLower.includes(ui) || ui.includes(ingNameLower),
      );
      if (isMatched) {
        matched.push(ing.name);
      } else {
        missing.push({ name: ing.name, amount: ing.amount, unit: ing.unit });
      }
    }

    return {
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      category: recipe.category,
      cuisine: recipe.cuisine,
      difficulty: recipe.difficulty,
      totalTimeMinutes: recipe.totalTimeMinutes,
      servings: recipe.servings,
      isFavorite: recipe.isFavorite,
      totalIngredients: match.total_ingredients,
      matchedCount: match.matched_count,
      matchPercentage: match.match_percentage,
      matchedIngredients: matched,
      missingIngredients: missing,
    };
  });

  // Preserve match_percentage order (findMany doesn't guarantee order)
  const orderMap = new Map(paged.map((m, i) => [m.id, i]));
  resultRecipes.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

  return NextResponse.json({
    recipes: resultRecipes,
    total,
    hasMore: offset + limit < total,
  });
}
