"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getOfflineRecipe, type OfflineRecipe } from "@/lib/offline/db";
import { formatAmount } from "@/lib/units";
import { Suspense } from "react";
import { useOfflineUserId } from "@/lib/hooks/useOfflineUserId";

function OfflineRecipeContent() {
  const searchParams = useSearchParams();
  const recipeId = searchParams.get("id");
  const userId = useOfflineUserId();

  const [entry, setEntry] = useState<OfflineRecipe | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [targetServings, setTargetServings] = useState<number | null>(null);

  useEffect(() => {
    if (!recipeId || !userId) {
      if (!recipeId) setNotFound(true);
      return;
    }
    getOfflineRecipe(userId, recipeId).then((r) => {
      if (!r) {
        setNotFound(true);
      } else {
        setEntry(r);
        setTargetServings(r.data.servings);
      }
    });
  }, [recipeId, userId]);

  const recipe = entry?.data ?? null;
  const scale =
    recipe && targetServings ? targetServings / recipe.servings : 1;

  // Build blob URLs for images
  const imageUrls = useMemo(() => {
    if (!entry) return [];
    return entry.imageThumbnails
      .filter((t) => t.blob.size > 0)
      .map((t) => ({ id: t.id, url: URL.createObjectURL(t.blob) }));
  }, [entry]);

  // Clean up blob URLs
  useEffect(() => {
    return () => imageUrls.forEach((i) => URL.revokeObjectURL(i.url));
  }, [imageUrls]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-[var(--bg-base,#FFF8F0)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-warm-500 mb-4">
            Dieses Rezept ist nicht offline verfügbar.
          </p>
          <Link
            href="/offline"
            className="text-terra-500 hover:text-terra-600 font-medium"
          >
            ← Gespeicherte Rezepte anzeigen
          </Link>
        </div>
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="min-h-screen bg-[var(--bg-base,#FFF8F0)] flex items-center justify-center">
        <div className="text-warm-400 text-sm">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base,#FFF8F0)]">
      {/* Offline banner */}
      <div
        data-testid="offline-recipe-banner"
        className="bg-warm-800 text-cream-50 text-center text-sm py-2 px-4"
      >
        Offline-Modus — Einige Funktionen sind nicht verfügbar
      </div>

      {/* Header */}
      <header className="bg-[var(--bg-surface,#fff)] border-b border-[var(--border-base,#e5e0db)] px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/offline"
            className="text-sm text-warm-500 hover:text-terra-500 mb-2 inline-flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Gespeicherte Rezepte
          </Link>
          <h1
            data-testid="offline-recipe-title"
            className="text-2xl font-bold mt-1"
            style={{ fontFamily: "var(--font-playfair, Georgia, serif)" }}
          >
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="text-warm-500 text-sm mt-1">{recipe.description}</p>
          )}
          {/* Meta badges */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {recipe.category && (
              <span className="text-xs bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full">
                {recipe.category}
              </span>
            )}
            {recipe.difficulty && (
              <span className="text-xs bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full">
                {recipe.difficulty}
              </span>
            )}
            {recipe.totalTimeMinutes && (
              <span className="text-xs bg-warm-100 text-warm-600 px-2 py-0.5 rounded-full">
                {recipe.totalTimeMinutes} Min.
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Hero image */}
      {imageUrls.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrls[0].url}
            alt={recipe.title}
            className="w-full h-48 sm:h-64 object-cover rounded-xl"
          />
        </div>
      )}

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-8">
        {/* Servings scaler */}
        <section>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-warm-600">
              Portionen:
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setTargetServings((s) => Math.max(1, (s ?? 1) - 1))
                }
                className="w-8 h-8 rounded-lg border border-[var(--border-base,#e5e0db)] flex items-center justify-center text-warm-500 hover:border-terra-300"
              >
                −
              </button>
              <span
                data-testid="offline-servings"
                className="w-8 text-center font-semibold"
              >
                {targetServings}
              </span>
              <button
                onClick={() => setTargetServings((s) => (s ?? 1) + 1)}
                className="w-8 h-8 rounded-lg border border-[var(--border-base,#e5e0db)] flex items-center justify-center text-warm-500 hover:border-terra-300"
              >
                +
              </button>
            </div>
          </div>
        </section>

        {/* Ingredients */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Zutaten</h2>
          <ul
            data-testid="offline-ingredients"
            className="space-y-2"
          >
            {recipe.ingredients.map((ing) => {
              const scaledAmount = ing.amount
                ? parseFloat(ing.amount) * scale
                : null;
              return (
                <li
                  key={ing.id}
                  className="flex items-baseline gap-2 py-1 border-b border-warm-100 last:border-0"
                >
                  <span className="font-medium text-warm-700 min-w-[3rem] text-right">
                    {scaledAmount ? formatAmount(scaledAmount) : ""}
                  </span>
                  <span className="text-warm-500 min-w-[2rem]">
                    {ing.unit || ""}
                  </span>
                  <span className="text-warm-800">
                    {ing.name}
                    {ing.isOptional && (
                      <span className="text-warm-400 text-xs ml-1">
                        (optional)
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Instructions */}
        <section>
          <h2 className="text-lg font-semibold mb-3">Zubereitung</h2>
          <div
            data-testid="offline-instructions"
            className="prose prose-warm max-w-none text-warm-700 whitespace-pre-wrap"
          >
            {recipe.instructions}
          </div>
        </section>

        {/* Nutrition (if cached) */}
        {recipe.nutritionInfo && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Nährwerte</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "kcal", value: recipe.nutritionInfo.kcal },
                { label: "Protein", value: `${recipe.nutritionInfo.protein_g}g` },
                { label: "Fett", value: `${recipe.nutritionInfo.fat_g}g` },
                { label: "KH", value: `${recipe.nutritionInfo.carbs_g}g` },
              ].map((n) => (
                <div
                  key={n.label}
                  className="bg-[var(--bg-surface,#fff)] rounded-lg p-3 text-center border border-warm-100"
                >
                  <div className="text-lg font-semibold text-warm-800">
                    {n.value}
                  </div>
                  <div className="text-xs text-warm-500">{n.label}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function OfflineRecipePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-base,#FFF8F0)] flex items-center justify-center">
          <div className="text-warm-400 text-sm">Laden...</div>
        </div>
      }
    >
      <OfflineRecipeContent />
    </Suspense>
  );
}
