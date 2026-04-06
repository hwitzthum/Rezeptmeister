"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { useDebounce } from "@/lib/hooks/useDebounce";
import { formatTime } from "@/lib/format";
import { Input, Select, IngredientTagInput } from "@/components/ui";
import WebSearchResults from "@/components/ai/WebSearchResults";
import UrlImportDialog from "@/components/ai/UrlImportDialog";

// ── Zutaten match types ──────────────────────────────────────────────────────

interface ZutatenMatchResult {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  totalTimeMinutes: number | null;
  servings: number;
  isFavorite: boolean;
  totalIngredients: number;
  matchedCount: number;
  matchPercentage: number;
  matchedIngredients: string[];
  missingIngredients: { name: string; amount: string | null; unit: string | null }[];
}

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

interface KiRecipe {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  cuisine: string | null;
  difficulty: "einfach" | "mittel" | "anspruchsvoll" | null;
  total_time_minutes: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  is_favorite: boolean;
  thumbnail_url: string | null;
  score: number;
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

// ── Constants ─────────────────────────────────────────────────────────────────

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

// Für Cross-Modal-Suche nur JPEG/PNG – Backend schreibt Temp-Datei immer mit .jpg-Suffix
const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png"];

// ── Main Component ────────────────────────────────────────────────────────────

export default function SuchePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ── Search mode ───────────────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState<"volltext" | "ki" | "web" | "zutaten">("volltext");

  // ── URL import state (triggered from web search results) ─────────────────
  const [importUrl, setImportUrl] = useState("");
  const [showUrlImport, setShowUrlImport] = useState(false);

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

  // ── Volltext results ──────────────────────────────────────────────────────
  const [items, setItems] = useState<Recipe[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [facets, setFacets] = useState<Facets | null>(null);

  // ── KI-Suche state ────────────────────────────────────────────────────────
  const [kiResults, setKiResults] = useState<KiRecipe[]>([]);
  const [kiLoading, setKiLoading] = useState(false);
  const [kiError, setKiError] = useState<string | null>(null);
  const [noApiKey, setNoApiKey] = useState(false);
  const [kiImage, setKiImage] = useState<File | null>(null);
  const [kiSearched, setKiSearched] = useState(false);
  const kiImageInputRef = useRef<HTMLInputElement>(null);

  // ── Zutaten-Suche state ───────────────────────────────────────────────────
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [zutatenResults, setZutatenResults] = useState<ZutatenMatchResult[]>([]);
  const [zutatenTotal, setZutatenTotal] = useState(0);
  const [zutatenHasMore, setZutatenHasMore] = useState(false);
  const [zutatenLoading, setZutatenLoading] = useState(false);
  const [zutatenSearched, setZutatenSearched] = useState(false);
  const zutatenAbortRef = useRef<AbortController | null>(null);

  // ── Debounced text inputs ─────────────────────────────────────────────────
  const debouncedQ = useDebounce(q, 400);
  const debouncedZutaten = useDebounce(zutaten, 400);
  const debouncedErnaehrungsform = useDebounce(ernaehrungsform, 400);

  // ── Reset "Relevanz" sort when query is cleared ───────────────────────────
  useEffect(() => {
    if (!debouncedQ && sortierung === "relevanz") {
      setSortierung("neueste");
    }
  }, [debouncedQ, sortierung]);

  // ── Sync filter state to URL (Volltext mode only) ─────────────────────────
  useEffect(() => {
    if (searchMode !== "volltext") return;
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
    searchMode,
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

  // ── Volltext fetch ────────────────────────────────────────────────────────
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

  // Re-fetch on filter change (Volltext only)
  useEffect(() => {
    if (searchMode === "volltext") {
      fetchResults(1, false);
    }
  }, [fetchResults, searchMode]);

  // ── KI fetch ──────────────────────────────────────────────────────────────
  const fetchKiResults = useCallback(async (imageFile?: File) => {
    const activeImage = imageFile ?? kiImage;
    if (!q.trim() && !activeImage) return;

    setKiLoading(true);
    setKiError(null);
    setNoApiKey(false);
    setKiSearched(true);

    try {
      let imageBase64: string | undefined;
      if (activeImage) {
        const buf = await activeImage.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        imageBase64 = btoa(binary);
      }

      const res = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          limit: 20,
          ...(imageBase64 ? { image: imageBase64 } : {}),
        }),
      });

      if (!res.ok) {
        let errMsg = "KI-Suche fehlgeschlagen.";
        try {
          const data = (await res.json()) as { error?: string };
          if (
            res.status === 503 ||
            data.error?.toLowerCase().includes("api-schlüssel")
          ) {
            setNoApiKey(true);
            return;
          }
          if (data.error) errMsg = data.error;
        } catch { /* ignore */ }
        throw new Error(errMsg);
      }

      const data = (await res.json()) as KiRecipe[];
      setKiResults(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unbekannter Fehler.";
      setKiError(msg);
      toast.error("KI-Suche fehlgeschlagen.");
    } finally {
      setKiLoading(false);
    }
  }, [q, kiImage]);

