/**
 * Duplikatschlüssel für den Import: gleicher Titel und gleiche Zutatennamen
 * (ohne Reihenfolge, ohne Gross-/Kleinschreibung) gelten als dasselbe Rezept.
 * Deterministisch, damit ein zweimal eingespieltes Backup nichts verdoppelt.
 */
export function recipeDuplicateKey(
  title: string,
  ingredientNames: string[],
): string {
  const names = ingredientNames
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
  return `${title.trim().toLowerCase()}::${names}`;
}
