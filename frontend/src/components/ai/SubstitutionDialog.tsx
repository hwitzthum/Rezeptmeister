"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal } from "@/components/ui";

export interface SubstitutionTarget {
  name: string;
  amount: string | null;
  unit: string | null;
}

interface Substitute {
  name: string;
  amount_hint: string;
  effect: string;
  confidence: "gut" | "brauchbar" | "notloesung";
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: SubstitutionTarget | null;
  recipeTitle: string;
  /** Alle anderen Zutaten des Rezepts — Kontext, damit der Ersatz dazu passt. */
  otherIngredients: string[];
}

const REASONS = [
  { label: "Habe ich nicht", value: "habe ich nicht", dietary: [] as string[] },
  { label: "Vegan", value: "soll vegan sein", dietary: ["Vegan"] },
  {
    label: "Laktosefrei",
    value: "soll laktosefrei sein",
    dietary: ["Laktosefrei"],
  },
  {
    label: "Glutenfrei",
    value: "soll glutenfrei sein",
    dietary: ["Glutenfrei"],
  },
];

const CONFIDENCE: Record<
  Substitute["confidence"],
  { label: string; cls: string }
> = {
  gut: {
    label: "Gut",
    cls: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
  },
  brauchbar: {
    label: "Brauchbar",
    cls: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  },
  notloesung: {
    label: "Notlösung",
    cls: "bg-warm-100 dark:bg-warm-800 text-warm-600 dark:text-warm-400 border-warm-200 dark:border-warm-700",
  },
};

/**
 * «Ersatz für Crème fraîche» — ein Grund antippen, drei Vorschläge mit Menge
 * und Auswirkung. Fehlende Zutat lässt sich direkt auf die Einkaufsliste setzen.
 */
export default function SubstitutionDialog({
  open,
  onClose,
  target,
  recipeTitle,
  otherIngredients,
}: Props) {
  const [reasonIdx, setReasonIdx] = useState(0);
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    substitutes: Substitute[];
    note: string;
  } | null>(null);

  // Bei neuer Zutat von vorn beginnen
  useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setReasonIdx(0);
      setCustomReason("");
    }
  }, [open, target?.name]);

  async function ask() {
    if (!target) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const reason = REASONS[reasonIdx];
    try {
      const res = await fetch("/api/ai/substitute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredient: target.name,
          amount: target.amount ? parseFloat(target.amount) || null : null,
          unit: target.unit ?? "",
          recipe_title: recipeTitle,
          other_ingredients: otherIngredients.filter((n) => n !== target.name),
          dietary: reason.dietary,
          reason: customReason.trim() || reason.value,
        }),
      });
      const data = (await res.json()) as {
        substitutes?: Substitute[];
        note?: string;
        error?: string;
      };
      if (!res.ok)
        throw new Error(
          data.error ?? "Ersatzvorschläge konnten nicht geladen werden.",
        );
      setResult({ substitutes: data.substitutes ?? [], note: data.note ?? "" });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ersatzvorschläge konnten nicht geladen werden.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function addToShoppingList() {
    if (!target) return;
    try {
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredientName: target.name,
          amount: target.amount ? parseFloat(target.amount) || null : null,
          unit: target.unit ?? null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`«${target.name}» auf die Einkaufsliste gesetzt.`);
    } catch {
      toast.error("Konnte nicht zur Einkaufsliste hinzugefügt werden.");
    }
  }

  const amountLabel = target
    ? [target.amount, target.unit].filter(Boolean).join(" ")
    : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="sheet"
      size="md"
      title={target ? `Ersatz für ${target.name}` : "Ersatz"}
      description={amountLabel ? `${amountLabel} ${target?.name}` : undefined}
    >
      <div className="space-y-4" data-testid="substitution-dialog">
        {!result && (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] mb-2">
                Warum?
              </p>
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r, i) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReasonIdx(i)}
                    aria-pressed={reasonIdx === i}
                    data-testid={`substitution-reason-${i}`}
                    className={[
                      "px-3 py-1.5 rounded-full text-sm border transition-colors pointer-coarse:min-tap",
                      reasonIdx === i
                        ? "bg-terra-500 text-white border-terra-500"
                        : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-base)] hover:border-terra-300",
                    ].join(" ")}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Oder eigener Grund, z. B. «Kind mag keine Zwiebeln»"
              maxLength={200}
              className="w-full border border-[var(--border-base)] rounded-lg px-3 py-2 text-base bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400"
              data-testid="substitution-custom-reason"
            />
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void addToShoppingList()}
                data-testid="substitution-shopping"
              >
                Auf die Einkaufsliste
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void ask()}
                disabled={loading}
                data-testid="substitution-ask"
              >
                {loading ? "Wird gesucht…" : "Ersatz vorschlagen"}
              </Button>
            </div>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-red-600 dark:text-red-400"
            data-testid="substitution-error"
          >
            {error}
          </p>
        )}

        {result && (
          <>
            <ul className="space-y-3" data-testid="substitution-results">
              {result.substitutes.map((s, i) => {
                const c = CONFIDENCE[s.confidence] ?? CONFIDENCE.brauchbar;
                return (
                  <li
                    key={`${s.name}-${i}`}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3"
                    data-testid="substitution-item"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold text-[var(--text-primary)]">
                        {s.name}
                        {s.amount_hint && (
                          <span className="ml-2 font-normal text-terra-600 dark:text-terra-400">
                            {s.amount_hint}
                          </span>
                        )}
                      </p>
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${c.cls}`}
                      >
                        {c.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {s.effect}
                    </p>
                  </li>
                );
              })}
            </ul>
            {result.note && (
              <p
                className="text-sm text-[var(--text-muted)] italic"
                data-testid="substitution-note"
              >
                {result.note}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void addToShoppingList()}
              >
                Original auf die Einkaufsliste
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setResult(null)}
              >
                Anderer Grund
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>
                Fertig
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
