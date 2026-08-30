/**
 * Kandidaten für den KI-Wochenplan: die eigenen Rezepte, angereichert mit
 * Bewertung und Kochhistorie, in einer kompakten Form für den Prompt.
 *
 * Das Modell sieht Indizes statt UUIDs (Token sparen, nichts leakt) — die
 * Rückabbildung passiert hier in `mapPlanEntries`.
 */

import { db } from "@/lib/db";
import { recipes, recipeNotes, recipeCookLogs } from "@/lib/db/schema";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { normalizeForSearch } from "@/lib/recipes/search-query";
import { addDays, format, parseISO } from "date-fns";

export const MAX_PLAN_CANDIDATES = 120;

/** Kategorien, die kein Hauptgericht sind — im Wochenplan unerwünscht. */
const EXCLUDED_CATEGORIES = [
  "Dessert",
  "Getränke",
  "Getränk",
  "Backen",
  "Gebäck",
  "Süsses",
];

const VEGETARIAN_TAGS = new Set([
  "vegetarisch",
  "vegetarian",
  "vegan",
  "veggie",
  "fleischlos",
]);

export interface PlanCandidate {
  index: number;
  recipeId: string;
  title: string;
  category: string | null;
  cuisine: string | null;
  totalTimeMinutes: number | null;
  servings: number;
  tags: string[];
  isFavorite: boolean;
  averageRating: number | null;
  cookCount: number;
  lastCookedDaysAgo: number | null;
  isVegetarian: boolean;
}

/** Drahtform mit Kurzschlüsseln; Nulls und Nullwerte werden weggelassen. */
export interface CompactCandidate {
  i: number;
  t: string;
  c?: string;
  k?: string;
  m?: number;
  p: number;
  tg?: string[];
  f?: 1;
  r?: number;
  n?: number;
  d?: number;
  v?: 1;
}

export function isVegetarianTags(tags: string[] | null | undefined): boolean {
  if (!tags) return false;
  return tags.some((t) => VEGETARIAN_TAGS.has(normalizeForSearch(t.trim())));
}

export function compactCandidates(
  candidates: PlanCandidate[],
): CompactCandidate[] {
  return candidates.map((c) => {
    const out: CompactCandidate = { i: c.index, t: c.title, p: c.servings };
    if (c.category) out.c = c.category;
    if (c.cuisine) out.k = c.cuisine;
    if (c.totalTimeMinutes != null) out.m = c.totalTimeMinutes;
    if (c.tags.length > 0) out.tg = c.tags.slice(0, 8);
    if (c.isFavorite) out.f = 1;
    if (c.averageRating != null) out.r = Math.round(c.averageRating * 10) / 10;
    if (c.cookCount > 0) out.n = c.cookCount;
    if (c.lastCookedDaysAgo != null) out.d = c.lastCookedDaysAgo;
    if (c.isVegetarian) out.v = 1;
    return out;
  });
}

