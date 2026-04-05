import { and, eq } from "drizzle-orm";
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
