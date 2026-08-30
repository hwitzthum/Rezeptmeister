"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button, Modal } from "@/components/ui";
import type { PlanProposal } from "@/lib/ai/plan-candidates";

const MEAL_TYPES = [
  "fruehstueck",
  "mittagessen",
  "abendessen",
  "snack",
] as const;
const MEAL_LABELS: Record<string, string> = {
  fruehstueck: "Frühstück",
  mittagessen: "Mittagessen",
  abendessen: "Abendessen",
  snack: "Snack",
};
const DAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** ISO-Montag der angezeigten Woche. */
  weekStart: string;
  /** `${date}-${mealType}` der belegten Slots — für die Badge «wird überschrieben». */
  occupiedKeys: Set<string>;
  /** Nach erfolgreichem Übernehmen: Woche neu laden. */
  onApplied: () => void;
}

interface PlanResponse {
  proposals: PlanProposal[];
  skippedOccupied: number;
  notes: string[];
}

/**
 * KI-Wochenplan in zwei Schritten: Vorgaben → Vorschau (mit Begründung je
 * Platz, Entfernen einzelner Vorschläge) → Übernehmen über den Bulk-Endpunkt.
 * Standard: Mo–So, nur Abendessen.
 */
export default function PlanWeekDialog({
  open,
  onClose,
  weekStart,
  occupiedKeys,
  onApplied,
}: Props) {
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [mealTypes, setMealTypes] = useState<string[]>(["abendessen"]);
  const [vegetarianMin, setVegetarianMin] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState<string>("");
  const [varyCuisine, setVaryCuisine] = useState(true);
  const [useLeftovers, setUseLeftovers] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [newSuggestionsMax, setNewSuggestionsMax] = useState(0);
  const [wish, setWish] = useState("");

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setRemoved(new Set());
    }
  }, [open]);

  const monday = useMemo(() => parseISO(weekStart), [weekStart]);
  const slotCount = days.length * mealTypes.length;

  function toggleDay(d: number) {
    setDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }
  function toggleMeal(m: string) {
    setMealTypes((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  async function createPlan() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/plan-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          days,
          mealTypes,
          overwrite,
          vegetarianMin,
          maxMinutesWeekday: maxMinutes ? Number(maxMinutes) : null,
          varyCuisine,
          useLeftovers,
          newSuggestionsMax,
          wish,
        }),
      });
      const data = (await res.json()) as PlanResponse & { error?: string };
      if (!res.ok)
        throw new Error(
          data.error ?? "Wochenplan konnte nicht erstellt werden.",
        );
      setResult(data);
      setRemoved(new Set());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Wochenplan konnte nicht erstellt werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  const applicable = (result?.proposals ?? []).filter(
    (p) => p.recipeId && !removed.has(p.key),
  );
  const newOnes = (result?.proposals ?? []).filter(
    (p) => !p.recipeId && !removed.has(p.key),
  );

  async function apply() {
    if (applicable.length === 0) return;
    setApplying(true);
    try {
      const res = await fetch("/api/meal-plans/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overwrite,
          entries: applicable.map((p) => ({
            date: p.date,
            mealType: p.mealType,
            recipeId: p.recipeId,
            notes: p.leftoverOfDate
              ? `Reste vom ${format(parseISO(p.leftoverOfDate), "dd.MM.")}`
              : undefined,
          })),
        }),
      });
      const data = (await res.json()) as {
        entries?: unknown[];
        skipped?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Übernehmen fehlgeschlagen.");
      const n = data.entries?.length ?? 0;
      toast.success(
        n === 1
          ? "1 Eintrag übernommen."
          : `${n} Einträge übernommen.` +
              (data.skipped
                ? ` ${data.skipped} belegte Plätze übersprungen.`
                : ""),
      );
      onApplied();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Übernehmen fehlgeschlagen.",
      );
    } finally {
      setApplying(false);
    }
  }

  const byDate = useMemo(() => {
    const map = new Map<string, PlanProposal[]>();
    for (const p of result?.proposals ?? []) {
      if (removed.has(p.key)) continue;
      map.set(p.date, [...(map.get(p.date) ?? []), p]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [result, removed]);

  const inputCls =
    "border border-[var(--border-base)] rounded-lg px-3 py-2 text-base bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400";
  const chip = (active: boolean) =>
    [
      "px-3 py-1.5 rounded-full text-sm border transition-colors pointer-coarse:min-tap",
      active
        ? "bg-terra-500 text-white border-terra-500"
        : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-base)] hover:border-terra-300",
    ].join(" ");

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      size="lg"
      title="KI-Wochenplan"
      description={`Woche vom ${format(monday, "dd.MM.", { locale: de })} — geplant wird aus deinen eigenen Rezepten.`}
    >
      {!result ? (
        <div className="space-y-5" data-testid="plan-week-form">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Tage
            </p>
            <div className="flex flex-wrap gap-2">
              {DAY_SHORT.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={days.includes(d)}
                  className={chip(days.includes(d))}
                  data-testid={`plan-week-day-${d}`}
                >
                  {label} {format(addDays(monday, d), "d.")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-2">
              Mahlzeiten
            </p>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMeal(m)}
                  aria-pressed={mealTypes.includes(m)}
                  className={chip(mealTypes.includes(m))}
                  data-testid={`plan-week-meal-${m}`}
                >
                  {MEAL_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
              Davon vegetarisch (mindestens)
              <input
                type="number"
                min={0}
                max={slotCount}
                value={vegetarianMin}
                onChange={(e) =>
                  setVegetarianMin(
                    Math.max(
                      0,
                      Math.min(slotCount, Number(e.target.value) || 0),
                    ),
                  )
                }
                className={inputCls}
                data-testid="plan-week-vegetarian"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
              Max. Minuten unter der Woche (leer = kein Limit)
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(e.target.value)}
                placeholder="z. B. 30"
                className={inputCls}
                data-testid="plan-week-max-minutes"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-[var(--text-primary)]">
            <label className="flex items-center gap-2 pointer-coarse:min-tap">
              <input
                type="checkbox"
                checked={varyCuisine}
                onChange={(e) => setVaryCuisine(e.target.checked)}
                data-testid="plan-week-vary-cuisine"
              />
              Küchen abwechseln
            </label>
            <label className="flex items-center gap-2 pointer-coarse:min-tap">
              <input
                type="checkbox"
                checked={useLeftovers}
                onChange={(e) => setUseLeftovers(e.target.checked)}
                data-testid="plan-week-leftovers"
              />
              Reste verwerten (grosse Rezepte am Folgetag)
            </label>
            <label className="flex items-center gap-2 pointer-coarse:min-tap">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                data-testid="plan-week-overwrite"
              />
              Belegte Plätze überschreiben
            </label>
            <label className="flex items-center gap-2 pointer-coarse:min-tap">
              <input
                type="checkbox"
                checked={newSuggestionsMax > 0}
                onChange={(e) => setNewSuggestionsMax(e.target.checked ? 1 : 0)}
                data-testid="plan-week-new-toggle"
              />
              Neue Vorschläge zulassen
              {newSuggestionsMax > 0 && (
                <select
                  value={newSuggestionsMax}
                  onChange={(e) => setNewSuggestionsMax(Number(e.target.value))}
                  className="ml-1 border border-[var(--border-base)] rounded-lg px-2 py-1 text-sm bg-[var(--bg-surface)]"
                  aria-label="Anzahl neue Vorschläge"
                  data-testid="plan-week-new-max"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      bis {n}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            Wunsch (optional)
            <textarea
              rows={2}
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              maxLength={500}
              placeholder="z. B. «Freitag etwas Schnelles, am Sonntag darf es aufwendig sein»"
              className={inputCls}
              data-testid="plan-week-wish"
            />
          </label>

          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
              data-testid="plan-week-error"
            >
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)]">
              {slotCount} {slotCount === 1 ? "Platz" : "Plätze"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
              >
                Abbrechen
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void createPlan()}
                disabled={loading || slotCount === 0}
                data-testid="plan-week-submit"
              >
                {loading ? "Plan wird erstellt…" : "Plan erstellen"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="plan-week-preview">
          {result.proposals.length === 0 && (
            <p
              className="text-sm text-[var(--text-secondary)]"
              data-testid="plan-week-empty"
            >
              {result.notes[0] ?? "Keine Vorschläge."}
            </p>
          )}

          {byDate.map(([date, proposals]) => (
            <section key={date}>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">
                {format(parseISO(date), "EEEE, d. MMMM", { locale: de })}
              </h3>
              <ul className="space-y-2">
                {proposals.map((p) => (
                  <li
                    key={p.key}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 flex items-start gap-3"
                    data-testid={`plan-week-proposal-${p.key}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                        {MEAL_LABELS[p.mealType] ?? p.mealType}
                      </p>
                      <p className="font-medium text-[var(--text-primary)]">
                        {p.recipeTitle ?? p.newTitle}
                        {!p.recipeId && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gold-50 dark:bg-gold-950/30 text-gold-700 dark:text-gold-400 border border-gold-200 dark:border-gold-800">
                            Neu
                          </span>
                        )}
                        {p.isFallback && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-warm-100 dark:bg-warm-800 text-warm-600 dark:text-warm-400">
                            automatisch ergänzt
                          </span>
                        )}
                        {occupiedKeys.has(p.key) && (
                          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            wird überschrieben
                          </span>
                        )}
                      </p>
                      {p.newDescription && (
                        <p className="text-sm text-[var(--text-secondary)]">
                          {p.newDescription}
                        </p>
                      )}
                      {p.reason && (
                        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                          {p.reason}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoved((prev) => new Set(prev).add(p.key))
                      }
                      className="shrink-0 text-xs text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 pointer-coarse:min-tap px-1"
                      aria-label="Vorschlag entfernen"
                      data-testid={`plan-week-remove-${p.key}`}
                    >
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {newOnes.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              Neue Vorschläge werden nicht in den Plan geschrieben — erstelle
              sie zuerst über{" "}
              <Link
                href="/vorschlaege"
                className="underline hover:text-terra-600"
              >
                KI-Vorschläge
              </Link>
              .
            </p>
          )}
          {result.notes.length > 0 && result.proposals.length > 0 && (
            <ul
              className="text-xs text-[var(--text-muted)] list-disc pl-4"
              data-testid="plan-week-notes"
            >
              {result.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResult(null)}
              disabled={applying}
              data-testid="plan-week-back"
            >
              Zurück
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void apply()}
              disabled={applying || applicable.length === 0}
              data-testid="plan-week-apply"
            >
              {applying
                ? "Wird übernommen…"
                : `Übernehmen (${applicable.length})`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