export async function buildPlanCandidates(
  userId: string,
  now: Date = new Date(),
): Promise<PlanCandidate[]> {
  const cookStats = db
    .select({
      recipeId: recipeCookLogs.recipeId,
      cookCount: sql<number>`count(*)::int`.as("cook_count"),
      lastCookedOn: sql<string>`max(${recipeCookLogs.cookedOn})`.as(
        "last_cooked_on",
      ),
    })
    .from(recipeCookLogs)
    .where(eq(recipeCookLogs.userId, userId))
    .groupBy(recipeCookLogs.recipeId)
    .as("cl");

  const ratings = db
    .select({
      recipeId: recipeNotes.recipeId,
      avgRating: sql<number>`avg(${recipeNotes.rating})::double precision`.as(
        "avg_rating",
      ),
    })
    .from(recipeNotes)
    .where(
      and(
        eq(recipeNotes.userId, userId),
        sql`${recipeNotes.rating} IS NOT NULL`,
      ),
    )
    .groupBy(recipeNotes.recipeId)
    .as("rt");

  const rows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      category: recipes.category,
      cuisine: recipes.cuisine,
      totalTimeMinutes: recipes.totalTimeMinutes,
      servings: recipes.servings,
      tags: recipes.tags,
      isFavorite: recipes.isFavorite,
      averageRating: ratings.avgRating,
      cookCount: cookStats.cookCount,
      lastCookedOn: cookStats.lastCookedOn,
    })
    .from(recipes)
    .leftJoin(cookStats, eq(cookStats.recipeId, recipes.id))
    .leftJoin(ratings, eq(ratings.recipeId, recipes.id))
    .where(
      and(
        eq(recipes.userId, userId),
        sql`(${recipes.category} IS NULL OR ${notInArray(recipes.category, EXCLUDED_CATEGORIES)})`,
      ),
    )
    .orderBy(
      desc(recipes.isFavorite),
      sql`${ratings.avgRating} DESC NULLS LAST`,
      sql`${cookStats.lastCookedOn} ASC NULLS FIRST`,
      desc(recipes.updatedAt),
    )
    .limit(MAX_PLAN_CANDIDATES);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return rows.map((r, index) => ({
    index,
    recipeId: r.id,
    title: r.title,
    category: r.category,
    cuisine: r.cuisine,
    totalTimeMinutes: r.totalTimeMinutes,
    servings: r.servings,
    tags: r.tags ?? [],
    isFavorite: r.isFavorite,
    averageRating: r.averageRating ?? null,
    cookCount: r.cookCount ?? 0,
    lastCookedDaysAgo: r.lastCookedOn
      ? Math.max(
          0,
          Math.floor(
            (today.getTime() - parseISO(r.lastCookedOn).getTime()) / 86_400_000,
          ),
        )
      : null,
    isVegetarian: isVegetarianTags(r.tags),
  }));
}

// ── Rückabbildung der Modellantwort ─────────────────────────────────────────

export interface BackendPlanEntry {
  day_index: number;
  meal_type: string;
  candidate_index: number | null;
  new_title: string | null;
  new_description: string | null;
  reason: string;
  leftover_of_day: number | null;
}

export interface PlanProposal {
  key: string;
  date: string;
  mealType: string;
  recipeId: string | null;
  recipeTitle: string | null;
  recipeServings: number | null;
  newTitle: string | null;
  newDescription: string | null;
  reason: string;
  isFallback: boolean;
  leftoverOfDate: string | null;
}

/** Index → Rezept, day_index → Datum. Einträge mit ungültigem Index werden verworfen. */
export function mapPlanEntries(
  entries: BackendPlanEntry[],
  candidates: PlanCandidate[],
  weekStart: string,
  fallbackKeys: string[] = [],
): PlanProposal[] {
  const monday = parseISO(weekStart);
  const fallback = new Set(fallbackKeys);
  const out: PlanProposal[] = [];
  for (const e of entries) {
    if (e.day_index < 0 || e.day_index > 6) continue;
    const date = format(addDays(monday, e.day_index), "yyyy-MM-dd");
    const cand =
      e.candidate_index != null ? candidates[e.candidate_index] : undefined;
    if (e.candidate_index != null && !cand) continue;
    if (!cand && !e.new_title) continue;
    out.push({
      key: `${date}-${e.meal_type}`,
      date,
      mealType: e.meal_type,
      recipeId: cand?.recipeId ?? null,
      recipeTitle: cand?.title ?? null,
      recipeServings: cand?.servings ?? null,
      newTitle: cand ? null : e.new_title,
      newDescription: cand ? null : e.new_description,
      reason: e.reason,
      isFallback: fallback.has(`${e.day_index}-${e.meal_type}`),
      leftoverOfDate:
        e.leftover_of_day != null &&
        e.leftover_of_day >= 0 &&
        e.leftover_of_day <= 6
          ? format(addDays(monday, e.leftover_of_day), "yyyy-MM-dd")
          : null,
    });
  }
  return out;
}
