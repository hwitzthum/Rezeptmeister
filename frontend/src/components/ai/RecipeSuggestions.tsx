"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button, ConfirmDialog } from "@/components/ui";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SuggestionItem {
  title: string;
  description: string;
  time_estimate_minutes: number;
  difficulty: "einfach" | "mittel" | "anspruchsvoll";
}

interface SuggestionsResponse {
  suggestions: SuggestionItem[];
  tokens_used?: number;
}

interface OcrIngredient {
  amount: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
}

interface GeneratedRecipe {
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
  category?: string | null;
  cuisine?: string | null;
}


interface ConstraintForm {
  ingredients: string[];
  ingredientInput: string;
  cuisine: string;
  timeBudget: number;
  vegetarian: boolean;
  vegan: boolean;
  glutenFree: boolean;
  lactoseFree: boolean;
  season: string;
}

const CUISINE_OPTIONS = [
  { value: "", label: "Keine Präferenz" },
  { value: "Schweizer", label: "Schweizer" },
  { value: "Italienisch", label: "Italienisch" },
  { value: "Französisch", label: "Französisch" },
  { value: "Asiatisch", label: "Asiatisch" },
  { value: "Mediterran", label: "Mediterran" },
  { value: "Deutsch", label: "Deutsch" },
  { value: "Mexikanisch", label: "Mexikanisch" },
  { value: "Indisch", label: "Indisch" },
  { value: "Griechisch", label: "Griechisch" },
];

const SEASON_OPTIONS = [
  { value: "", label: "Keine Präferenz" },
  { value: "Frühling", label: "Frühling" },
  { value: "Sommer", label: "Sommer" },
  { value: "Herbst", label: "Herbst" },
  { value: "Winter", label: "Winter" },
];

const DIFFICULTY_LABELS: Record<string, string> = {
  einfach: "Einfach",
  mittel: "Mittel",
  anspruchsvoll: "Anspruchsvoll",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  einfach: "bg-green-100 text-green-700",
  mittel: "bg-amber-100 text-amber-700",
  anspruchsvoll: "bg-red-100 text-red-700",
};

const selectCls =
  "w-full border border-[var(--border-base)] rounded-lg px-3 py-2 text-sm bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400 transition-all";

const labelCls = "block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1.5";

// ── Main component ─────────────────────────────────────────────────────────────

