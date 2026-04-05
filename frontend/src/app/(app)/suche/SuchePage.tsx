"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { formatTime } from "@/lib/format";
import { Input, Select } from "@/components/ui";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Recipe {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  totalTimeMinutes: number | null;
  servings: number;
  isFavorite: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface Facets {
  categories: { value: string; count: number }[];
  cuisines: { value: string; count: number }[];
  difficulties: { value: string; count: number }[];
}

// ── Highlight helper ──────────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;
  const pattern = `(${terms.join("|")})`;
  // splitRegex (global) splits the string; matchRegex (no 'g') tests each part.
  // Using separate objects avoids the stateful-lastIndex bug where a global regex
  // reused in .test() advances lastIndex across calls and misclassifies parts.
  const splitRegex = new RegExp(pattern, "gi");
  const matchRegex = new RegExp(pattern, "i");
  const parts = text.split(splitRegex);
  return parts.map((part, i) =>
    matchRegex.test(part) ? (
      <mark
        key={i}
        className="bg-amber-100 text-amber-900 rounded-sm px-0.5 not-italic"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

// ── Difficulty labels ─────────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<string, string> = {
  einfach: "Einfach",
  mittel: "Mittel",
  anspruchsvoll: "Anspruchsvoll",
};

const PAGE_LIMIT = 20;

const ZEITAUFWAND_OPTIONS = [
  { value: "15", label: "Bis 15 Min." },
  { value: "30", label: "Bis 30 Min." },
  { value: "60", label: "Bis 60 Min." },
  { value: "120", label: "Bis 2 Stunden" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function SuchePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ── Filter state (initialised from URL on mount) ──────────────────────────
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [kategorie, setKategorie] = useState(searchParams.get("kategorie") ?? "");
  const [kueche, setKueche] = useState(searchParams.get("kueche") ?? "");
  const [schwierigkeit, setSchwierigkeit] = useState(searchParams.get("schwierigkeit") ?? "");
  const [ernaehrungsform, setErnaehrungsform] = useState(searchParams.get("ernaehrungsform") ?? "");
  const [zeitaufwand, setZeitaufwand] = useState(searchParams.get("zeitaufwand") ?? "");
  const [zutaten, setZutaten] = useState(searchParams.get("zutaten") ?? "");
  const [sortierung, setSortierung] = useState(searchParams.get("sortierung") ?? "neueste");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // ── Results state ─────────────────────────────────────────────────────────
  const [items, setItems] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [facets, setFacets] = useState<Facets | null>(null);

  // ── Debounced text inputs ─────────────────────────────────────────────────
  const debouncedQ = useDebounce(q, 400);
  const debouncedZutaten = useDebounce(zutaten, 400);
  const debouncedErnaehrungsform = useDebounce(ernaehrungsform, 400);

  // ── Reset "Relevanz" sort when query is cleared ───────────────────────────
  // Prevents invisible stale state: "Relevanz" option disappears from UI when
  // debouncedQ is empty, but sortierung state would silently retain the value.
  useEffect(() => {
    if (!debouncedQ && sortierung === "relevanz") {
      setSortierung("neueste");
    }
  }, [debouncedQ, sortierung]);

  // ── Sync all filter state to URL (no history entry) ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (kategorie) params.set("kategorie", kategorie);
    if (kueche) params.set("kueche", kueche);
    if (schwierigkeit) params.set("schwierigkeit", schwierigkeit);
    if (debouncedErnaehrungsform) params.set("ernaehrungsform", debouncedErnaehrungsform);
    if (zeitaufwand) params.set("zeitaufwand", zeitaufwand);
    if (debouncedZutaten) params.set("zutaten", debouncedZutaten);
    if (sortierung && sortierung !== "neueste") params.set("sortierung", sortierung);
    const qs = params.size > 0 ? "?" + params.toString() : "";
    router.replace(pathname + qs, { scroll: false });
  }, [
    debouncedQ,
    kategorie,
    kueche,
    schwierigkeit,
    debouncedErnaehrungsform,
    zeitaufwand,
    debouncedZutaten,
    sortierung,
    pathname,
    router,
  ]);

  // ── Fetch results ─────────────────────────────────────────────────────────
  const fetchResults = useCallback(
    async (page: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (debouncedQ) params.set("q", debouncedQ);
        if (kategorie) params.set("kategorie", kategorie);
        if (kueche) params.set("kueche", kueche);
        if (schwierigkeit) params.set("schwierigkeit", schwierigkeit);
        if (debouncedErnaehrungsform) params.set("ernaehrungsform", debouncedErnaehrungsform);
        if (zeitaufwand) params.set("zeitaufwand", zeitaufwand);
        if (debouncedZutaten) params.set("zutaten", debouncedZutaten);
        params.set("sortierung", sortierung);
        params.set("seite", String(page));
        // Only fetch facet counts on page 1 and filter changes — not on pagination
        params.set("includeFacets", append ? "false" : "true");

        const res = await fetch(`/api/recipes?${params.toString()}`);
        if (!res.ok) throw new Error("Fehler beim Laden der Rezepte.");
        const data = await res.json();

        setItems((prev) => (append ? [...prev, ...data.recipes] : data.recipes));
        setTotal(data.total);
        setHasMore(data.hasMore);
        if (data.facets) setFacets(data.facets);
      } catch {
        toast.error("Rezepte konnten nicht geladen werden.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, kategorie, kueche, schwierigkeit, debouncedErnaehrungsform, zeitaufwand, debouncedZutaten, sortierung],
  );

  // ── Re-fetch on filter change (reset to page 1) ───────────────────────────
  useEffect(() => {
    fetchResults(1, false);
  }, [fetchResults]);

  // ── Active filter chips ───────────────────────────────────────────────────
  const activeFilters: { label: string; clear: () => void }[] = [];
  if (kategorie) activeFilters.push({ label: kategorie, clear: () => setKategorie("") });
  if (kueche) activeFilters.push({ label: kueche, clear: () => setKueche("") });
  if (schwierigkeit)
    activeFilters.push({ label: DIFFICULTY_LABELS[schwierigkeit] ?? schwierigkeit, clear: () => setSchwierigkeit("") });
  if (ernaehrungsform)
    activeFilters.push({ label: ernaehrungsform, clear: () => setErnaehrungsform("") });
  if (zeitaufwand) {
    const opt = ZEITAUFWAND_OPTIONS.find((o) => o.value === zeitaufwand);
    activeFilters.push({ label: opt?.label ?? `${zeitaufwand} Min.`, clear: () => setZeitaufwand("") });
  }
  if (zutaten) activeFilters.push({ label: `Zutat: ${zutaten}`, clear: () => setZutaten("") });

  function resetAllFilters() {
    setQ("");
    setKategorie("");
    setKueche("");
    setSchwierigkeit("");
    setErnaehrungsform("");
    setZeitaufwand("");
    setZutaten("");
    setSortierung("neueste");
  }

  const hasActiveFilters = activeFilters.length > 0;


  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] px-6 lg:px-10 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
            Suche &amp; Entdecken
          </h1>
          <span className="text-sm text-[var(--text-muted)]">
            {loading ? "Suche läuft…" : `${total} Rezept${total !== 1 ? "e" : ""}`}
          </span>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              role="searchbox"
              autoFocus
              placeholder="Rezept, Zutat oder Beschreibung suchen…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400"
            />
          </div>

          {/* Sort */}
          <select
            value={sortierung}
            onChange={(e) => setSortierung(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400"
          >
            {debouncedQ && <option value="relevanz">Relevanz</option>}
            <option value="neueste">Neueste</option>
            <option value="alphabetisch">A–Z</option>
            <option value="bearbeitet">Zuletzt bearbeitet</option>
          </select>

          {/* Mobile filter toggle */}
          <button
            type="button"
            onClick={() => setShowMobileFilters((v) => !v)}
            className={`lg:hidden px-3 py-2.5 rounded-xl text-sm border transition-colors ${
              hasActiveFilters
                ? "border-terra-400 bg-terra-50 text-terra-700"
                : "border-[var(--border-base)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
            }`}
            aria-label="Filter"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 4h18M7 12h10M11 20h2"
              />
            </svg>
          </button>
        </div>

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mt-2">
            {activeFilters.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-terra-100 text-terra-700 border border-terra-200"
              >
                {f.label}
                <button
                  type="button"
                  onClick={f.clear}
                  aria-label="Entfernen"
                  className="ml-0.5 hover:text-terra-900 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Mobile filter panel */}
      {showMobileFilters && (
        <div className="lg:hidden bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] px-6 py-4">
          <FilterSidebar
            kategorie={kategorie} setKategorie={setKategorie}
            kueche={kueche} setKueche={setKueche}
            schwierigkeit={schwierigkeit} setSchwierigkeit={setSchwierigkeit}
            ernaehrungsform={ernaehrungsform} setErnaehrungsform={setErnaehrungsform}
            zeitaufwand={zeitaufwand} setZeitaufwand={setZeitaufwand}
            zutaten={zutaten} setZutaten={setZutaten}
            facets={facets}
            hasActiveFilters={hasActiveFilters}
            resetAllFilters={resetAllFilters}
          />
        </div>
      )}

      {/* Main layout */}
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 flex-shrink-0 border-r border-[var(--border-subtle)] p-6 sticky top-[calc(4.5rem+1px)] self-start max-h-[calc(100vh-5rem)] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">
            Filter
          </p>
          <FilterSidebar
            kategorie={kategorie} setKategorie={setKategorie}
            kueche={kueche} setKueche={setKueche}
            schwierigkeit={schwierigkeit} setSchwierigkeit={setSchwierigkeit}
            ernaehrungsform={ernaehrungsform} setErnaehrungsform={setErnaehrungsform}
            zeitaufwand={zeitaufwand} setZeitaufwand={setZeitaufwand}
            zutaten={zutaten} setZutaten={setZutaten}
            facets={facets}
            hasActiveFilters={hasActiveFilters}
            resetAllFilters={resetAllFilters}
          />
        </aside>

        {/* Results */}
        <main className="flex-1 px-6 lg:px-8 py-6 min-w-0">
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="h-20 rounded-xl bg-[var(--bg-subtle)] animate-pulse"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters || !!debouncedQ} />
          ) : (
            <>
              <ul data-testid="result-list" className="space-y-3">
                {items.map((recipe) => (
                  <ResultItem key={recipe.id} recipe={recipe} query={debouncedQ} />
                ))}
              </ul>

              {hasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => fetchResults(Math.ceil(items.length / PAGE_LIMIT) + 1, true)}
                    disabled={loadingMore}
                    className="px-6 py-2.5 rounded-xl text-sm font-medium border border-[var(--border-base)] text-[var(--text-secondary)] hover:border-terra-400 hover:text-terra-600 disabled:opacity-50 transition-colors"
                  >
                    {loadingMore ? "Laden…" : "Mehr laden"}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Filter sidebar component ──────────────────────────────────────────────────

interface FilterSidebarProps {
  kategorie: string;
  setKategorie: (v: string) => void;
  kueche: string;
  setKueche: (v: string) => void;
  schwierigkeit: string;
  setSchwierigkeit: (v: string) => void;
  ernaehrungsform: string;
  setErnaehrungsform: (v: string) => void;
  zeitaufwand: string;
  setZeitaufwand: (v: string) => void;
  zutaten: string;
  setZutaten: (v: string) => void;
  facets: Facets | null;
  hasActiveFilters: boolean;
  resetAllFilters: () => void;
}

function FilterSidebar({
  kategorie, setKategorie,
  kueche, setKueche,
  schwierigkeit, setSchwierigkeit,
  ernaehrungsform, setErnaehrungsform,
  zeitaufwand, setZeitaufwand,
  zutaten, setZutaten,
  facets, hasActiveFilters, resetAllFilters,
}: FilterSidebarProps) {
  function facetCount(
    type: "categories" | "cuisines" | "difficulties",
    value: string,
  ): number | null {
    if (!facets) return null;
    const entry = facets[type].find((f) => f.value === value);
    return entry?.count ?? null;
  }

  return (
    <div className="space-y-6">
      {/* Kategorie */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Kategorie
        </label>
        <Select
          name="kategorie"
          data-filter="kategorie"
          value={kategorie}
          onChange={(e) => setKategorie(e.target.value)}
        >
          <option value="">Alle Kategorien</option>
          {facets
            ? [
                // Always include the selected value even if it has 0 facet results
                ...(kategorie && !facets.categories.find((c) => c.value === kategorie)
                  ? [{ value: kategorie, count: 0 }]
                  : []),
                ...facets.categories,
              ].map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}{c.count > 0 ? ` (${c.count})` : ""}
                </option>
              ))
            : ["Frühstück", "Hauptgericht", "Dessert", "Snack", "Suppe", "Salat", "Backen"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
        </Select>
      </div>

      {/* Küche */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Küche
        </label>
        <Select
          name="kueche"
          value={kueche}
          onChange={(e) => setKueche(e.target.value)}
        >
          <option value="">Alle Küchen</option>
          {(facets?.cuisines ?? []).map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </Select>
      </div>

      {/* Schwierigkeit */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Schwierigkeit
        </label>
        <div className="space-y-1.5">
          {(["einfach", "mittel", "anspruchsvoll"] as const).map((d) => {
            const count = facetCount("difficulties", d);
            return (
              <label key={d} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="schwierigkeit"
                  value={d}
                  checked={schwierigkeit === d}
                  onChange={() => setSchwierigkeit(schwierigkeit === d ? "" : d)}
                  className="accent-terra-500"
                />
                <span className="text-sm text-[var(--text-primary)] group-hover:text-terra-600 transition-colors">
                  {DIFFICULTY_LABELS[d]}
                  {count !== null && (
                    <span className="ml-1 text-[var(--text-muted)]">({count})</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Zeitaufwand */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Zeitaufwand
        </label>
        <Select
          value={zeitaufwand}
          onChange={(e) => setZeitaufwand(e.target.value)}
        >
          <option value="">Beliebig</option>
          {ZEITAUFWAND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Ernährungsform */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Ernährungsform
        </label>
        <Input
          type="text"
          placeholder="z.B. vegan, glutenfrei"
          value={ernaehrungsform}
          onChange={(e) => setErnaehrungsform(e.target.value)}
        />
      </div>

      {/* Zutaten */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Zutat enthält
        </label>
        <Input
          type="text"
          placeholder="z.B. Zitrone"
          value={zutaten}
          onChange={(e) => setZutaten(e.target.value)}
        />
      </div>

      {/* Reset */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetAllFilters}
          className="w-full px-3 py-2 rounded-xl text-sm border border-[var(--border-base)] text-[var(--text-secondary)] hover:border-terra-400 hover:text-terra-600 transition-colors"
        >
          Filter zurücksetzen
        </button>
      )}
    </div>
  );
}

// ── Result item component ─────────────────────────────────────────────────────

function ResultItem({ recipe, query }: { recipe: Recipe; query: string }) {
  const timeLabel =
    recipe.totalTimeMinutes != null ? formatTime(recipe.totalTimeMinutes) : null;

  return (
    <li>
      <Link
        href={`/rezepte/${recipe.id}`}
        className="group flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-terra-300 hover:shadow-warm transition-all"
      >
        {/* Color dot for category */}
        <div className="flex-shrink-0 w-1.5 self-stretch rounded-full bg-terra-400 group-hover:bg-terra-500 transition-colors" />

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-terra-700 transition-colors">
            {highlightMatch(recipe.title, query)}
          </h3>
          {recipe.description && (
            <p className="text-sm text-[var(--text-secondary)] mt-0.5 line-clamp-2">
              {highlightMatch(recipe.description, query)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            {recipe.category && (
              <span className="text-xs text-[var(--text-muted)]">{recipe.category}</span>
            )}
            {recipe.cuisine && (
              <span className="text-xs text-[var(--text-muted)]">{recipe.cuisine}</span>
            )}
            {timeLabel && (
              <span className="text-xs text-[var(--text-muted)]">⏱ {timeLabel}</span>
            )}
            {recipe.difficulty && (
              <span className="text-xs text-[var(--text-muted)]">
                {DIFFICULTY_LABELS[recipe.difficulty]}
              </span>
            )}
          </div>
        </div>

        {recipe.isFavorite && (
          <span className="flex-shrink-0 text-terra-500" aria-label="Favorit">
            ♥
          </span>
        )}
      </Link>
    </li>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-[var(--text-muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-1">
        {hasFilters ? "Keine Ergebnisse" : "Noch keine Rezepte"}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">
        {hasFilters
          ? "Versuche andere Suchbegriffe oder entferne einige Filter."
          : "Erstelle dein erstes Rezept, um die Suche zu nutzen."}
      </p>
      {!hasFilters && (
        <Link
          href="/rezepte/neu"
          className="mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-terra-500 text-white hover:bg-terra-600 transition-colors"
        >
          Erstes Rezept erstellen
        </Link>
      )}
    </div>
  );
}
