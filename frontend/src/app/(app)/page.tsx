import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { recipes, images, shoppingListItems, mealPlans, users } from "@/lib/db/schema";
import { eq, desc, and, sql, inArray } from "drizzle-orm";
import { thumbnailUrl } from "@/lib/images";
import DashboardClient from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Dashboard" };

function getGreeting(hour: number): string {
  if (hour < 11) return "Guete Morge";
  if (hour < 17) return "Guete Tag";
  return "Guete Abig";
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/anmelden");

  const userId = session.user.id;
  // Use Europe/Zurich timezone for Swiss users — avoids server-TZ / UTC bugs around midnight
  const zurichNow = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Zurich" }); // "YYYY-MM-DD HH:MM:SS"
  const today = zurichNow.slice(0, 10); // YYYY-MM-DD in Swiss time
  const zurichHour = parseInt(zurichNow.slice(11, 13), 10);
  const greeting = getGreeting(zurichHour);
  const userName = session.user.name ?? session.user.email?.split("@")[0] ?? "";

  const [recentRecipes, favoriteRecipes, shoppingCountResult, todayMeals, userRow] =
    await Promise.all([
      // 1. Last 5 edited recipes
      db
        .select({
          id: recipes.id,
          title: recipes.title,
          category: recipes.category,
          difficulty: recipes.difficulty,
          totalTimeMinutes: recipes.totalTimeMinutes,
          servings: recipes.servings,
          isFavorite: recipes.isFavorite,
          updatedAt: recipes.updatedAt,
        })
        .from(recipes)
        .where(eq(recipes.userId, userId))
        .orderBy(desc(recipes.updatedAt))
        .limit(5),

      // 2. Favorites (last 5)
      db
        .select({
          id: recipes.id,
          title: recipes.title,
          category: recipes.category,
          difficulty: recipes.difficulty,
          totalTimeMinutes: recipes.totalTimeMinutes,
          servings: recipes.servings,
          isFavorite: recipes.isFavorite,
          updatedAt: recipes.updatedAt,
        })
        .from(recipes)
        .where(and(eq(recipes.userId, userId), eq(recipes.isFavorite, true)))
        .orderBy(desc(recipes.updatedAt))
        .limit(5),

      // 3. Open shopping list count
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(shoppingListItems)
        .where(
          and(
            eq(shoppingListItems.userId, userId),
            eq(shoppingListItems.isChecked, false),
          ),
        ),

      // 4. Today's meal plan
      db
        .select({
          id: mealPlans.id,
          mealType: mealPlans.mealType,
          recipeTitle: recipes.title,
          recipeId: mealPlans.recipeId,
        })
        .from(mealPlans)
        .innerJoin(recipes, eq(mealPlans.recipeId, recipes.id))
        .where(and(eq(mealPlans.userId, userId), eq(mealPlans.date, today)))
        .orderBy(
          sql`CASE ${mealPlans.mealType}
            WHEN 'fruehstueck' THEN 1
            WHEN 'mittagessen' THEN 2
            WHEN 'abendessen' THEN 3
            WHEN 'snack' THEN 4
          END`,
        ),

      // 5. API key + provider check (suggestions require Gemini)
      db
        .select({ apiKeyEncrypted: users.apiKeyEncrypted, apiProvider: users.apiProvider })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);

  // Fetch primary images for recent + favorite recipes
  const allRecipeIds = [
    ...new Set([
      ...recentRecipes.map((r) => r.id),
      ...favoriteRecipes.map((r) => r.id),
    ]),
  ];

  // Fetch the best image per recipe: prefer isPrimary, fall back to most recent
  const primaryImages =
    allRecipeIds.length > 0
      ? await db
          .select({ recipeId: images.recipeId, filePath: images.filePath })
          .from(images)
          .where(inArray(images.recipeId, allRecipeIds))
          .orderBy(desc(images.isPrimary), desc(images.createdAt))
      : [];

  // Keep only the first (best) image per recipe
  const imageMap: Record<string, string> = {};
  for (const img of primaryImages) {
    if (img.recipeId && img.filePath && !imageMap[img.recipeId]) {
      imageMap[img.recipeId] = thumbnailUrl(img.filePath);
    }
  }

  const openShoppingCount = shoppingCountResult[0]?.count ?? 0;
  const hasApiKey = !!userRow[0]?.apiKeyEncrypted && userRow[0]?.apiProvider === "gemini";

  // Serialize dates and attach image URLs
  const serializeRecipe = (r: (typeof recentRecipes)[number]) => ({
    ...r,
    imageUrl: imageMap[r.id] ?? null,
    updatedAt: r.updatedAt.toISOString(),
  });

  return (
    <DashboardClient
      greeting={greeting}
      userName={userName}
      userId={userId}
      recentRecipes={recentRecipes.map(serializeRecipe)}
      favoriteRecipes={favoriteRecipes.map(serializeRecipe)}
      openShoppingCount={openShoppingCount}
      todayMeals={todayMeals}
      hasApiKey={hasApiKey}
    />
  );
}
