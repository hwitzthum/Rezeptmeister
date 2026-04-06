"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecipeCard } from "@/components/ui/card";
import type { DashboardRecipe } from "./DashboardClient";

interface Props {
  recipes: DashboardRecipe[];
}

export default function RecentRecipesCarousel({ recipes }: Props) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      return () => el.removeEventListener("scroll", checkScroll);
    }
  }, [checkScroll, recipes]);

  function scroll(direction: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 300;
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  }

  async function handleFavoriteToggle(id: string, newState: boolean) {
    await fetch(`/api/recipes/${id}/favorit`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: newState }),
    });
  }

  if (recipes.length === 0) {
    return (
      <div data-testid="recent-recipes-carousel">
        <h2 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-4">
          Zuletzt bearbeitet
        </h2>
        <div className="rounded-xl border border-dashed border-[var(--border-base)] p-8 text-center text-[var(--text-muted)]">
          Noch keine Rezepte erstellt.{" "}
          <Link href="/rezepte/neu" className="text-terra-500 hover:text-terra-600 font-medium">
            Jetzt starten
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="recent-recipes-carousel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <span className="inline-block w-1 h-6 rounded-full bg-terra-500" aria-hidden="true" />
          Zuletzt bearbeitet
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-base)] text-[var(--text-secondary)] hover:bg-terra-50 hover:text-terra-600 hover:border-terra-200 disabled:opacity-25 disabled:cursor-default transition-all duration-200"
            aria-label="Nach links scrollen"
            data-testid="carousel-left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="p-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-base)] text-[var(--text-secondary)] hover:bg-terra-50 hover:text-terra-600 hover:border-terra-200 disabled:opacity-25 disabled:cursor-default transition-all duration-200"
            aria-label="Nach rechts scrollen"
            data-testid="carousel-right"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative">
        {/* Fade edges to hint at scrollability */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-[var(--bg-base)] to-transparent z-10 pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[var(--bg-base)] to-transparent z-10 pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 -mb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {recipes.map((recipe) => (
            <div key={recipe.id} className="snap-start shrink-0 w-[280px]">
              <RecipeCard
                id={recipe.id}
                title={recipe.title}
                category={recipe.category ?? undefined}
                totalTimeMinutes={recipe.totalTimeMinutes ?? undefined}
                difficulty={recipe.difficulty ?? undefined}
                imageUrl={recipe.imageUrl ?? undefined}
                isFavorite={recipe.isFavorite}
                servings={recipe.servings}
                onClick={() => router.push(`/rezepte/${recipe.id}`)}
                onFavoriteToggle={handleFavoriteToggle}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