  // ── Zutaten fetch ─────────────────────────────────────────────────────────
  const fetchZutatenResults = useCallback(async (ings: string[]) => {
    // Abort any in-flight request before starting a new one
    zutatenAbortRef.current?.abort();

    if (ings.length === 0) {
      setZutatenResults([]);
      setZutatenTotal(0);
      setZutatenHasMore(false);
      setZutatenSearched(false);
      return;
    }

    const controller = new AbortController();
    zutatenAbortRef.current = controller;

    setZutatenLoading(true);
    setZutatenSearched(true);
    try {
      const res = await fetch("/api/recipes/ingredient-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients: ings, limit: 20, offset: 0 }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Fehler beim Suchen.");
      const data = await res.json();
      // Only apply results if this request was not superseded
      if (!controller.signal.aborted) {
        setZutatenResults(data.recipes);
        setZutatenTotal(data.total);
        setZutatenHasMore(data.hasMore);
      }
    } catch (err) {
      // Silently ignore aborted requests — a newer one is already in flight
      if (err instanceof DOMException && err.name === "AbortError") return;
      setZutatenResults([]);
      setZutatenTotal(0);
      setZutatenHasMore(false);
      toast.error("Zutaten-Suche fehlgeschlagen.");
    } finally {
      if (!controller.signal.aborted) {
        setZutatenLoading(false);
      }
    }
  }, []);

  // Re-fetch when ingredients change
  useEffect(() => {
    if (searchMode === "zutaten") {
      void fetchZutatenResults(selectedIngredients);
    }
  }, [selectedIngredients, searchMode, fetchZutatenResults]);

  // ── Active filter chips (Volltext) ────────────────────────────────────────
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

  function resetKi() {
    setKiImage(null);
    setKiResults([]);
    setKiError(null);
    setNoApiKey(false);
    setKiSearched(false);
  }

