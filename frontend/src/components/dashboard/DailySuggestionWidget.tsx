"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface Props {
  hasApiKey: boolean;
  userId: string;
}

interface Suggestion {
  title: string;
  description: string;
  difficulty?: string;
  time_minutes?: number;
}

const CACHE_KEY_PREFIX = "rezeptmeister-daily-suggestion-";

function todayCacheKey(userId: string): string {
  // Use Europe/Zurich so the cache rotates at Swiss midnight, not UTC
  const zurichDate = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }); // YYYY-MM-DD
  return `${CACHE_KEY_PREFIX}${userId}-${zurichDate}`;
}

export default function DailySuggestionWidget({ hasApiKey, userId }: Props) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load from cache on mount
  useEffect(() => {
    if (!hasApiKey) return;
    try {
      const cached = localStorage.getItem(todayCacheKey(userId));
      if (cached) setSuggestion(JSON.parse(cached));
    } catch {
      // ignore
    }
  }, [hasApiKey, userId]);

  async function loadSuggestion() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_budget_minutes: 45 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Fehler ${res.status}`);
      }
      const data = await res.json();
      const first = data.suggestions?.[0] ?? data[0];
      if (first) {
        setSuggestion(first);
        try {
          localStorage.setItem(todayCacheKey(userId), JSON.stringify(first));
        } catch {
          // quota exceeded
        }
      } else {
        setError("Kein Vorschlag erhalten.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-gold-300/40 dark:border-gold-700/40 bg-gradient-to-br from-gold-50/80 via-[var(--bg-surface)] to-cream-100/60 dark:from-gold-950/30 dark:to-warm-900/60 p-5"
      data-testid="daily-suggestion-widget"
    >
      {/* Decorative glow */}
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gold-300/20 dark:bg-gold-700/10 blur-xl pointer-events-none" />

      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2 relative">
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gold-100 dark:bg-gold-950/30 text-gold-600 dark:text-gold-400">
          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </span>
        Rezeptvorschlag des Tages
      </h2>

      {!hasApiKey ? (
        <div className="text-sm text-[var(--text-muted)] relative" data-testid="suggestion-no-key">
          <p>
            F\u00fcr KI-Vorschl\u00e4ge wird ein API-Schl\u00fcssel ben\u00f6tigt.
          </p>
          <Link
            href="/einstellungen"
            className="inline-block mt-1 text-terra-500 hover:text-terra-600 font-medium"
          >
            Jetzt in den Einstellungen hinterlegen
          </Link>
        </div>
      ) : suggestion ? (
        <div data-testid="suggestion-content" className="relative">
          <h3 className="font-display font-semibold text-[var(--text-primary)]">{suggestion.title}</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5 line-clamp-3 leading-relaxed">
            {suggestion.description}
          </p>
          <div className="flex items-center gap-3 mt-3 text-xs text-[var(--text-muted)]">
            {suggestion.time_minutes && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-warm-100/80 dark:bg-warm-800/80">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
                ca. {suggestion.time_minutes} Min.
              </span>
            )}
            {suggestion.difficulty && (
              <span className="px-2 py-0.5 rounded-md bg-warm-100/80 dark:bg-warm-800/80">{suggestion.difficulty}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="mt-3"
            onClick={loadSuggestion}
            loading={loading}
          >
            Neuen Vorschlag laden
          </Button>
        </div>
      ) : (
        <div className="relative">
          {error && (
            <p className="text-sm text-red-600 mb-2">{error}</p>
          )}
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Lass dir von der KI ein Rezept vorschlagen.
          </p>
          <Button
            variant="gold"
            size="sm"
            onClick={loadSuggestion}
            loading={loading}
            data-testid="suggestion-load-button"
          >
            Vorschlag laden
          </Button>
        </div>
      )}
    </div>
  );
}
