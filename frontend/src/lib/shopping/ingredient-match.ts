export interface RecipeIngredient {
  name: string;
  isOptional: boolean;
  amount?: string | null;
  unit?: string | null;
}

/**
 * Returns non-optional recipe ingredients whose normalized name is NOT
 * in the available set. Uses exact case-insensitive match (no substrings).
 */
export function filterMissingIngredients(
  recipeIngredients: RecipeIngredient[],
  availableIngredients: string[],
): RecipeIngredient[] {
  const normalizedSet = new Set(
    availableIngredients.map((i) => i.toLowerCase().trim()),
  );
  return recipeIngredients.filter((ing) => {
    if (ing.isOptional) return false;
    return !normalizedSet.has(ing.name.toLowerCase().trim());
  });
}
