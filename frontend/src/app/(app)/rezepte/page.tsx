"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecipeCard, Button } from "@/components/ui";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecipeListItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  totalTimeMinutes: number | null;
  servings: number;
  isFavorite: boolean;
  tags: string[] | null;
  averageRating: number | null;
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function RezeptListePage() {
  const router = useRouter();

  // Filter-State
  const [q, setQ] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [kueche, setKueche] = useState("");
  const [schwierigkeit, setSchwierigkeit] = useState("");
  const [nurFavoriten, setNurFavoriten] = useState(false);
  const [sortierung, setSortierung] = useState("neueste");

  // Daten-State
  const [items, setItems] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [seite, setSeite] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQ = useDebounce(q, 300);

  // ── Daten laden ─────────────────────────────────────────────────────────

  const fetchRecipes = useCallback(
    async (page: number, append: boolean) => {
      if (page === 1 && !append) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (kategorie) params.set("kategorie", kategorie);
      if (kueche) params.set("kueche", kueche);
      if (schwierigkeit) params.set("schwierigkeit", schwierigkeit);
      if (nurFavoriten) params.set("favoriten", "true");
      params.set("sortierung", sortierung);
      params.set("seite", String(page));

      try {
        const res = await fetch(`/api/recipes?${params}`);
        if (!res.ok) throw new Error("Laden fehlgeschlagen.");
        const data = await res.json();
        setItems((prev) => (append ? [...prev, ...data.recipes] : data.recipes));
        setTotal(data.total);
        setHasMore(data.hasMore);
        setSeite(page);
      } catch {
        setError("Rezepte konnten nicht geladen werden.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, kategorie, kueche, schwierigkeit, nurFavoriten, sortierung],
  );

  // Neu laden wenn Filter sich ändern
  useEffect(() => {
    fetchRecipes(1, false);
  }, [fetchRecipes]);

  // ── Favorit togglen ──────────────────────────────────────────────────────

  async function toggleFavorite(id: string, newState: boolean) {
    // Optimistisch updaten
    setItems((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isFavorite: newState } : r)),
    );
    try {
      await fetch(`/api/recipes/${id}/favorit`, { method: "PATCH" });
    } catch {
      // Zurücksetzen bei Fehler
      setItems((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isFavorite: !newState } : r)),
      );
      toast.error("Favorit konnte nicht geändert werden.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <h1
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Meine Rezepte
            {total > 0 && (
              <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                ({total})
              </span>
            )}
          </h1>
          <Link href="/rezepte/neu">
            <Button variant="primary" size="sm" icon={<PlusIcon />}>
              Neues Rezept
            </Button>
          </Link>
        </div>
      </header>

      {/* Filter-Leiste */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* Suchfeld */}
            <div className="relative flex-1 min-w-52">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="search"
                placeholder="Rezept suchen..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={[
                  "w-full pl-9 pr-3 py-2 rounded-xl text-sm",
                  "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
                  "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
                ].join(" ")}
              />
            </div>

            {/* Kategorie */}
            <FilterSelect
              value={kategorie}
              onChange={setKategorie}
              label="Kategorie"
              options={[
                "Frühstück", "Mittagessen", "Abendessen", "Snack",
                "Dessert", "Beilage", "Suppe", "Salat", "Backen", "Getränke",
              ]}
            />

            {/* Schwierigkeit */}
            <FilterSelect
              value={schwierigkeit}
              onChange={setSchwierigkeit}
              label="Schwierigkeit"
              options={["einfach", "mittel", "anspruchsvoll"]}
              optionLabels={{ einfach: "Einfach", mittel: "Mittel", anspruchsvoll: "Anspruchsvoll" }}
            />

            {/* Favoriten Toggle */}
            <button
              onClick={() => setNurFavoriten((v) => !v)}
              className={[
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors duration-150",
                nurFavoriten
                  ? "bg-terra-50 border-terra-300 text-terra-700"
                  : "border-[var(--border-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]",
              ].join(" ")}
            >
              <HeartIcon filled={nurFavoriten} className="w-4 h-4" />
              Favoriten
            </button>

            {/* Sortierung */}
            <select
              value={sortierung}
              onChange={(e) => setSortierung(e.target.value)}
              className={[
                "px-3 py-2 rounded-xl text-sm",
                "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
                "text-[var(--text-primary)]",
                "focus:outline-none focus:ring-2 focus:ring-terra-400",
              ].join(" ")}
            >
              <option value="neueste">Neueste zuerst</option>
              <option value="alphabetisch">Alphabetisch</option>
              <option value="bearbeitet">Zuletzt bearbeitet</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inhalt */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div
                key={n}
                className="h-72 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-base)] animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <EmptyState hasFilters={!!(q || kategorie || kueche || schwierigkeit || nurFavoriten)} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((recipe) => (
                <RecipeCard
                  key={recipe.id}
                  id={recipe.id}
                  title={recipe.title}
                  category={recipe.category ?? undefined}
                  totalTimeMinutes={recipe.totalTimeMinutes ?? undefined}
                  difficulty={recipe.difficulty ?? undefined}
                  servings={recipe.servings}
                  isFavorite={recipe.isFavorite}
                  tags={recipe.tags ?? undefined}
                  averageRating={recipe.averageRating ?? undefined}
                  onClick={() => router.push(`/rezepte/${recipe.id}`)}
                  onFavoriteToggle={(id, newState) => toggleFavorite(id, newState)}
                />
              ))}
            </div>

            {/* Mehr laden */}
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchRecipes(seite + 1, true)}
                  loading={loadingMore}
                >
                  Mehr laden ({total - items.length} weitere)
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ── Hilfsfunktionen & Komponenten ─────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  label,
  options,
  optionLabels,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
  optionLabels?: Record<string, string>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={[
        "px-3 py-2 rounded-xl text-sm",
        "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
        value ? "text-terra-700 border-terra-300 bg-terra-50" : "text-[var(--text-secondary)]",
        "focus:outline-none focus:ring-2 focus:ring-terra-400",
      ].join(" ")}
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {optionLabels?.[opt] ?? opt}
        </option>
      ))}
    </select>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-full bg-terra-50 flex items-center justify-center mb-4">
        <svg
          className="w-10 h-10 text-terra-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>
      <h3
        className="text-lg font-semibold text-[var(--text-primary)] mb-2"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {hasFilters ? "Keine Rezepte gefunden" : "Noch keine Rezepte"}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-sm">
        {hasFilters
          ? "Versuchen Sie es mit anderen Filtern oder einer anderen Suche."
          : "Erstellen Sie Ihr erstes Rezept und beginnen Sie Ihre digitale Rezeptsammlung."}
      </p>
      {!hasFilters && (
        <Link href="/rezepte/neu">
          <Button variant="primary" icon={<PlusIcon />}>
            Erstes Rezept erstellen
          </Button>
        </Link>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
    </svg>
  );
}

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
