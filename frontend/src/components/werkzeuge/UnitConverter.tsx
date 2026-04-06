"use client";

import { useState, useMemo, useCallback } from "react";
import {
  convertUnit,
  isIngredientRelevant,
  getUnitLabel,
  getUnitsForCategory,
  CATEGORY_LABELS,
  INGREDIENT_DENSITIES,
  QUICK_REFERENCES,
} from "@/lib/units/converter";
import type { ConversionCategory } from "@/lib/units/converter";

// ── Category icon SVGs ──────────────────────────────────────────────────────

function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l3-3 3 3M9 6v12a3 3 0 003 3h0a3 3 0 003-3V6" />
    </svg>
  );
}

function WeightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a4 4 0 00-4 4h8a4 4 0 00-4-4zM5 7h14l-1.5 14H6.5L5 7z" />
    </svg>
  );
}

function TemperatureIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9V3m0 0L9.5 5.5M12 3l2.5 2.5M12 9a5 5 0 100 10 5 5 0 000-10z" />
    </svg>
  );
}

function SpoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3c0 3.5-3 6-3 6s-3-2.5-3-6a3 3 0 016 0zM12 9v12" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<ConversionCategory, React.ReactNode> = {
  volumen: <VolumeIcon className="w-4 h-4" />,
  gewicht: <WeightIcon className="w-4 h-4" />,
  temperatur: <TemperatureIcon className="w-4 h-4" />,
  loeffel: <SpoonIcon className="w-4 h-4" />,
};

const CATEGORIES: ConversionCategory[] = ["volumen", "gewicht", "temperatur", "loeffel"];

// ── Default unit pairs per category ─────────────────────────────────────────

const DEFAULT_PAIRS: Record<ConversionCategory, [string, string]> = {
  volumen: ["cup", "dl"],
  gewicht: ["oz", "g"],
  temperatur: ["fahrenheit", "celsius"],
  loeffel: ["tbsp", "EL"],
};

// ── Component ───────────────────────────────────────────────────────────────

