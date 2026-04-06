"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { DashboardRecipe } from "./DashboardClient";

interface Props {
  recipes: DashboardRecipe[];
}

const difficultyColor: Record<string, string> = {
  einfach: "text-emerald-600",
  mittel: "text-gold-600",
  anspruchsvoll: "text-terra-600",
};

export default function FavoritesWidget({ recipes }: Props) {
  return (
    <Card data-testid="favorites-widget">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <svg className="w-5 h-5 text-terra-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          Favoriten
        </h2>
        <Link
          href="/rezepte?favoriten=true"
          className="text-sm text-terra-500 hover:text-terra-600 font-medium"
        >
          Alle anzeigen
        </Link>
      </div>

      {recipes.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm">
          Noch keine Favoriten markiert.
        </p>
      ) : (
        <ul className="space-y-3">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/rezepte/${recipe.id}`}
                className="flex items-center gap-3 p-2 -m-2 rounded-lg hover:bg-[var(--bg-subtle)] transition-colors group"
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-cream-100">
                  {recipe.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={recipe.imageUrl}
                      alt={recipe.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-cream-200 to-warm-100">
                      <svg className="w-5 h-5 text-terra-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-terra-600 transition-colors">
                    {recipe.title}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    {recipe.category && <span>{recipe.category}</span>}
                    {recipe.difficulty && (
                      <span className={difficultyColor[recipe.difficulty]}>
                        {recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
