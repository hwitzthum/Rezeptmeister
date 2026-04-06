"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { parseSteps } from "@/lib/cooking/parse-steps";
import { parseTimers, type TimerMatch } from "@/lib/cooking/parse-timers";
import { useSwipe } from "@/lib/cooking/use-swipe";
import { formatAmount } from "@/lib/units";
import type { RecipeDetail } from "./RecipeDetailClient";

// ── Types ────────────────────────────────────────────────────────────────────

interface CookingModeProps {
  recipe: RecipeDetail;
  targetServings?: number;
}

interface ActiveTimer {
  remaining: number; // Sekunden
  total: number;
  isRunning: boolean;
}

// ── Beep via Web Audio API ───────────────────────────────────────────────────

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    // Zweiter Beep nach kurzer Pause
    const osc2 = ctx.createOscillator();
    osc2.connect(gain);
    osc2.frequency.value = 1100;
    osc2.start(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.7);
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Audio nicht verfügbar — stille Degradation
  }
}

// ── Formatierung ─────────────────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export default function CookingMode({ recipe, targetServings }: CookingModeProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const servings = targetServings ?? recipe.servings;
  const steps = parseSteps(recipe.instructions);
  const totalSteps = steps.length;

  const [currentStep, setCurrentStep] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [timers, setTimers] = useState<Map<string, ActiveTimer>>(new Map());
  const [timerFlash, setTimerFlash] = useState<string | null>(null);

  const intervalRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── Wake Lock ────────────────────────────────────────────────────────────

  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          sentinel = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock nicht verfügbar oder abgelehnt
      }
    }

    void requestWakeLock();

    // Reacquire nach Visibility-Wechsel (z.B. Tab-Wechsel)
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void sentinel?.release();
    };
  }, []);

  // ── Timer-Tick ───────────────────────────────────────────────────────────

  // Cleanup aller Intervalle bei Unmount
  useEffect(() => {
    const refs = intervalRefs.current;
    return () => {
      refs.forEach((id) => clearInterval(id));
      refs.clear();
    };
  }, []);

  const startTimer = useCallback((key: string, minutes: number) => {
    // Wenn bereits läuft, Timer resetten
    const existing = intervalRefs.current.get(key);
    if (existing) clearInterval(existing);

    const totalSeconds = minutes * 60;
    setTimers((prev) => {
      const next = new Map(prev);
      next.set(key, { remaining: totalSeconds, total: totalSeconds, isRunning: true });
      return next;
    });

    const id = setInterval(() => {
      setTimers((prev) => {
        const next = new Map(prev);
        const timer = next.get(key);
        if (!timer || !timer.isRunning) return prev;

        const remaining = timer.remaining - 1;
        if (remaining <= 0) {
          clearInterval(intervalRefs.current.get(key)!);
          intervalRefs.current.delete(key);
          next.set(key, { ...timer, remaining: 0, isRunning: false });
          playBeep();
          setTimerFlash(key);
          setTimeout(() => setTimerFlash(null), 2000);
          return next;
        }

        next.set(key, { ...timer, remaining });
        return next;
      });
    }, 1000);

    intervalRefs.current.set(key, id);
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    setCurrentStep((v) => Math.min(totalSteps - 1, v + 1));
  }, [totalSteps]);

  const goPrev = useCallback(() => {
    setCurrentStep((v) => Math.max(0, v - 1));
  }, []);

  const exit = useCallback(() => {
    router.push(`/rezepte/${recipe.id}`);
  }, [router, recipe.id]);

  // Swipe-Gesten
  useSwipe(containerRef, {
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
  });

  // Tastatur-Navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        exit();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, exit]);

  // ── Skalierte Zutaten ────────────────────────────────────────────────────

  function scaledAmount(amountStr: string | null): string {
    if (!amountStr) return "";
    const n = parseFloat(amountStr);
    if (isNaN(n)) return amountStr;
    return formatAmount((n * servings) / recipe.servings);
  }

  // ── Timer-Rendering im Schritt-Text ──────────────────────────────────────

  function renderStepWithTimers(text: string, stepIndex: number): ReactNode {
    const timerMatches = parseTimers(text);
    if (timerMatches.length === 0) return text;

    const parts: ReactNode[] = [];
    let lastEnd = 0;

    timerMatches.forEach((tm: TimerMatch, i: number) => {
      const key = `${stepIndex}-${i}`;
      const activeTimer = timers.get(key);

      // Text vor dem Timer
      if (tm.startIndex > lastEnd) {
        parts.push(text.slice(lastEnd, tm.startIndex));
      }

      // Timer-Button
      parts.push(
        <button
          key={key}
          onClick={() => startTimer(key, tm.minutes)}
          data-testid={`timer-button-${stepIndex}-${i}`}
          className={[
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full",
            "font-semibold text-sm transition-all duration-200",
            activeTimer?.isRunning
              ? "bg-terra-500 text-white animate-pulse"
              : activeTimer && !activeTimer.isRunning && activeTimer.remaining === 0
                ? timerFlash === key
                  ? "bg-gold-500 text-white ring-2 ring-gold-300 scale-110"
                  : "bg-green-500 text-white"
                : "bg-terra-100 dark:bg-terra-900/40 text-terra-700 dark:text-terra-300 hover:bg-terra-200 dark:hover:bg-terra-800/40 border border-terra-300 dark:border-terra-700",
          ].join(" ")}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
          {activeTimer?.isRunning
            ? formatCountdown(activeTimer.remaining)
            : activeTimer && activeTimer.remaining === 0
              ? "Fertig!"
              : tm.label}
        </button>,
      );

      lastEnd = tm.endIndex;
    });

    // Restlicher Text
    if (lastEnd < text.length) {
      parts.push(text.slice(lastEnd));
    }

    return parts;
  }

  // ── Aktive Timer (laufen im Hintergrund) ─────────────────────────────────

  const runningTimers = Array.from(timers.entries()).filter(
    ([, t]) => t.isRunning,
  );

  // ── Render ───────────────────────────────────────────────────────────────

  if (totalSteps === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-[var(--text-secondary)]">
            Keine Zubereitungsschritte vorhanden.
          </p>
          <button
            onClick={exit}
            className="mt-4 px-6 py-2 bg-terra-500 text-white rounded-xl hover:bg-terra-600 transition-colors"
          >
            Zurück zum Rezept
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-[var(--bg-base)] flex flex-col select-none"
      data-testid="cooking-mode"
    >
      {/* ── Obere Leiste ──────────────────────────────────────────────── */}
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <h1
            className="text-base sm:text-lg font-semibold text-[var(--text-primary)] truncate flex-1 mr-4"
          >
            {recipe.title}
          </h1>

          <div className="flex items-center gap-3">
            <span
              className="text-sm font-medium text-[var(--text-secondary)]"
              data-testid="step-counter"
            >
              Schritt {currentStep + 1} von {totalSteps}
            </span>

            <button
              onClick={() => setShowIngredients(true)}
              className="w-9 h-9 rounded-xl border border-[var(--border-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
              aria-label="Zutaten anzeigen"
              data-testid="show-ingredients-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </button>

            <button
              onClick={exit}
              className="px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:text-terra-600 border border-[var(--border-base)] rounded-xl hover:bg-[var(--bg-subtle)] transition-colors"
              data-testid="exit-cooking-mode"
            >
              Beenden
            </button>
          </div>
        </div>
      </header>

      {/* ── Laufende Timer (global sichtbar) ──────────────────────────── */}
      {runningTimers.length > 0 && (
        <div className="shrink-0 px-4 py-2 bg-terra-50 dark:bg-terra-950/30 border-b border-terra-200 dark:border-terra-800">
          <div className="flex items-center gap-3 max-w-3xl mx-auto overflow-x-auto">
            <svg className="w-4 h-4 text-terra-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            {runningTimers.map(([key, timer]) => (
              <span
                key={key}
                className="px-2 py-0.5 bg-terra-500 text-white text-sm font-mono rounded-lg animate-pulse"
              >
                {formatCountdown(timer.remaining)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Schritt-Inhalt ────────────────────────────────────────────── */}
      <main
        className="flex-1 overflow-y-auto px-6 sm:px-8 py-8 flex items-start justify-center"
        aria-live="polite"
      >
        <div className="max-w-2xl w-full">
          <div className="mb-4">
            <span
              className="text-4xl sm:text-5xl font-bold text-terra-200 font-display"
            >
              {currentStep + 1}
            </span>
          </div>
          <p
            className="text-lg sm:text-xl leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap"
            data-testid="step-text"
            style={{ minHeight: "4rem" }}
          >
            {renderStepWithTimers(steps[currentStep], currentStep)}
          </p>
        </div>
      </main>

      {/* ── Untere Navigation ─────────────────────────────────────────── */}
      <footer className="shrink-0 px-4 sm:px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={goPrev}
            disabled={currentStep === 0}
            className="px-5 py-2.5 text-sm font-medium rounded-xl border border-[var(--border-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="prev-step"
          >
            Zurück
          </button>

          {/* Fortschritts-Punkte */}
          <div className="flex items-center gap-1.5" data-testid="step-dots">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                aria-label={`Schritt ${i + 1}`}
                className={[
                  "rounded-full transition-all duration-200",
                  i === currentStep
                    ? "w-3 h-3 bg-terra-500"
                    : i < currentStep
                      ? "w-2 h-2 bg-terra-300"
                      : "w-2 h-2 bg-warm-200 dark:bg-warm-700",
                ].join(" ")}
              />
            ))}
          </div>

          <button
            onClick={currentStep === totalSteps - 1 ? exit : goNext}
            className={[
              "px-5 py-2.5 text-sm font-medium rounded-xl transition-colors",
              currentStep === totalSteps - 1
                ? "bg-green-600 text-white hover:bg-green-700"
                : "bg-terra-500 text-white hover:bg-terra-600",
            ].join(" ")}
            data-testid="next-step"
          >
            {currentStep === totalSteps - 1 ? "Fertig" : "Weiter"}
          </button>
        </div>
      </footer>

      {/* ── Zutaten-Overlay ───────────────────────────────────────────── */}
      {showIngredients && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowIngredients(false)}
          />

          {/* Panel */}
          <div
            className="fixed right-0 top-0 bottom-0 z-50 w-80 sm:w-96 bg-[var(--bg-surface)] shadow-2xl border-l border-[var(--border-subtle)] overflow-y-auto animate-slide-in-right"
            data-testid="ingredients-overlay"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-lg font-semibold text-[var(--text-primary)]"
                >
                  Zutaten
                </h2>
                <button
                  onClick={() => setShowIngredients(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
                  aria-label="Zutaten schliessen"
                  data-testid="close-ingredients"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="text-sm text-[var(--text-secondary)] mb-4 pb-3 border-b border-[var(--border-subtle)]">
                {servings} {servings === 1 ? "Portion" : "Portionen"}
              </div>

              <ul className="space-y-3">
                {recipe.ingredients.map((ing) => {
                  const amount = scaledAmount(ing.amount);
                  return (
                    <li
                      key={ing.id}
                      className="flex items-baseline gap-3"
                    >
                      <span className="text-2xl font-semibold text-terra-600 w-20 shrink-0 text-right tabular-nums">
                        {amount}
                        {ing.unit && (
                          <span className="text-base font-normal ml-0.5">
                            {ing.unit}
                          </span>
                        )}
                      </span>
                      <span className="text-lg text-[var(--text-primary)]">
                        {ing.name}
                        {ing.isOptional && (
                          <span className="ml-1 text-sm text-[var(--text-muted)]">
                            (optional)
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
