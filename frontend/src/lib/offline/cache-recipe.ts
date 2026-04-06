import type { RecipeDetail } from "@/components/recipes/RecipeDetailClient";
import { saveRecipeOffline, removeRecipeOffline } from "./db";

/**
 * Fetches a recipe + its thumbnail images and stores everything in IndexedDB
 * for offline access.
 */
export async function cacheRecipeForOffline(
  recipeId: string,
  userId: string,
): Promise<void> {
  // 1. Fetch full recipe data
  const res = await fetch(`/api/recipes/${recipeId}`);
  if (!res.ok) throw new Error("Rezept konnte nicht geladen werden.");
  const recipe: RecipeDetail = await res.json();

  // 2. Fetch thumbnail images as blobs (smaller than originals)
  const imageThumbnails = await Promise.all(
    recipe.images.map(async (img) => {
      // Prefer thumbnail; fall back to original
      const src = img.thumbnailUrl || img.filePath;
      try {
        const blob = await fetch(src).then((r) => r.blob());
        return { id: img.id, blob, filePath: src };
      } catch {
        // If image fetch fails, store placeholder
        return { id: img.id, blob: new Blob(), filePath: src };
      }
    }),
  );

  // 3. Store in IndexedDB
  await saveRecipeOffline(userId, recipeId, recipe, imageThumbnails);
}

/**
 * Removes a recipe from offline storage.
 */
export async function uncacheRecipe(
  recipeId: string,
  userId: string,
): Promise<void> {
  await removeRecipeOffline(userId, recipeId);
}
