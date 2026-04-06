"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RecipeCard, Button, PageHeader } from "@/components/ui";
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
  const kueche = ""; // Küche-Filter vorbereitet, UI-Auswahl folgt in späterer Phase
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
      <PageHeader
        subtitle="Rezepte"
        title="Meine Rezepte"
        count={total}
        action={
          <Link href="/rezepte/neu">
            <Button variant="primary" size="sm" icon={<PlusIcon />}>
              Neues Rezept
            </Button>
          </Link>
        }
      />

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
                  ? "bg-terra-50 dark:bg-terra-950/30 border-terra-300 text-terra-700"
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
              <div key={n} className="rounded-2xl overflow-hidden border border-[var(--border-base)]">
                <div className="skeleton h-48" />
                <div className="p-4 space-y-3">
                  <div className="skeleton h-5 w-3/4 rounded" />
                  <div className="flex gap-3">
                    <div className="skeleton h-3 w-16 rounded" />
                    <div className="skeleton h-3 w-20 rounded" />
                  </div>
                </div>
              </div>
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
        value ? "text-terra-700 border-terra-300 bg-terra-50 dark:bg-terra-950/30" : "text-[var(--text-secondary)]",
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
  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-warm-100 to-cream-200 dark:from-warm-800 dark:to-warm-900 flex items-center justify-center">
          <svg className="w-10 h-10 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          Keine Treffer
        </h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
          Versuchen Sie andere Filter oder einen anderen Suchbegriff.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {/* CSS illustration: overlapping recipe card silhouettes */}
      <div className="relative w-32 h-28 mx-auto mb-8">
        <div className="absolute top-2 left-3 w-20 h-24 rounded-xl bg-cream-200 dark:bg-warm-800 rotate-[-6deg] border border-[var(--border-base)]" />
        <div className="absolute top-0 left-6 w-20 h-24 rounded-xl bg-[var(--bg-surface)] rotate-[3deg] border border-[var(--border-base)] shadow-[var(--shadow-warm-sm)]" />
        <div className="absolute top-1 left-10 w-20 h-24 rounded-xl bg-[var(--bg-elevated)] rotate-[0deg] border border-[var(--border-base)] shadow-[var(--shadow-warm)] flex items-center justify-center">
          <svg className="w-8 h-8 text-terra-300 dark:text-terra-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
      </div>
      <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        Willkommen in Ihrer Küche
      </h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto mb-8 leading-relaxed">
        Beginnen Sie Ihre digitale Rezeptsammlung. Erstellen, importieren oder fotografieren Sie Ihr erstes Rezept.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/rezepte/neu">
          <Button variant="primary" icon={<PlusIcon />}>
            Rezept erstellen
          </Button>
        </Link>
      </div>
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
