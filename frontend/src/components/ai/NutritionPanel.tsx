"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

interface NutritionData {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  confidence: string;
  label: string;
}

interface NutritionPanelProps {
  recipeId: string;
  ingredients: { name: string; amount: number | null; unit: string }[];
  servings: number;
  initialNutrition?: NutritionData | null;
}

const inputCls =
  "w-full border border-[var(--border-base)] rounded-lg px-2.5 py-1.5 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400";

export default function NutritionPanel({
  recipeId,
  ingredients,
  servings,
  initialNutrition,
}: NutritionPanelProps) {
  const [nutrition, setNutrition] = useState<NutritionData | null>(
    initialNutrition ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit draft state
  const [draftKcal, setDraftKcal] = useState(0);
  const [draftProtein, setDraftProtein] = useState(0);
  const [draftFat, setDraftFat] = useState(0);
  const [draftCarbs, setDraftCarbs] = useState(0);
  const [draftFiber, setDraftFiber] = useState(0);

  function startEdit() {
    if (!nutrition) return;
    setDraftKcal(nutrition.kcal);
    setDraftProtein(nutrition.protein_g);
    setDraftFat(nutrition.fat_g);
    setDraftCarbs(nutrition.carbs_g);
    setDraftFiber(nutrition.fiber_g);
    setEditing(true);
  }

  async function handleCalculate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, ingredients, servings }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Fehler bei der Berechnung.");
      }
      const data = (await res.json()) as { per_serving: NutritionData; label: string };
      setNutrition({ ...data.per_serving, label: data.label });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler bei der Berechnung.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${recipeId}/nutrition`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nutritionInfo: {
            kcal: draftKcal,
            protein_g: draftProtein,
            fat_g: draftFat,
            carbs_g: draftCarbs,
            fiber_g: draftFiber,
            confidence: nutrition?.confidence ?? "ca.",
            label: `ca. ${draftKcal} kcal`,
          },
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Speichern.");
      setNutrition((prev) =>
        prev
          ? {
              ...prev,
              kcal: draftKcal,
              protein_g: draftProtein,
              fat_g: draftFat,
              carbs_g: draftCarbs,
              fiber_g: draftFiber,
            }
          : prev,
      );
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fehler beim Speichern.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Nährwerte pro Portion
        </h3>
        {nutrition && !editing && (
          <button
            onClick={startEdit}
            aria-label="Nährwerte bearbeiten"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-warm-400 hover:text-terra-600 hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <EditIcon />
          </button>
        )}
      </div>

      {nutrition && !editing && (
        <div className="grid grid-cols-5 gap-1 text-center">
          <NutrientCell label="kcal" value={`ca. ${Math.round(nutrition.kcal)}`} large />
          <NutrientCell label="Protein" value={`ca. ${Math.round(nutrition.protein_g)}g`} />
          <NutrientCell label="Fett" value={`ca. ${Math.round(nutrition.fat_g)}g`} />
          <NutrientCell label="Kohlenhydr." value={`ca. ${Math.round(nutrition.carbs_g)}g`} />
          <NutrientCell label="Ballaststoffe" value={`ca. ${Math.round(nutrition.fiber_g)}g`} />
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">kcal</label>
              <input
                type="number"
                min={0}
                value={draftKcal}
                onChange={(e) => setDraftKcal(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Protein (g)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={draftProtein}
                onChange={(e) => setDraftProtein(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Fett (g)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={draftFat}
                onChange={(e) => setDraftFat(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Kohlenhydrate (g)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={draftCarbs}
                onChange={(e) => setDraftCarbs(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1">Ballaststoffe (g)</label>
              <input
                type="number"
                min={0}
                step={0.1}
                value={draftFiber}
                onChange={(e) => setDraftFiber(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="xs"
              loading={saving}
              onClick={() => { void handleSave(); }}
            >
              Speichern
            </Button>
          </div>
        </div>
      )}

      {!nutrition && !loading && (
        <Button
          variant="secondary"
          size="xs"
          fullWidth
          onClick={() => { void handleCalculate(); }}
        >
          Berechnen
        </Button>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <SpinnerIcon />
          Berechne Nährwerte…
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function NutrientCell({
  label,
  value,
  large,
}: {
  label: string;
  value: string;
  large?: boolean;
}) {
  return (
    <div className="flex flex-col items-center bg-[var(--bg-subtle)] rounded-lg px-1 py-2">
      <span
        className={[
          "font-semibold text-[var(--text-primary)] leading-tight",
          large ? "text-sm" : "text-xs",
        ].join(" ")}
      >
        {value}
      </span>
      <span className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-tight text-center">
        {label}
      </span>
    </div>
  );
}

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
