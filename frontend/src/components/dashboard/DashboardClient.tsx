"use client";

import QuickActionsWidget from "./QuickActionsWidget";
import RecentRecipesCarousel from "./RecentRecipesCarousel";
import FavoritesWidget from "./FavoritesWidget";
import ShoppingListWidget from "./ShoppingListWidget";
import MealPlanWidget from "./MealPlanWidget";
import DailySuggestionWidget from "./DailySuggestionWidget";

export interface DashboardRecipe {
  id: string;
  title: string;
  category: string | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  totalTimeMinutes: number | null;
  servings: number;
  isFavorite: boolean;
  imageUrl: string | null;
  updatedAt: string;
}

export interface MealPlanEntry {
  id: string;
  mealType: "fruehstueck" | "mittagessen" | "abendessen" | "snack";
  recipeTitle: string;
  recipeId: string;
}

interface DashboardClientProps {
  greeting: string;
  userName: string;
  userId: string;
  recentRecipes: DashboardRecipe[];
  favoriteRecipes: DashboardRecipe[];
  openShoppingCount: number;
  todayMeals: MealPlanEntry[];
  hasApiKey: boolean;
}

export default function DashboardClient({
  greeting,
  userName,
  userId,
  recentRecipes,
  favoriteRecipes,
  openShoppingCount,
  todayMeals,
  hasApiKey,
}: DashboardClientProps) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto" data-testid="dashboard">
      {/* Hero greeting with editorial flair */}
      <header className="relative mb-8 animate-fade-in">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-terra-50 via-cream-100 to-gold-50 dark:from-terra-950/30 dark:via-warm-900 dark:to-gold-950/30 border border-terra-100/60 dark:border-terra-800/60 p-6 sm:p-8">
          {/* Decorative circle */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-terra-100/40 dark:bg-terra-800/20 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-gold-100/50 dark:bg-gold-800/20 blur-xl pointer-events-none" />

          <div className="relative">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-terra-600 dark:text-terra-400 mb-2">
              Dein Rezeptmeister
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)] leading-tight"
              data-testid="dashboard-greeting"
            >
              {greeting}, <span className="text-terra-500">{userName}</span>
            </h1>
            <p className="mt-2 text-[var(--text-secondary)] text-lg">
              Was steht heute auf dem Plan?
            </p>
          </div>
        </div>
      </header>

      {/* Quick actions */}
      <section className="mb-8 animate-slide-up" style={{ animationDelay: "80ms" }}>
        <QuickActionsWidget />
      </section>

      {/* Recently edited carousel — full width */}
      <section className="mb-8 animate-slide-up" style={{ animationDelay: "160ms" }}>
        <RecentRecipesCarousel recipes={recentRecipes} />
      </section>

      {/* Widget grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children animate-slide-up" style={{ animationDelay: "240ms" }}>
        <FavoritesWidget recipes={favoriteRecipes} />
        <DailySuggestionWidget hasApiKey={hasApiKey} userId={userId} />
        <ShoppingListWidget openCount={openShoppingCount} />
        <MealPlanWidget entries={todayMeals} />
      </div>
    </div>
  );
}
