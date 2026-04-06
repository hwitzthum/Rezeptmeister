import type { Metadata } from "next";
import Link from "next/link";
import RecipeForm from "@/components/recipes/RecipeForm";

export const metadata: Metadata = {
  title: "Neues Rezept",
};

export default function NeuesRezeptPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/rezepte"
            className="text-sm text-[var(--text-secondary)] hover:text-terra-600 flex items-center gap-1 transition-colors"
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
            Meine Rezepte
          </Link>
          <span className="text-[var(--border-base)]">/</span>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Neues Rezept
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1
          className="text-2xl font-bold text-[var(--text-primary)] mb-8"
        >
          Neues Rezept erstellen
        </h1>
        <RecipeForm mode="create" />
      </main>
    </div>
  );
}
