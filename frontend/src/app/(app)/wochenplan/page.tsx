import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { mealPlans, recipes } from "@/lib/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import {
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns";
import MealPlanClient from "@/components/mealplan/MealPlanClient";

export const metadata = {
  title: "Wochenplan",
};

export default async function WochenplanPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/anmelden");
  }

  const today = new Date();
  const monday = startOfWeek(today, { weekStartsOn: 1 });
  const sunday = endOfWeek(today, { weekStartsOn: 1 });

  const mondayISO = format(monday, "yyyy-MM-dd");
  const sundayISO = format(sunday, "yyyy-MM-dd");

  // Fetch entries for current week
  const entries = await db
    .select({
      id: mealPlans.id,
      date: mealPlans.date,
      mealType: mealPlans.mealType,
      recipeId: mealPlans.recipeId,
      servingsOverride: mealPlans.servingsOverride,
      notes: mealPlans.notes,
      createdAt: mealPlans.createdAt,
      recipeTitle: recipes.title,
      recipeServings: recipes.servings,
    })
    .from(mealPlans)
    .leftJoin(recipes, eq(mealPlans.recipeId, recipes.id))
    .where(
      and(
        eq(mealPlans.userId, session.user.id),
        gte(mealPlans.date, mondayISO),
        lte(mealPlans.date, sundayISO),
      ),
    )
    .orderBy(asc(mealPlans.date));

  // Fetch user's recipes (id + title only) for the picker
  const recipesList = await db
    .select({ id: recipes.id, title: recipes.title })
    .from(recipes)
    .where(eq(recipes.userId, session.user.id))
    .orderBy(asc(recipes.title));

  // Serialize createdAt for JSON transfer
  const serialized = entries.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <MealPlanClient
      initialEntries={serialized}
      recipes={recipesList}
      initialWeekStart={mondayISO}
    />
  );
}
