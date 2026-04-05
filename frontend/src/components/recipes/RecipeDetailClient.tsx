"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, ConfirmDialog, DifficultyBadge } from "@/components/ui";
import { formatAmount } from "@/lib/units";
import toast from "react-hot-toast";
import RecipeImageManager from "@/components/images/RecipeImageManager";
import type { UploadedImage } from "@/components/images/ImageUploadZone";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ingredient {
  id: string;
  name: string;
  amount: string | null;
  unit: string | null;
  groupName: string | null;
  sortOrder: number;
  isOptional: boolean;
}

type RecipeImage = UploadedImage;

export interface RecipeDetail {
  id: string;
  title: string;
  description: string | null;
  instructions: string;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  category: string | null;
  cuisine: string | null;
  tags: string[] | null;
  isFavorite: boolean;
  ingredients: Ingredient[];
  images: RecipeImage[];
  createdAt: string;
  updatedAt: string;
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function RecipeDetailClient({
  recipe,
}: {
  recipe: RecipeDetail;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(recipe.isFavorite);
  const [targetServings, setTargetServings] = useState(recipe.servings);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Favorit ───────────────────────────────────────────────────────────────

  async function toggleFavorite() {
    const prev = isFavorite;
    setIsFavorite((v) => !v);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}/favorit`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIsFavorite(data.isFavorite);
    } catch {
      setIsFavorite(prev);
      toast.error("Favorit konnte nicht geändert werden.");
    }
  }

  // ── Löschen ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Rezept gelöscht.");
      router.push("/rezepte");
      router.refresh();
    } catch {
      toast.error("Rezept konnte nicht gelöscht werden.");
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  // ── Zutat skalieren ───────────────────────────────────────────────────────

  function scaledAmount(amountStr: string | null): string {
    if (!amountStr) return "";
    const n = parseFloat(amountStr);
    if (isNaN(n)) return amountStr;
    const scaled = (n * targetServings) / recipe.servings;
    return formatAmount(scaled);
  }

  function formatTime(minutes: number) {
    if (minutes < 60) return `${minutes} Min.`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/rezepte"
            className="text-sm text-[var(--text-secondary)] hover:text-terra-600 flex items-center gap-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Meine Rezepte
          </Link>

          {/* Aktionsleiste */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFavorite}
              aria-label={isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
              aria-pressed={isFavorite}
              className={[
                "w-9 h-9 rounded-xl flex items-center justify-center",
                "border transition-all duration-150",
                isFavorite
                  ? "border-terra-300 bg-terra-50 text-terra-500"
                  : "border-[var(--border-base)] text-warm-400 hover:text-terra-500 hover:border-terra-300",
              ].join(" ")}
            >
              <HeartIcon filled={isFavorite} className="w-4 h-4" />
            </button>

            <Link href={`/rezepte/${recipe.id}/bearbeiten`}>
              <Button variant="outline" size="sm">
                Bearbeiten
              </Button>
            </Link>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
            >
              Löschen
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="relative h-64 sm:h-80 bg-gradient-to-br from-terra-100 via-cream-100 to-warm-100 overflow-hidden">
        {(() => {
          const heroImg = recipe.images.find((i) => i.isPrimary) ?? recipe.images[0];
          return heroImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImg.filePath}
              alt={recipe.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <svg
                className="w-16 h-16 text-terra-200"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          );
        })()}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Titel im Hero */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <h1
            className="text-2xl sm:text-3xl font-bold text-white drop-shadow-sm"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {recipe.title}
          </h1>
        </div>
      </div>

      {/* Hauptinhalt */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Meta-Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {recipe.difficulty && <DifficultyBadge difficulty={recipe.difficulty} />}
          {recipe.category && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-warm-100 text-warm-700">
              {recipe.category}
            </span>
          )}
          {recipe.cuisine && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-warm-100 text-warm-700">
              {recipe.cuisine}
            </span>
          )}
          {recipe.totalTimeMinutes && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-warm-100 text-warm-700 flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5" />
              {formatTime(recipe.totalTimeMinutes)}
            </span>
          )}
        </div>

        {/* Beschreibung */}
        {recipe.description && (
          <p className="text-[var(--text-secondary)] mb-6 max-w-2xl">
            {recipe.description}
          </p>
        )}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md text-xs bg-terra-50 text-terra-600 border border-terra-100"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Zwei-Spalten-Layout */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Linke Spalte: Zubereitung */}
          <section className="flex-1 min-w-0">
            <h2
              className="text-xl font-semibold text-[var(--text-primary)] mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Zubereitung
            </h2>
            {recipe.instructions ? (
              <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
                {recipe.instructions.split(/\n+/).map((para, i) => (
                  <p key={i} className="mb-3 whitespace-pre-wrap">
                    {para}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] italic">
                Keine Zubereitung angegeben.
              </p>
            )}
          </section>

          {/* Rechte Spalte: Zutaten */}
          <aside className="lg:w-72 xl:w-80 shrink-0">
            <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm p-5 lg:sticky lg:top-20">
              <h2
                className="text-lg font-semibold text-[var(--text-primary)] mb-4"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Zutaten
              </h2>

              {/* Portionsrechner */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--border-subtle)]">
                <span className="text-sm text-[var(--text-secondary)]">
                  Portionen:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setTargetServings((v) => Math.max(1, v - 1))
                    }
                    disabled={targetServings <= 1}
                    className="w-7 h-7 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] disabled:opacity-40 transition-colors"
                    aria-label="Portionen verringern"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <span
                    className="w-10 text-center text-base font-semibold text-[var(--text-primary)]"
                    data-testid="servings-display"
                  >
                    {targetServings}
                  </span>
                  <button
                    onClick={() =>
                      setTargetServings((v) => Math.min(999, v + 1))
                    }
                    className="w-7 h-7 rounded-lg border border-[var(--border-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
                    aria-label="Portionen erhöhen"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Zutatenliste */}
              {recipe.ingredients.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] italic">
                  Keine Zutaten angegeben.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recipe.ingredients.map((ing) => {
                    const amount = scaledAmount(ing.amount);
                    return (
                      <li
                        key={ing.id}
                        className={[
                          "flex items-baseline gap-2 text-sm",
                          ing.isOptional
                            ? "text-[var(--text-muted)]"
                            : "text-[var(--text-primary)]",
                        ].join(" ")}
                      >
                        <span className="font-medium text-terra-600 w-16 shrink-0 text-right">
                          {amount}
                          {ing.unit && ` ${ing.unit}`}
                        </span>
                        <span className="flex-1">
                          {ing.name}
                          {ing.isOptional && (
                            <span className="ml-1 text-xs text-[var(--text-muted)]">
                              (optional)
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Zeiten */}
              {(recipe.prepTimeMinutes || recipe.cookTimeMinutes) && (
                <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-1 text-sm text-[var(--text-secondary)]">
                  {recipe.prepTimeMinutes && (
                    <div className="flex justify-between">
                      <span>Vorbereitung</span>
                      <span className="font-medium">
                        {recipe.prepTimeMinutes} Min.
                      </span>
                    </div>
                  )}
                  {recipe.cookTimeMinutes && (
                    <div className="flex justify-between">
                      <span>Kochzeit</span>
                      <span className="font-medium">
                        {recipe.cookTimeMinutes} Min.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Bilderverwaltung */}
        <section className="mt-10 pt-6 border-t border-[var(--border-subtle)]">
          <h2
            className="text-xl font-semibold text-[var(--text-primary)] mb-4"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bilder
          </h2>
          <RecipeImageManager recipeId={recipe.id} initialImages={recipe.images} />
        </section>

        {/* Notizen-Platzhalter (Phase 9) */}
        <section className="mt-10 pt-6 border-t border-[var(--border-subtle)]">
          <p className="text-sm text-[var(--text-muted)] italic">
            Notizen und Bewertungen folgen in Phase 9.
          </p>
        </section>
      </main>

      {/* Löschen-Dialog */}
      <ConfirmDialog
        open={showDeleteDialog}
        title="Rezept löschen"
        message={`Möchten Sie "${recipe.title}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        loading={deleting}
        onConfirm={() => { void handleDelete(); }}
        onClose={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function HeartIcon({ filled, className }: { filled: boolean; className?: string }) {
  return filled ? (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ) : (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}
