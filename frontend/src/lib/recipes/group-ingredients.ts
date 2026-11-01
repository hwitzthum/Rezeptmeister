export interface IngredientGroup<T> {
  /** null = Zutaten ohne Gruppe (werden zuerst, ohne Überschrift angezeigt). */
  name: string | null;
  items: T[];
}

/**
 * Gruppiert bereits sortierte Zutaten nach `groupName`.
 * Ungruppierte Zutaten kommen zuerst, die übrigen Gruppen in der Reihenfolge
 * ihres ersten Auftretens. Die Reihenfolge innerhalb einer Gruppe bleibt erhalten.
 */
export function groupIngredients<T extends { groupName: string | null }>(
  ingredients: T[],
): IngredientGroup<T>[] {
  const byName = new Map<string | null, T[]>([[null, []]]);
  for (const ing of ingredients) {
    const key = ing.groupName?.trim() || null;
    const items = byName.get(key);
    if (items) items.push(ing);
    else byName.set(key, [ing]);
  }
  return [...byName]
    .filter(([, items]) => items.length > 0)
    .map(([name, items]) => ({ name, items }));
}