  const hasActiveFilters = activeFilters.length > 0;
  const isKiMode = searchMode === "ki";
  const isWebMode = searchMode === "web";
  const isVolltextMode = searchMode === "volltext";
  const isZutatenMode = searchMode === "zutaten";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] px-6 lg:px-10 py-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
            Suche &amp; Entdecken
          </h1>
          <div className="flex items-center gap-3">
            {/* Mode toggle */}
            <div
              role="group"
              aria-label="Suchmodus"
              className="inline-flex rounded-xl border border-[var(--border-base)] overflow-hidden bg-[var(--bg-subtle)] p-0.5"
            >
              <button
                type="button"
                onClick={() => setSearchMode("volltext")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isVolltextMode
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Volltext
              </button>
              <button
                type="button"
                data-testid="ki-suche-toggle"
                onClick={() => setSearchMode("ki")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isKiMode
                    ? "bg-terra-500 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                KI-Suche
                <span className="text-xs leading-none" aria-hidden>✨</span>
              </button>
              <button
                type="button"
                data-testid="web-suche-toggle"
                onClick={() => setSearchMode("web")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isWebMode
                    ? "bg-terra-500 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Web
                <span className="text-xs leading-none" aria-hidden>🌐</span>
              </button>
              <button
                type="button"
                data-testid="zutaten-suche-toggle"
                onClick={() => setSearchMode("zutaten")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isZutatenMode
                    ? "bg-terra-500 text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                Zutaten
              </button>
            </div>

            {isVolltextMode && (
              <span className="text-sm text-[var(--text-muted)]">
                {loading ? "Suche läuft…" : `${total} Rezept${total !== 1 ? "e" : ""}`}
              </span>
            )}
          </div>
        </div>

        {/* Search bar (not shown in Zutaten mode — ingredient input is in results) */}
        {!isZutatenMode && (
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
              placeholder={
                isKiMode
                  ? "Beschreiben Sie, was Sie kochen möchten… (Enter zum Suchen)"
                  : isWebMode
                  ? "Rezept im Web suchen…"
                  : "Rezept, Zutat oder Beschreibung suchen…"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && isKiMode) {
                  e.preventDefault();
                  void fetchKiResults();
                }
              }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm bg-[var(--bg-subtle)] border border-[var(--border-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400"
            />
          </div>

          {/* Sort (Volltext only) */}
          {isVolltextMode && (
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
          )}

          {/* KI search button */}
          {isKiMode && (
            <button
              type="button"
              onClick={() => void fetchKiResults()}
              disabled={kiLoading || (!q.trim() && !kiImage)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-terra-500 text-white hover:bg-terra-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {kiLoading ? "Sucht…" : "Suchen"}
            </button>
          )}

          {/* Mobile filter toggle (Volltext only) */}
          {isVolltextMode && (
            <button
              type="button"
              onClick={() => setShowMobileFilters((v) => !v)}
              className={`lg:hidden px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                hasActiveFilters
                  ? "border-terra-400 bg-terra-50 dark:bg-terra-950/30 text-terra-700"
                  : "border-[var(--border-base)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
              }`}
              aria-label="Filter"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M7 12h10M11 20h2" />
              </svg>
            </button>
          )}
        </div>
        )}

        {/* KI: image upload area */}
        {isKiMode && (
          <div className="mt-2">
            {kiImage ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-terra-50 dark:bg-terra-950/30 border border-terra-200 dark:border-terra-800 text-sm">
                <svg className="w-4 h-4 text-terra-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-terra-700 truncate flex-1 text-xs">{kiImage.name}</span>
                <button
                  type="button"
                  onClick={() => setKiImage(null)}
                  className="text-terra-500 hover:text-terra-700 transition-colors text-lg leading-none"
                  aria-label="Bild entfernen"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid="ki-image-upload"
                onClick={() => kiImageInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[var(--border-base)] text-sm text-[var(--text-muted)] hover:border-terra-400 hover:text-terra-600 transition-colors w-full justify-center"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Bild hochladen für visuelle Suche (optional)</span>
              </button>
            )}
            <input
              ref={kiImageInputRef}
              type="file"
              accept={ALLOWED_IMAGE_MIME.join(",")}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) {
                  toast.error("Bild darf maximal 10 MB gross sein.");
                  e.target.value = "";
                  return;
                }
                setKiImage(file);
                void fetchKiResults(file);
                // Reset input so same file can be re-selected
                e.target.value = "";
              }}
            />
          </div>
        )}

        {/* Volltext: active filter chips */}
        {isVolltextMode && hasActiveFilters && (
          <div className="flex flex-wrap gap-2 mt-2">
            {activeFilters.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-terra-100 dark:bg-terra-950/30 text-terra-700 border border-terra-200 dark:border-terra-800"
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

      {/* No API key banner */}
      {noApiKey && (
        <div className="mx-6 lg:mx-10 mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-amber-800">Kein API-Schlüssel hinterlegt</p>
            <p className="text-amber-700 mt-0.5">
              KI-Suche benötigt einen Gemini API-Schlüssel.{" "}
              <Link href="/einstellungen" className="underline font-medium hover:text-amber-900 transition-colors">
                Jetzt in den Einstellungen hinterlegen →
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Mobile filter panel (Volltext only) */}
      {isVolltextMode && showMobileFilters && (
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
        {/* Desktop sidebar (Volltext only) */}
        {isVolltextMode && (
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
        )}

        {/* Results */}
        <main className="flex-1 px-6 lg:px-8 py-6 min-w-0">
          {isZutatenMode ? (
            <ZutatenSection
              selectedIngredients={selectedIngredients}
              onIngredientsChange={setSelectedIngredients}
              results={zutatenResults}
              total={zutatenTotal}
              loading={zutatenLoading}
              searched={zutatenSearched}
            />
          ) : isWebMode ? (
            <WebSearchResults
              query={q}
              onImport={(url) => {
                setImportUrl(url);
                setShowUrlImport(true);
              }}
            />
          ) : isKiMode ? (
            <KiResults
              results={kiResults}
              loading={kiLoading}
              error={kiError}
              searched={kiSearched}
              hasImageOrQuery={!!q.trim() || !!kiImage}
              onReset={resetKi}
            />
          ) : loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-20 rounded-xl" />
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

      {/* URL import dialog — triggered from web search results */}
      <UrlImportDialog
        isOpen={showUrlImport}
        initialUrl={importUrl}
        onClose={() => {
          setShowUrlImport(false);
          setImportUrl("");
        }}
      />
    </div>
  );
}

// ── KI results section ────────────────────────────────────────────────────────

interface KiResultsProps {
  results: KiRecipe[];
  loading: boolean;
  error: string | null;
  searched: boolean;
  hasImageOrQuery: boolean;
  onReset: () => void;
}

function KiResults({ results, loading, error, searched, onReset }: KiResultsProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--text-muted)] mb-4 flex items-center gap-2">
          <span className="inline-block w-4 h-4 border-2 border-terra-400 border-t-transparent rounded-full animate-spin" />
          KI analysiert Ihre Anfrage…
        </p>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm text-[var(--text-secondary)] max-w-xs">{error}</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 text-sm text-terra-600 hover:text-terra-700 underline"
        >
          Zurücksetzen
        </button>
      </div>
    );
  }

  if (!searched) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-terra-50 dark:bg-terra-950/30 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-2">
          KI-gestützte Suche
        </h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm">
          Beschreiben Sie in natürlicher Sprache, was Sie kochen möchten — oder laden Sie ein Bild hoch, um ähnliche Rezepte zu finden.
        </p>
        <div className="mt-4 flex flex-col gap-2 text-sm text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-2">
            <span className="text-terra-400">→</span>
            &bdquo;Schnelles Abendessen mit Hühnchen und Gemüse&ldquo;
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="text-terra-400">→</span>
            &bdquo;Etwas Süsses für den Sonntagnachmittag&ldquo;
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="text-terra-400">→</span>
            &bdquo;Vegetarisch, unter 30 Minuten&ldquo;
          </span>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-1">
          Keine passenden Rezepte
        </h3>
        <p className="text-sm text-[var(--text-secondary)] max-w-xs">
          Versuchen Sie andere Begriffe oder fügen Sie zuerst Rezepte hinzu — KI-Suche benötigt gespeicherte Einbettungen.
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-4 text-sm text-terra-600 hover:text-terra-700 underline"
        >
          Suche zurücksetzen
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="text-xs text-[var(--text-muted)] mb-3">
        {results.length} semantisch ähnliche Rezept{results.length !== 1 ? "e" : ""} gefunden
      </p>
      <ul data-testid="ki-result-list" className="space-y-3">
        {results.map((recipe) => (
          <KiResultItem key={recipe.id} recipe={recipe} />
        ))}
      </ul>
    </>
  );
}

// ── KI result item ────────────────────────────────────────────────────────────

function KiResultItem({ recipe }: { recipe: KiRecipe }) {
  const timeLabel =
    recipe.total_time_minutes != null
      ? formatTime(recipe.total_time_minutes)
      : recipe.prep_time_minutes != null && recipe.cook_time_minutes != null
        ? formatTime(recipe.prep_time_minutes + recipe.cook_time_minutes)
        : null;

  // Score als Balken (0–1 → 0–100%)
  const scorePercent = Math.round(Math.min(recipe.score * 100, 100));

  return (
    <li>
      <Link
        href={`/rezepte/${recipe.id}`}
        className="group flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-terra-300 hover:shadow-warm transition-all"
      >
        {/* Relevance bar */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-1">
          <div className="w-1.5 h-12 rounded-full bg-[var(--bg-subtle)] overflow-hidden relative">
            <div
              className="w-full absolute bottom-0 rounded-full bg-terra-400 group-hover:bg-terra-500 transition-all"
              style={{ height: `${scorePercent}%` }}
            />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text-primary)] truncate group-hover:text-terra-700 transition-colors">
            {recipe.title}
          </h3>
          {recipe.description && (
            <p className="text-sm text-[var(--text-secondary)] mt-0.5 line-clamp-2">
              {recipe.description}
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

        {recipe.is_favorite && (
          <span className="flex-shrink-0 text-terra-500" aria-label="Favorit">♥</span>
        )}
      </Link>
    </li>
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
                <option key={c} value={c}>{c}</option>
              ))}
        </Select>
      </div>

      {/* Küche */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Küche
        </label>
        <Select name="kueche" value={kueche} onChange={(e) => setKueche(e.target.value)}>
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
        <Select value={zeitaufwand} onChange={(e) => setZeitaufwand(e.target.value)}>
          <option value="">Beliebig</option>
          {ZEITAUFWAND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
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

// ── Volltext result item ──────────────────────────────────────────────────────

function ResultItem({ recipe, query }: { recipe: Recipe; query: string }) {
  const timeLabel =
    recipe.totalTimeMinutes != null ? formatTime(recipe.totalTimeMinutes) : null;

  return (
    <li>
      <Link
        href={`/rezepte/${recipe.id}`}
        className="group flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-terra-300 hover:shadow-warm transition-all"
      >
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
          <span className="flex-shrink-0 text-terra-500" aria-label="Favorit">♥</span>
        )}
      </Link>
    </li>
  );
}

// ── Empty state (Volltext) ────────────────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

// ── Zutaten Section ──────────────────────────────────────────────────────────

interface ZutatenSectionProps {
  selectedIngredients: string[];
  onIngredientsChange: (ingredients: string[]) => void;
  results: ZutatenMatchResult[];
  total: number;
  loading: boolean;
  searched: boolean;
}

function ZutatenSection({
  selectedIngredients,
  onIngredientsChange,
  results,
  total,
  loading,
  searched,
}: ZutatenSectionProps) {
  const [addingToList, setAddingToList] = useState<string | null>(null);

  async function handleAddMissing(recipe: ZutatenMatchResult) {
    setAddingToList(recipe.id);
    try {
      const res = await fetch("/api/shopping-list/batch-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: recipe.id,
          availableIngredients: selectedIngredients,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(
        `${data.added} Zutat${data.added !== 1 ? "en" : ""} zur Einkaufsliste hinzugefügt${data.merged > 0 ? `, ${data.merged} zusammengeführt` : ""}`,
      );
    } catch {
      toast.error("Fehler beim Hinzufügen zur Einkaufsliste.");
    } finally {
      setAddingToList(null);
    }
  }

  return (
    <div>
      {/* Ingredient input */}
      <div className="mb-6">
        <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-3">
          Was kann ich kochen?
        </h2>
        <IngredientTagInput
          selectedIngredients={selectedIngredients}
          onIngredientsChange={onIngredientsChange}
          placeholder="Zutaten eingeben, die Sie zu Hause haben…"
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          <p className="text-sm text-[var(--text-muted)] flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-terra-400 border-t-transparent rounded-full animate-spin" />
            Rezepte werden abgeglichen…
          </p>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : !searched ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-terra-50 dark:bg-terra-950/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-terra-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-2">
            Was haben Sie im Kühlschrank?
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            Geben Sie die Zutaten ein, die Sie zu Hause haben. Wir finden Rezepte, die Sie damit kochen können.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-2">
              <span className="text-terra-400">→</span>
              Kartoffeln, Zwiebeln, Käse
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="text-terra-400">→</span>
              Poulet, Reis, Kokosmilch
            </span>
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="zutaten-empty">
          <div className="w-16 h-16 rounded-2xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-1">
            Keine passenden Rezepte
          </h3>
          <p className="text-sm text-[var(--text-secondary)] max-w-xs">
            Keines Ihrer Rezepte enthält diese Zutaten. Versuchen Sie andere Zutaten oder erstellen Sie neue Rezepte.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            {total} passende{total !== 1 ? " Rezepte" : "s Rezept"} gefunden
          </p>
          <ul data-testid="zutaten-result-list" className="space-y-3">
            {results.map((recipe) => (
              <ZutatenResultItem
                key={recipe.id}
                recipe={recipe}
                onAddMissing={() => handleAddMissing(recipe)}
                addingToList={addingToList === recipe.id}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ── Zutaten result item ──────────────────────────────────────────────────────

function ZutatenResultItem({
  recipe,
  onAddMissing,
  addingToList,
}: {
  recipe: ZutatenMatchResult;
  onAddMissing: () => void;
  addingToList: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const timeLabel =
    recipe.totalTimeMinutes != null ? formatTime(recipe.totalTimeMinutes) : null;

  return (
    <li className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-terra-300 hover:shadow-warm transition-all overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {/* Match percentage bar */}
        <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-1">
          <div className="w-1.5 h-12 rounded-full bg-[var(--bg-subtle)] overflow-hidden relative">
            <div
              className={`w-full absolute bottom-0 rounded-full transition-all ${
                recipe.matchPercentage >= 80
                  ? "bg-green-500"
                  : recipe.matchPercentage >= 50
                    ? "bg-amber-500"
                    : "bg-terra-400"
              }`}
              style={{ height: `${recipe.matchPercentage}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-[var(--text-muted)]">
            {recipe.matchPercentage}%
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <Link
            href={`/rezepte/${recipe.id}`}
            className="font-semibold text-[var(--text-primary)] truncate block hover:text-terra-700 transition-colors"
          >
            {recipe.title}
          </Link>
          {recipe.description && (
            <p className="text-sm text-[var(--text-secondary)] mt-0.5 line-clamp-1">
              {recipe.description}
            </p>
          )}

          {/* Match info */}
          <p className="text-sm mt-1.5" data-testid="match-info">
            <span className="font-medium text-[var(--text-primary)]">
              {recipe.matchedCount} von {recipe.totalIngredients}
            </span>{" "}
            <span className="text-[var(--text-muted)]">Zutaten vorhanden</span>
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
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

        <div className="flex-shrink-0 flex flex-col items-end gap-2">
          {recipe.isFavorite && (
            <span className="text-terra-500" aria-label="Favorit">♥</span>
          )}
          {recipe.missingIngredients.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="text-xs text-terra-600 hover:text-terra-700 underline transition-colors"
            >
              {showDetails ? "Weniger" : "Details"}
            </button>
          )}
        </div>
      </div>

      {/* Expandable details: matched + missing ingredients */}
      {showDetails && (
        <div className="border-t border-[var(--border-subtle)] px-4 py-3 bg-[var(--bg-subtle)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Matched */}
            {recipe.matchedIngredients.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-green-600 mb-1.5">
                  Vorhanden ({recipe.matchedIngredients.length})
                </p>
                <ul className="space-y-0.5">
                  {recipe.matchedIngredients.map((name) => (
                    <li key={name} className="flex items-center gap-1.5 text-sm text-[var(--text-primary)]">
                      <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Missing */}
            {recipe.missingIngredients.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1.5">
                  Fehlt ({recipe.missingIngredients.length})
                </p>
                <ul className="space-y-0.5">
                  {recipe.missingIngredients.map((ing) => (
                    <li key={ing.name} className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {ing.amount && ing.unit
                        ? `${ing.amount} ${ing.unit} ${ing.name}`
                        : ing.amount
                          ? `${ing.amount} ${ing.name}`
                          : ing.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Add missing to shopping list */}
          {recipe.missingIngredients.length > 0 && (
            <button
              type="button"
              data-testid="add-missing-to-list"
              onClick={onAddMissing}
              disabled={addingToList}
              className="mt-3 w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium bg-terra-500 text-white hover:bg-terra-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
              </svg>
              {addingToList ? "Wird hinzugefügt…" : `Fehlende zur Einkaufsliste (${recipe.missingIngredients.length})`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
