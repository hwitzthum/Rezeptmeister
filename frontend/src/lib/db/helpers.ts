import { and, eq, inArray } from "drizzle-orm";
import { recipes } from "@/lib/db/schema";
import { USER_ROLE } from "@/lib/auth";

/**
 * Returns a Drizzle WHERE condition that restricts a recipe query to its owner,
 * unless the caller is an admin (who can access any recipe).
 */
export function recipeOwnerCondition(id: string, userId: string, role: string) {
  if (role === USER_ROLE.admin) return eq(recipes.id, id);
  return and(eq(recipes.id, id), eq(recipes.userId, userId));
}

/**
 * Mengenvariante für Bulk-Operationen: alle `ids`, die dem Nutzer gehören
 * (Admins: alle). Der Aufrufer vergleicht die Treffer mit der Anfrage.
 */
export function recipeOwnerConditionMany(ids: string[], userId: string, role: string) {
  if (role === USER_ROLE.admin) return inArray(recipes.id, ids);
  return and(inArray(recipes.id, ids), eq(recipes.userId, userId));
}