export default function UnitConverter() {
  const [category, setCategory] = useState<ConversionCategory>("volumen");
  const [fromUnit, setFromUnit] = useState(DEFAULT_PAIRS.volumen[0]);
  const [toUnit, setToUnit] = useState(DEFAULT_PAIRS.volumen[1]);
  const [amount, setAmount] = useState("1");
  const [ingredientId, setIngredientId] = useState("");

  // Active category units shown first, then other categories grouped
  const groupedUnits = useMemo(() => {
    const active = getUnitsForCategory(category);
    const others = CATEGORIES.filter((c) => c !== category).map((c) => ({
      category: c,
      label: CATEGORY_LABELS[c],
      units: getUnitsForCategory(c),
    }));
    return { active, others };
  }, [category]);
  const showIngredient = useMemo(() => isIngredientRelevant(fromUnit, toUnit), [fromUnit, toUnit]);

  const result = useMemo(() => {
    const num = parseFloat(amount);
    if (isNaN(num)) return null;
    return convertUnit(num, fromUnit, toUnit, ingredientId || undefined);
  }, [amount, fromUnit, toUnit, ingredientId]);

  const handleCategoryChange = useCallback((cat: ConversionCategory) => {
    setCategory(cat);
    setFromUnit(DEFAULT_PAIRS[cat][0]);
    setToUnit(DEFAULT_PAIRS[cat][1]);
    setIngredientId("");
  }, []);

  const handleSwap = useCallback(() => {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }, [fromUnit, toUnit]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Category Tabs ──────────────────────────────────────────── */}
      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Konvertierungskategorie">
        {CATEGORIES.map((cat) => {
          const isActive = category === cat;
          return (
            <button
              key={cat}
              role="tab"
              aria-selected={isActive}
              data-testid={`converter-category-${cat}`}
              onClick={() => handleCategoryChange(cat)}
              className={[
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium",
                "transition-all duration-200",
                isActive
                  ? "bg-terra-500 text-white shadow-warm-sm"
                  : "bg-[var(--bg-surface)] border border-[var(--border-base)] text-[var(--text-secondary)] hover:border-terra-300 hover:text-terra-600 hover:bg-terra-50 dark:hover:bg-terra-950/30",
              ].join(" ")}
            >
              {CATEGORY_ICONS[cat]}
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* ── Main Converter Card ────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] shadow-warm overflow-hidden">
        {/* Decorative top stripe */}
        <div className="h-1.5 bg-gradient-to-r from-terra-400 via-terra-500 to-gold-500" />

        <div className="p-6 sm:p-8">
          {/* From / Swap / To row */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-3 sm:gap-5 items-end">
            {/* FROM */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Von
              </label>
              <input
                data-testid="converter-amount-input"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Menge"
                className={[
                  "w-full bg-[var(--bg-base)] text-[var(--text-primary)]",
                  "border border-[var(--border-base)] rounded-xl px-4 py-3 text-lg font-medium tabular-nums",
                  "placeholder:text-warm-400",
                  "transition-all duration-150",
                  "focus:outline-none focus:ring-2 focus:ring-terra-500 focus:border-terra-500",
                  "hover:border-[var(--border-strong)]",
                ].join(" ")}
                aria-label="Menge eingeben"
              />
              <select
                data-testid="converter-from-unit"
                value={fromUnit}
                onChange={(e) => setFromUnit(e.target.value)}
                className={[
                  "w-full appearance-none bg-[var(--bg-base)] text-[var(--text-primary)]",
                  "border border-[var(--border-base)] rounded-xl px-4 py-2.5 text-sm font-medium",
                  "transition-all duration-150 cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-terra-500 focus:border-terra-500",
                  "hover:border-[var(--border-strong)]",
                ].join(" ")}
                aria-label="Ausgangseinheit"
              >
                <optgroup label={CATEGORY_LABELS[category]}>
                  {groupedUnits.active.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </optgroup>
                {groupedUnits.others.map((g) => (
                  <optgroup key={g.category} label={g.label}>
                    {g.units.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* SWAP BUTTON */}
            <div className="flex items-center justify-center pb-1">
              <button
                data-testid="converter-swap-button"
                onClick={handleSwap}
                aria-label="Einheiten tauschen"
                className={[
                  "w-11 h-11 rounded-full flex items-center justify-center",
                  "bg-terra-50 dark:bg-terra-950/30 border-2 border-terra-200 dark:border-terra-700 text-terra-500",
                  "hover:bg-terra-100 dark:hover:bg-terra-900/30 hover:border-terra-300 hover:scale-110",
                  "active:scale-95",
                  "transition-all duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra-500 focus-visible:ring-offset-2",
                ].join(" ")}
              >
                <SwapIcon className="w-5 h-5" />
              </button>
            </div>

            {/* TO */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Nach
              </label>
              <div
                data-testid="converter-result"
                className={[
                  "w-full min-h-[52px] flex items-center px-4 py-3 rounded-xl",
                  "bg-gradient-to-br from-cream-50 to-cream-100 dark:from-warm-800 dark:to-warm-900",
                  "border border-gold-300/50 dark:border-gold-700/50",
                  "text-lg font-semibold tabular-nums",
                  result ? "text-terra-600" : "text-warm-400",
                ].join(" ")}
                aria-live="polite"
                aria-label="Ergebnis"
              >
                {result ? (
                  <span className="animate-fade-in">
                    {result.formatted} {getUnitLabel(result.unit)}
                  </span>
                ) : (
                  <span className="text-sm font-normal">—</span>
                )}
              </div>
              <select
                data-testid="converter-to-unit"
                value={toUnit}
                onChange={(e) => setToUnit(e.target.value)}
                className={[
                  "w-full appearance-none bg-[var(--bg-base)] text-[var(--text-primary)]",
                  "border border-[var(--border-base)] rounded-xl px-4 py-2.5 text-sm font-medium",
                  "transition-all duration-150 cursor-pointer",
                  "focus:outline-none focus:ring-2 focus:ring-terra-500 focus:border-terra-500",
                  "hover:border-[var(--border-strong)]",
                ].join(" ")}
                aria-label="Zieleinheit"
              >
                <optgroup label={CATEGORY_LABELS[category]}>
                  {groupedUnits.active.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </optgroup>
                {groupedUnits.others.map((g) => (
                  <optgroup key={g.category} label={g.label}>
                    {g.units.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          {/* ── Ingredient Selector (conditional) ────────────────────── */}
          {showIngredient && (
            <div className="mt-6 pt-6 border-t border-[var(--border-base)] animate-slide-up">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-1 w-8 h-8 rounded-lg bg-gold-500/10 dark:bg-gold-500/20 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gold-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Für die Umrechnung zwischen Volumen und Gewicht wird die Zutat benötigt, da verschiedene Zutaten unterschiedliche Dichten haben.
                  </p>
                  <select
                    data-testid="converter-ingredient-select"
                    value={ingredientId}
                    onChange={(e) => setIngredientId(e.target.value)}
                    className={[
                      "w-full sm:w-80 appearance-none bg-[var(--bg-base)] text-[var(--text-primary)]",
                      "border border-[var(--border-base)] rounded-xl px-4 py-2.5 text-sm font-medium",
                      "transition-all duration-150 cursor-pointer",
                      "focus:outline-none focus:ring-2 focus:ring-terra-500 focus:border-terra-500",
                      "hover:border-[var(--border-strong)]",
                    ].join(" ")}
                    aria-label="Zutat wählen"
                  >
                    <option value="">Zutat wählen...</option>
                    {INGREDIENT_DENSITIES.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.label} ({ing.gramsPerCup} g/Cup)
                      </option>
                    ))}
                  </select>
                  {showIngredient && !ingredientId && (
                    <p className="text-xs text-gold-600 font-medium">
                      Bitte Zutat wählen für ein genaues Ergebnis
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Ingredient badge on result ────────────────────────────── */}
          {result?.ingredientUsed && (
            <div className="mt-4 animate-fade-in">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gold-500/10 dark:bg-gold-500/20 text-gold-700 dark:text-gold-400 border border-gold-300/30 dark:border-gold-700/30">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
                Zutatenbewusst umgerechnet
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Reference Table ──────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] shadow-warm-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-base)] bg-[var(--bg-subtle)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--font-display)" }}>
            Schnellreferenz
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Häufig verwendete Umrechnungen auf einen Blick
          </p>
        </div>
        <div className="divide-y divide-[var(--border-base)]">
          {QUICK_REFERENCES.map((ref, i) => (
            <div
              key={i}
              className="px-6 py-3 flex items-center justify-between gap-4 text-sm hover:bg-[var(--bg-subtle)] transition-colors duration-100"
            >
              <span className="font-medium text-[var(--text-primary)] tabular-nums">
                {ref.from}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-warm-400">→</span>
                <span className="font-semibold text-terra-600 tabular-nums">
                  {ref.to}
                </span>
                {ref.note && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold-500/10 dark:bg-gold-500/20 text-gold-700 dark:text-gold-400">
                    {ref.note}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}