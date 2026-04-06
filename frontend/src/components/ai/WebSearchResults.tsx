"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  source: string;
}

interface WebSearchResponse {
  results: WebSearchResult[];
}

interface WebSearchResultsProps {
  query?: string;
  onImport: (url: string) => void;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function WebSearchResults({
  query: initialQuery = "",
  onImport,
}: WebSearchResultsProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const res = await fetch("/api/ai/search-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Suche fehlgeschlagen.");
      }
      const data = (await res.json()) as WebSearchResponse;
      setResults(data.results ?? []);
      setSearched(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Suche fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="search"
          placeholder="Rezept im Web suchen, z.B. «Zürcher Geschnetzeltes»…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSearch();
          }}
          className="flex-1 border border-[var(--border-base)] rounded-lg px-3.5 py-2.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-terra-500 hover:border-[var(--border-strong)] transition-all"
        />
        <Button
          variant="primary"
          size="md"
          loading={loading}
          onClick={() => { void handleSearch(); }}
        >
          Suchen
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      {/* Skeleton while loading */}
      {loading && (
        <div className="space-y-3 animate-pulse">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-2"
            >
              <div className="h-4 w-3/5 rounded bg-[var(--bg-subtle)]" />
              <div className="h-3 w-1/4 rounded bg-[var(--bg-subtle)]" />
              <div className="h-3 w-full rounded bg-[var(--bg-subtle)]" />
              <div className="h-3 w-4/5 rounded bg-[var(--bg-subtle)]" />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && searched && results.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] italic text-center py-8">
          Keine Ergebnisse gefunden. Bitte andere Suchbegriffe versuchen.
        </p>
      )}

      {!loading && results.length > 0 && (
        <ul className="space-y-3">
          {results.map((result, i) => (
            <li
              key={i}
              className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 flex flex-col gap-2 hover:border-terra-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-terra-600 hover:text-terra-700 leading-snug truncate">
                    {result.title}
                  </p>
                  <span className="inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-warm-100 dark:bg-warm-800 text-warm-600 dark:text-warm-400">
                    {extractDomain(result.url)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => onImport(result.url)}
                  className="shrink-0"
                >
                  Importieren
                </Button>
              </div>
              {result.description && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                  {result.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!searched && !loading && (
        <p className="text-sm text-[var(--text-muted)] italic text-center py-8">
          Geben Sie einen Suchbegriff ein und drücken Sie «Suchen».
        </p>
      )}
    </div>
  );
}
