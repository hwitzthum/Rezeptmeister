"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

interface ScalingHintsPanelProps {
  ingredients: { name: string; amount: number | null; unit: string }[];
  instructions: string;
  originalServings: number;
  targetServings: number;
}

interface ScaleRecipeResponse {
  hints: string[];
  general_notes?: string;
}

export default function ScalingHintsPanel({
  ingredients,
  instructions,
  originalServings,
  targetServings,
}: ScalingHintsPanelProps) {
  const factor = originalServings > 0 ? targetServings / originalServings : 1;
  const shouldShow = factor > 2 || factor < 0.5;

  const [hints, setHints] = useState<string[]>([]);
  const [generalNote, setGeneralNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  // Reset hints when the scaling ratio changes significantly (new fetch needed)
  // We track the factor at which hints were fetched
  const [fetchedFactor, setFetchedFactor] = useState<number | null>(null);
  const hintsStale = fetchedFactor !== null && Math.abs(fetchedFactor - factor) > 0.01;

  if (!shouldShow) return null;

  async function handleFetchHints() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/scale-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients,
          instructions,
          original_servings: originalServings,
          target_servings: targetServings,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Fehler beim Abrufen der Hinweise.");
      }
      const data = (await res.json()) as ScaleRecipeResponse;
      setHints(data.hints ?? []);
      setGeneralNote(data.general_notes ?? null);
      setFetched(true);
      setFetchedFactor(factor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Abrufen der Hinweise.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 mb-1">
      {(!fetched || hintsStale) && (
        <Button
          variant="secondary"
          size="xs"
          fullWidth
          loading={loading}
          icon={<InfoIcon />}
          onClick={() => { void handleFetchHints(); }}
        >
          Hinweise zur Skalierung
        </Button>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-2" role="alert">
          {error}
        </p>
      )}

      {fetched && !hintsStale && (hints.length > 0 || generalNote) && (
        <div className="mt-2 space-y-2">
          {generalNote && (
            <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <span className="shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
              <p>{generalNote}</p>
            </div>
          )}
          {hints.map((h, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
            >
              <span className="shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
              <p>{h}</p>
            </div>
          ))}
          <button
            onClick={() => {
              setFetched(false);
              setHints([]);
              setGeneralNote(null);
              setFetchedFactor(null);
            }}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Hinweise ausblenden
          </button>
        </div>
      )}

      {fetched && !hintsStale && hints.length === 0 && !generalNote && (
        <p className="text-xs text-[var(--text-muted)] mt-2 italic">
          Keine speziellen Hinweise für diese Skalierung.
        </p>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      />
    </svg>
  );
}