export default function RecipeSuggestions() {
  const router = useRouter();

  const [form, setForm] = useState<ConstraintForm>({
    ingredients: [],
    ingredientInput: "",
    cuisine: "",
    timeBudget: 60,
    vegetarian: false,
    vegan: false,
    glutenFree: false,
    lactoseFree: false,
    season: "",
  });

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);

  const [selectedSuggestion, setSelectedSuggestion] = useState<SuggestionItem | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [generatingRecipe, setGeneratingRecipe] = useState(false);

  // ── Ingredient tag helpers ──────────────────────────────────────────────────

  function addIngredient(value: string) {
    const trimmed = value.trim();
    if (!trimmed || form.ingredients.includes(trimmed)) return;
    setForm((f) => ({ ...f, ingredients: [...f.ingredients, trimmed], ingredientInput: "" }));
  }

  function removeIngredient(ing: string) {
    setForm((f) => ({ ...f, ingredients: f.ingredients.filter((i) => i !== ing) }));
  }

  function handleIngredientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addIngredient(form.ingredientInput);
    } else if (e.key === "Backspace" && !form.ingredientInput && form.ingredients.length > 0) {
      setForm((f) => ({ ...f, ingredients: f.ingredients.slice(0, -1) }));
    }
  }

  // ── API calls ───────────────────────────────────────────────────────────────

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const dietaryRestrictions: string[] = [];
      if (form.vegetarian) dietaryRestrictions.push("Vegetarisch");
      if (form.vegan) dietaryRestrictions.push("Vegan");
      if (form.glutenFree) dietaryRestrictions.push("Glutenfrei");
      if (form.lactoseFree) dietaryRestrictions.push("Laktosefrei");

      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients: form.ingredients,
          cuisine: form.cuisine || undefined,
          time_budget_minutes: form.timeBudget,
          dietary: dietaryRestrictions,
          season: form.season || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Fehler beim Laden der Vorschläge.");
      }
      const data = (await res.json()) as SuggestionsResponse;
      setSuggestions(data.suggestions ?? []);
      setTokensUsed(data.tokens_used ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden der Vorschläge.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateRecipe() {
    if (!selectedSuggestion) return;
    setGeneratingRecipe(true);
    setShowConfirm(false);
    try {
      const dietaryRestrictions: string[] = [];
      if (form.vegetarian) dietaryRestrictions.push("Vegetarisch");
      if (form.vegan) dietaryRestrictions.push("Vegan");
      if (form.glutenFree) dietaryRestrictions.push("Glutenfrei");
      if (form.lactoseFree) dietaryRestrictions.push("Laktosefrei");

      // Step 1: Generate full recipe from suggestion
      const res = await fetch("/api/ai/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestion_title: selectedSuggestion.title,
          suggestion_description: selectedSuggestion.description,
          cuisine: form.cuisine || "",
          dietary: dietaryRestrictions,
          servings: 4,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Fehler beim Generieren des Rezepts.");
      }
      const generated = (await res.json()) as GeneratedRecipe;

      // Step 2: Save to database
      const saveRes = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: generated.title,
          description: generated.description ?? undefined,
          instructions: generated.instructions,
          servings: generated.servings ?? 4,
          prepTimeMinutes: generated.prep_time_minutes ?? undefined,
          cookTimeMinutes: generated.cook_time_minutes ?? undefined,
          difficulty: generated.difficulty ?? undefined,
          category: generated.category ?? undefined,
          cuisine: generated.cuisine ?? undefined,
          tags: generated.tags,
          sourceType: "ai_generated",
          ingredients: generated.ingredients.map((ing, idx) => ({
            name: ing.name,
            amount: ing.amount ?? undefined,
            unit: ing.unit ?? undefined,
            notes: ing.notes ?? undefined,
            sortOrder: idx,
            isOptional: false,
          })),
        }),
      });
      if (!saveRes.ok) {
        const data = (await saveRes.json()) as { error?: string };
        throw new Error(data.error ?? "Fehler beim Speichern des Rezepts.");
      }
      const saved = (await saveRes.json()) as { id: string };
      router.push(`/rezepte/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Generieren des Rezepts.");
      setGeneratingRecipe(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* ── Left: Constraint form ─────────────────────────────────────────── */}
      <aside className="lg:w-72 xl:w-80 shrink-0">
        <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm p-5 space-y-5">
          {/* Zutaten */}
          <div>
            <label className={labelCls}>Verfügbare Zutaten</label>
            <div className="border border-[var(--border-base)] rounded-lg p-2 min-h-[44px] flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-terra-400 focus-within:border-terra-400 transition-all bg-[var(--bg-surface)]">
              {form.ingredients.map((ing) => (
                <span
                  key={ing}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-terra-50 text-terra-700 border border-terra-200"
                >
                  {ing}
                  <button
                    type="button"
                    onClick={() => removeIngredient(ing)}
                    aria-label={`${ing} entfernen`}
                    className="hover:text-terra-900 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={form.ingredients.length === 0 ? "Zutat eingeben, Enter drücken…" : ""}
                value={form.ingredientInput}
                onChange={(e) => setForm((f) => ({ ...f, ingredientInput: e.target.value }))}
                onKeyDown={handleIngredientKeyDown}
                onBlur={() => { if (form.ingredientInput.trim()) addIngredient(form.ingredientInput); }}
                className="flex-1 min-w-[120px] text-sm text-[var(--text-primary)] bg-transparent outline-none placeholder:text-warm-400"
              />
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Enter oder Komma zum Hinzufügen
            </p>
          </div>

          {/* Küche */}
          <div>
            <label className={labelCls}>Küche</label>
            <select
              value={form.cuisine}
              onChange={(e) => setForm((f) => ({ ...f, cuisine: e.target.value }))}
              className={selectCls}
            >
              {CUISINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Zeitbudget */}
          <div>
            <label className={labelCls}>
              Zeitbudget: {form.timeBudget} Minuten
            </label>
            <input
              type="range"
              min={15}
              max={120}
              step={5}
              value={form.timeBudget}
              onChange={(e) => setForm((f) => ({ ...f, timeBudget: Number(e.target.value) }))}
              className="w-full accent-terra-500"
            />
            <div className="flex justify-between text-xs text-[var(--text-muted)] mt-0.5">
              <span>15 Min.</span>
              <span>120 Min.</span>
            </div>
          </div>

          {/* Ernährungsform */}
          <div>
            <label className={labelCls}>Ernährungsform</label>
            <div className="space-y-2">
              {[
                { key: "vegetarian" as const, label: "Vegetarisch" },
                { key: "vegan" as const, label: "Vegan" },
                { key: "glutenFree" as const, label: "Glutenfrei" },
                { key: "lactoseFree" as const, label: "Laktosefrei" },
              ].map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="w-4 h-4 rounded border-[var(--border-base)] text-terra-500 accent-terra-500 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--text-primary)] group-hover:text-terra-600 transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Jahreszeit */}
          <div>
            <label className={labelCls}>Jahreszeit</label>
            <select
              value={form.season}
              onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}
              className={selectCls}
            >
              {SEASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="space-y-2 pt-1">
            <Button
              variant="primary"
              size="md"
              fullWidth
              loading={loading}
              icon={<Sparkles className="w-4 h-4" />}
              onClick={() => { void fetchSuggestions(); }}
            >
              Vorschläge generieren
            </Button>
            {suggestions.length > 0 && (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                loading={loading}
                onClick={() => { void fetchSuggestions(); }}
              >
                Regenerieren
              </Button>
            )}
          </div>

          {tokensUsed !== null && (
            <p className="text-xs text-[var(--text-muted)] text-center">
              Token verbraucht: {tokensUsed.toLocaleString("de-CH")}
            </p>
          )}
        </div>
      </aside>

      {/* ── Right: Suggestion cards ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="grid gap-4 sm:grid-cols-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="animate-pulse bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 space-y-3"
              >
                <div className="h-5 w-2/3 rounded-lg bg-[var(--bg-subtle)]" />
                <div className="h-3 w-full rounded bg-[var(--bg-subtle)]" />
                <div className="h-3 w-4/5 rounded bg-[var(--bg-subtle)]" />
                <div className="flex gap-2 mt-2">
                  <div className="h-5 w-16 rounded-full bg-[var(--bg-subtle)]" />
                  <div className="h-5 w-20 rounded-full bg-[var(--bg-subtle)]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && suggestions.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center text-center py-20 text-[var(--text-muted)]">
            <Sparkles className="w-12 h-12 mb-4 text-terra-200" />
            <p className="text-base font-medium text-[var(--text-secondary)] mb-1">
              Noch keine Vorschläge
            </p>
            <p className="text-sm max-w-sm">
              Wählen Sie Ihre Präferenzen links und klicken Sie auf «Vorschläge generieren».
            </p>
          </div>
        )}

        {/* Cards */}
        {!loading && suggestions.length > 0 && (
          <div className="grid gap-4">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSelectedSuggestion(suggestion);
                  setShowConfirm(true);
                }}
                className="text-left bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl p-5 hover:border-terra-300 hover:shadow-warm transition-all duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500"
              >
                <h3 className="font-semibold text-[var(--text-primary)] group-hover:text-terra-700 transition-colors mb-1.5"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {suggestion.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">
                  {suggestion.description}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <ClockIcon />
                    {suggestion.time_estimate_minutes} Min.
                  </span>
                  {suggestion.difficulty && (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        DIFFICULTY_COLORS[suggestion.difficulty] ?? "bg-warm-100 text-warm-700"
                      }`}
                    >
                      {DIFFICULTY_LABELS[suggestion.difficulty] ?? suggestion.difficulty}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirm dialog ─────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => { void handleGenerateRecipe(); }}
        title="Vollständiges Rezept generieren?"
        message={
          selectedSuggestion
            ? `Die KI erstellt ein vollständiges Rezept für «${selectedSuggestion.title}» und speichert es in Ihrer Rezeptsammlung.`
            : ""
        }
        confirmLabel="Rezept generieren"
        cancelLabel="Abbrechen"
        variant="info"
        loading={generatingRecipe}
      />

      {/* Generating overlay */}
      {generatingRecipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-warm-900/30 backdrop-blur-sm">
          <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-base)] shadow-warm-xl px-8 py-6 flex flex-col items-center gap-3">
            <SpinnerIcon />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Rezept wird generiert…
            </p>
            <p className="text-xs text-[var(--text-muted)]">Das kann einen Moment dauern.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-8 h-8 animate-spin text-terra-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
