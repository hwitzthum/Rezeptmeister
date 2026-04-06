"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui";

// Spiegelt das OcrResult-Schema des FastAPI-Backends wider
export interface OcrIngredient {
  amount: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
}

export interface OcrResult {
  title: string;
  description: string | null;
  servings: number | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  difficulty: string | null;
  ingredients: OcrIngredient[];
  instructions: string;
  tags: string[];
  source_type: string;
}

interface Props {
  result: OcrResult;
  imageId: string;
  onSaved: (recipeId: string) => void;
  onClose: () => void;
}

export default function OcrPreviewPanel({ result, imageId, onSaved, onClose }: Props) {
  const [title, setTitle] = useState(result.title);
  const [description, setDescription] = useState(result.description ?? "");
  const [servings, setServings] = useState(result.servings ?? 4);
  const [prepTime, setPrepTime] = useState(result.prep_time_minutes ?? 0);
  const [cookTime, setCookTime] = useState(result.cook_time_minutes ?? 0);
  const [difficulty, setDifficulty] = useState(result.difficulty ?? "");
  const [instructions, setInstructions] = useState(result.instructions);
  const [saving, setSaving] = useState(false);

  const inputCls =
    "w-full border border-[var(--border-base)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400";
  const labelCls = "block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1";

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Titel ist erforderlich.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          instructions: instructions.trim(),
          servings: servings || 4,
          prepTimeMinutes: prepTime || undefined,
          cookTimeMinutes: cookTime || undefined,
          difficulty: difficulty || undefined,
          tags: result.tags,
          sourceType: "image_ocr",
          // imageId is linked atomically server-side within the same DB transaction
          imageId: imageId || undefined,
          ingredients: result.ingredients.map((ing, idx) => ({
            name: ing.name,
            amount: ing.amount ?? undefined,
            unit: ing.unit ?? undefined,
            notes: ing.notes ?? undefined,
            sortOrder: idx,
            isOptional: false,
          })),
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Fehler beim Speichern.");
      }

      const recipe = (await res.json()) as { id: string };
      toast.success("Rezept aus OCR gespeichert!");
      onSaved(recipe.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Hinweis-Banner */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        KI-extrahierte Daten. Bitte vor dem Speichern prüfen und bei Bedarf anpassen.
      </div>

      {/* Titel */}
      <div>
        <label className={labelCls}>Titel *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Beschreibung */}
      <div>
        <label className={labelCls}>Beschreibung</label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Metadaten-Reihe */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Portionen</label>
          <input
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Vorbereit. (Min.)</label>
          <input
            type="number"
            min={0}
            value={prepTime}
            onChange={(e) => setPrepTime(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Koch-/Backzeit (Min.)</label>
          <input
            type="number"
            min={0}
            value={cookTime}
            onChange={(e) => setCookTime(Number(e.target.value))}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Schwierigkeit</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className={inputCls}
          >
            <option value="">–</option>
            <option value="einfach">Einfach</option>
            <option value="mittel">Mittel</option>
            <option value="anspruchsvoll">Anspruchsvoll</option>
          </select>
        </div>
      </div>

      {/* Zutaten (Vorschau, nicht editierbar — nach dem Speichern im Rezepteditor anpassen) */}
      <div>
        <label className={labelCls}>
          Erkannte Zutaten ({result.ingredients.length})
        </label>
        <div className="max-h-40 overflow-y-auto border border-[var(--border-subtle)] rounded-lg divide-y divide-[var(--border-subtle)]">
          {result.ingredients.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] px-3 py-2">Keine Zutaten erkannt.</p>
          ) : (
            result.ingredients.map((ing, i) => (
              <div key={i} className="px-3 py-1.5 text-sm text-[var(--text-primary)]">
                {ing.amount != null ? `${ing.amount} ` : ""}
                {ing.unit ? `${ing.unit} ` : ""}
                <span className="font-medium">{ing.name}</span>
                {ing.notes ? <span className="text-[var(--text-muted)]"> ({ing.notes})</span> : null}
              </div>
            ))
          )}
        </div>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Zutaten können nach dem Speichern im Rezepteditor angepasst werden.
        </p>
      </div>

      {/* Anleitung */}
      <div>
        <label className={labelCls}>Anleitung</label>
        <textarea
          rows={6}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Tags */}
      {result.tags.length > 0 && (
        <div>
          <label className={labelCls}>Tags</label>
          <div className="flex flex-wrap gap-2">
            {result.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-terra-50 dark:bg-terra-950/30 text-terra-700 dark:text-terra-300 border border-terra-200 dark:border-terra-800"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Aktions-Buttons */}
      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
        <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
          Abbrechen
        </Button>
        <Button variant="primary" size="sm" onClick={() => { void handleSave(); }} disabled={saving}>
          {saving ? "Wird gespeichert …" : "Rezept speichern"}
        </Button>
      </div>
    </div>
  );
}
