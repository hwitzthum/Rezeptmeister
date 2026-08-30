"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui";
import { formatDate, relativeDate, zurichDateISO } from "@/lib/format";

interface CookLog {
  id: string;
  cookedOn: string;
  servings: number | null;
  note: string | null;
}

interface Props {
  recipeId: string;
  /** Aktuell eingestellte Portionen — wird beim Eintrag mitgespeichert. */
  servings: number;
}

/**
 * Kochhistorie eines Rezepts: «Gekocht: 4× · zuletzt vor 3 Wochen», ein
 * Knopf für heute, ein Datumsfeld für Nachträge, die letzten Einträge mit
 * Rückgängig. Bewusst leichtgewichtig — das ist ein Tap am Herd, kein Formular.
 */
export default function CookLogPanel({ recipeId, servings }: Props) {
  const [logs, setLogs] = useState<CookLog[]>([]);
  const [count, setCount] = useState(0);
  const [lastCookedOn, setLastCookedOn] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [customDate, setCustomDate] = useState(() => zurichDateISO());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recipes/${recipeId}/gekocht`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        logs: CookLog[];
        count: number;
        lastCookedOn: string | null;
      };
      setLogs(data.logs);
      setCount(data.count);
      setLastCookedOn(data.lastCookedOn);
    } finally {
      setLoaded(true);
    }
  }, [recipeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addLog(cookedOn?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/gekocht`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookedOn, servings }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Eintrag fehlgeschlagen.");
      }
      toast.success(
        cookedOn
          ? "Als gekocht eingetragen."
          : "Heute als gekocht eingetragen.",
      );
      setShowDatePicker(false);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Eintrag fehlgeschlagen.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeLog(logId: string) {
    const res = await fetch(`/api/recipes/${recipeId}/gekocht/${logId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Eintrag konnte nicht entfernt werden.");
      return;
    }
    await load();
  }

  const today = zurichDateISO();

  return (
    <div data-testid="cook-log-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Kochhistorie
          </h2>
          <p
            className="text-sm text-[var(--text-muted)] mt-0.5"
            data-testid="cook-log-summary"
          >
            {!loaded
              ? "…"
              : count === 0
                ? "Noch nie gekocht"
                : `Gekocht: ${count}× · zuletzt ${relativeDate(lastCookedOn!).toLowerCase()}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={() => void addLog()}
            data-testid="cook-log-today"
          >
            {saving ? "Wird eingetragen…" : "Heute gekocht"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => setShowDatePicker((v) => !v)}
            aria-expanded={showDatePicker}
            data-testid="cook-log-other-date"
          >
            Anderes Datum…
          </Button>
        </div>
      </div>

      {showDatePicker && (
        <form
          className="flex flex-wrap items-center gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addLog(customDate);
          }}
        >
          <input
            type="date"
            value={customDate}
            max={today}
            onChange={(e) => setCustomDate(e.target.value)}
            className="border border-[var(--border-base)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400"
            aria-label="Datum, an dem gekocht wurde"
            data-testid="cook-log-date-input"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            disabled={saving || !customDate}
          >
            Eintragen
          </Button>
        </form>
      )}

      {logs.length > 0 && (
        <ul
          className="divide-y divide-[var(--border-subtle)]"
          data-testid="cook-log-list"
        >
          {logs.slice(0, 10).map((log) => (
            <li
              key={log.id}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">
                  {formatDate(`${log.cookedOn}T12:00:00`)}
                </span>
                <span className="text-[var(--text-muted)]">
                  {" "}
                  · {relativeDate(log.cookedOn)}
                </span>
                {log.servings ? (
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    · {log.servings} Portionen
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => void removeLog(log.id)}
                className="text-xs text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 pointer-coarse:min-tap px-2"
                aria-label="Eintrag entfernen"
                data-testid="cook-log-remove"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
