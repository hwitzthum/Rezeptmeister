"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui";
import OcrPreviewPanel, { type OcrResult } from "./OcrPreviewPanel";

interface Props {
  recipes: OcrResult[];
  imageId: string;
  onAllDone: (savedIds: string[]) => void;
  onRecipeSaved: (recipeId: string, index: number) => void;
}

export default function OcrMultiPreview({ recipes, imageId, onAllDone, onRecipeSaved }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [savedIds, setSavedIds] = useState<Map<number, string>>(new Map());
  const [skipped, setSkipped] = useState<Set<number>>(new Set());

  // Single recipe → render OcrPreviewPanel directly without carousel chrome
  if (recipes.length === 1) {
    return (
      <OcrPreviewPanel
        result={recipes[0]}
        imageId={imageId}
        onSaved={(recipeId) => {
          onRecipeSaved(recipeId, 0);
          onAllDone([recipeId]);
        }}
        onClose={() => onAllDone([])}
      />
    );
  }

  const total = recipes.length;
  const allHandled = savedIds.size + skipped.size >= total;

  const advanceToNext = useCallback(
    (currentSaved: Map<number, string>, currentSkipped: Set<number>) => {
      for (let offset = 1; offset < total; offset++) {
        const next = (currentIndex + offset) % total;
        if (!currentSaved.has(next) && !currentSkipped.has(next)) {
          setCurrentIndex(next);
          return;
        }
      }
    },
    [currentIndex, total],
  );

  function handleSaved(recipeId: string) {
    const next = new Map(savedIds);
    next.set(currentIndex, recipeId);
    setSavedIds(next);
    onRecipeSaved(recipeId, currentIndex);
    advanceToNext(next, skipped);
  }

  function handleSkip() {
    const next = new Set(skipped);
    next.add(currentIndex);
    setSkipped(next);
    advanceToNext(savedIds, next);
  }

  function handleFinish() {
    onAllDone(Array.from(savedIds.values()));
  }

  return (
    <div className="space-y-4">
      {/* Navigation header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => (i - 1 + total) % total)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-500 hover:text-warm-700 hover:bg-warm-100 dark:text-warm-400 dark:hover:text-warm-200 dark:hover:bg-warm-800 transition-all"
          aria-label="Vorheriges Rezept"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-sm font-medium text-[var(--text-primary)]">
          Rezept {currentIndex + 1} von {total}
          {savedIds.has(currentIndex) && (
            <span className="ml-2 text-xs text-green-600 dark:text-green-400">Gespeichert</span>
          )}
          {skipped.has(currentIndex) && (
            <span className="ml-2 text-xs text-warm-400">Übersprungen</span>
          )}
        </span>

        <button
          type="button"
          onClick={() => setCurrentIndex((i) => (i + 1) % total)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-500 hover:text-warm-700 hover:bg-warm-100 dark:text-warm-400 dark:hover:text-warm-200 dark:hover:bg-warm-800 transition-all"
          aria-label="Nächstes Rezept"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5">
        {recipes.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setCurrentIndex(i)}
            className={[
              "w-2.5 h-2.5 rounded-full transition-all",
              savedIds.has(i)
                ? "bg-terra-500"
                : i === currentIndex
                  ? "bg-amber-400 scale-125"
                  : skipped.has(i)
                    ? "bg-warm-300 dark:bg-warm-600"
                    : "bg-warm-200 dark:bg-warm-700",
            ].join(" ")}
            aria-label={`Rezept ${i + 1}`}
          />
        ))}
      </div>

      {/* Current recipe preview */}
      {savedIds.has(currentIndex) ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="w-12 h-12 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            &laquo;{recipes[currentIndex].title}&raquo; wurde gespeichert
          </p>
        </div>
      ) : skipped.has(currentIndex) ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            Dieses Rezept wurde übersprungen.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = new Set(skipped);
              next.delete(currentIndex);
              setSkipped(next);
            }}
          >
            Doch speichern
          </Button>
        </div>
      ) : (
        <OcrPreviewPanel
          key={currentIndex}
          result={recipes[currentIndex]}
          imageId={currentIndex === 0 ? imageId : ""}
          onSaved={handleSaved}
          onClose={handleSkip}
        />
      )}

      {/* Footer: Fertig button */}
      {allHandled && (
        <div className="flex justify-center pt-2 border-t border-[var(--border-subtle)]">
          <Button variant="primary" size="sm" onClick={handleFinish}>
            Fertig — {savedIds.size} Rezept{savedIds.size !== 1 ? "e" : ""} gespeichert
          </Button>
        </div>
      )}
    </div>
  );
}
