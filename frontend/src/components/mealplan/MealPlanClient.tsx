"use client";

import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  format,
  getISOWeek,
  startOfWeek,
  endOfWeek,
  parseISO,
} from "date-fns";
import { de } from "date-fns/locale";
import toast from "react-hot-toast";
import { Button } from "@/components/ui";
import MealSlot from "./MealSlot";
import RecipePickerDialog from "./RecipePickerDialog";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MealPlanEntry {
  id: string;
  date: string;
  mealType: string;
  recipeId: string;
  servingsOverride: number | null;
  notes: string | null;
  createdAt: string;
  recipeTitle: string | null;
  recipeServings: number | null;
}

interface RecipeOption {
  id: string;
  title: string;
}

interface MealPlanClientProps {
  initialEntries: MealPlanEntry[];
  recipes: RecipeOption[];
  initialWeekStart: string;
}

// ── Meal Type Constants ──────────────────────────────────────────────────────

const MEAL_TYPES = [
  "fruehstueck",
  "mittagessen",
  "abendessen",
  "snack",
] as const;

const MEAL_TYPE_LABELS: Record<string, string> = {
  fruehstueck: "Frühstück",
  mittagessen: "Mittagessen",
  abendessen: "Abendessen",
  snack: "Snack",
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function MealPlanClient({
  initialEntries,
  recipes,
  initialWeekStart,
}: MealPlanClientProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(initialWeekStart);
  const [entries, setEntries] = useState<MealPlanEntry[]>(initialEntries);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState<{
    date: string;
    mealType: string;
  } | null>(null);
  const [generatingList, setGeneratingList] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // ── Derived Values ─────────────────────────────────────────────────────────

  const weekStart = parseISO(currentWeekStart);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const weekNumber = getISOWeek(weekStart);

  const weekLabel = `KW ${weekNumber}, ${format(weekStart, "dd.MM.", { locale: de })} – ${format(weekEnd, "dd.MM.yyyy", { locale: de })}`;

  // ── Week Navigation ────────────────────────────────────────────────────────

  const fetchWeek = useCallback(async (mondayISO: string) => {
    setLoading(true);
    const mondayDate = parseISO(mondayISO);
    const sundayDate = endOfWeek(mondayDate, { weekStartsOn: 1 });
    const sundayISO = format(sundayDate, "yyyy-MM-dd");

    try {
      const res = await fetch(
        `/api/meal-plans?start=${mondayISO}&end=${sundayISO}`,
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries(data.entries);
    } catch {
      toast.error("Wochenplan konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  function goToPrevWeek() {
    const prev = subWeeks(parseISO(currentWeekStart), 1);
    const prevISO = format(prev, "yyyy-MM-dd");
    setCurrentWeekStart(prevISO);
    void fetchWeek(prevISO);
  }

  function goToNextWeek() {
    const next = addWeeks(parseISO(currentWeekStart), 1);
    const nextISO = format(next, "yyyy-MM-dd");
    setCurrentWeekStart(nextISO);
    void fetchWeek(nextISO);
  }

  function goToToday() {
    const todayMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const todayISO = format(todayMonday, "yyyy-MM-dd");
    setCurrentWeekStart(todayISO);
    void fetchWeek(todayISO);
  }

  async function generateShoppingList() {
    setGeneratingList(true);
    const sundayISO = format(weekEnd, "yyyy-MM-dd");
    try {
      const res = await fetch("/api/shopping-list/from-meal-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: currentWeekStart, endDate: sundayISO }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(
        `Einkaufsliste erstellt: ${data.added} Zutaten hinzugefügt.`,
      );
    } catch {
      toast.error("Einkaufsliste konnte nicht erstellt werden.");
    } finally {
      setGeneratingList(false);
    }
  }

  // ── Entry Helpers ──────────────────────────────────────────────────────────

  const entryBySlot = useMemo(
    () => new Map(entries.map((e) => [`${e.date}-${e.mealType}`, e])),
    [entries],
  );

  function getEntryForSlot(date: string, mealType: string) {
    return entryBySlot.get(`${date}-${mealType}`);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleAddToSlot(
    date: string,
    mealType: string,
    recipeId: string,
    recipeTitle: string,
  ) {
    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    const optimistic: MealPlanEntry = {
      id: tempId,
      date,
      mealType,
      recipeId,
      servingsOverride: null,
      notes: null,
      createdAt: new Date().toISOString(),
      recipeTitle,
      recipeServings: null,
    };
    setEntries((prev) => [...prev, optimistic]);

    try {
      const res = await fetch("/api/meal-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, mealType, recipeId }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setEntries((prev) =>
        prev.map((e) => (e.id === tempId ? { ...created, createdAt: created.createdAt ?? new Date().toISOString() } : e)),
      );
      toast.success("Rezept hinzugefügt.");
    } catch {
      setEntries((prev) => prev.filter((e) => e.id !== tempId));
      toast.error("Rezept konnte nicht hinzugefügt werden.");
    }
  }

  async function handleRemove(entryId: string) {
    const removed = entries.find((e) => e.id === entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));

    try {
      const res = await fetch(`/api/meal-plans/${entryId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Eintrag entfernt.");
    } catch {
      if (removed) setEntries((prev) => [...prev, removed]);
      toast.error("Eintrag konnte nicht entfernt werden.");
    }
  }

  async function handleServingsChange(entryId: string, servings: number) {
    const prev = entries.find((e) => e.id === entryId);
    if (!prev) return;

    setEntries((all) =>
      all.map((e) =>
        e.id === entryId ? { ...e, servingsOverride: servings } : e,
      ),
    );

    try {
      const res = await fetch(`/api/meal-plans/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servingsOverride: servings }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEntries((all) =>
        all.map((e) =>
          e.id === entryId
            ? { ...e, servingsOverride: prev.servingsOverride }
            : e,
        ),
      );
      toast.error("Portionen konnten nicht geändert werden.");
    }
  }

  // ── DnD Handler ────────────────────────────────────────────────────────────

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // over.id format: "slot-{date}-{mealType}"
    const overId = String(over.id);
    if (!overId.startsWith("slot-")) return;

    const parts = overId.split("-");
    // "slot-2026-04-06-mittagessen" -> date = "2026-04-06", mealType = last part
    const newMealType = parts[parts.length - 1];
    const newDate = parts.slice(1, parts.length - 1).join("-");

    const entryId = String(active.id);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    // Check if slot already has an entry
    const slotOccupied = entries.some(
      (e) => e.date === newDate && e.mealType === newMealType && e.id !== entryId,
    );
    if (slotOccupied) {
      toast.error("Dieser Platz ist bereits belegt.");
      return;
    }

    // Optimistic update
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, date: newDate, mealType: newMealType }
          : e,
      ),
    );

    try {
      const res = await fetch(`/api/meal-plans/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, mealType: newMealType }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Rollback
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, date: entry.date, mealType: entry.mealType }
            : e,
        ),
      );
      toast.error("Verschieben fehlgeschlagen.");
    }
  }

  // ── Picker Handlers ────────────────────────────────────────────────────────

  function handleOpenPicker(date: string, mealType: string) {
    setShowPicker({ date, mealType });
  }

  function handlePickerSelect(recipeId: string, recipeTitle: string) {
    if (!showPicker) return;
    void handleAddToSlot(
      showPicker.date,
      showPicker.mealType,
      recipeId,
      recipeTitle,
    );
    setShowPicker(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-[var(--bg-base)]"
      data-testid="meal-plan-page"
    >
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <h1
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Wochenplan
          </h1>
        </div>
      </header>

      {/* Week Navigation */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            onClick={goToPrevWeek}
            data-testid="meal-plan-prev-week"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Vorherige Woche"
          >
            <ChevronLeftIcon />
          </button>

          <span
            data-testid="meal-plan-week-label"
            className="text-sm font-medium text-[var(--text-primary)] min-w-[200px] text-center"
          >
            {weekLabel}
          </span>

          <button
            onClick={goToNextWeek}
            data-testid="meal-plan-next-week"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Nächste Woche"
          >
            <ChevronRightIcon />
          </button>

          <button
            onClick={goToToday}
            data-testid="meal-plan-today-button"
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium text-terra-600 dark:text-terra-400 bg-terra-50 dark:bg-terra-950/30 hover:bg-terra-100 dark:hover:bg-terra-900/30 border border-terra-200 dark:border-terra-800 transition-colors"
          >
            Heute
          </button>

          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void generateShoppingList(); }}
              disabled={generatingList || entries.length === 0}
              data-testid="meal-plan-generate-shopping-list"
            >
              {generatingList ? "Wird erstellt…" : "Zur Einkaufsliste"}
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-7 gap-3">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <div
                key={n}
                className="h-48 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-base)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {/* Desktop: Full Grid */}
            <div
              className="hidden lg:block"
              data-testid="meal-plan-grid"
            >
              {/* Column Headers */}
              <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 mb-1">
                <div />
                {weekDays.map((day) => {
                  const dayStr = format(day, "yyyy-MM-dd");
                  const todayStr = format(new Date(), "yyyy-MM-dd");
                  const isToday = dayStr === todayStr;
                  return (
                    <div
                      key={dayStr}
                      className={[
                        "text-center py-2 rounded-xl text-xs font-medium",
                        isToday
                          ? "bg-terra-50 dark:bg-terra-950/30 text-terra-700 dark:text-terra-300 border border-terra-200 dark:border-terra-800"
                          : "text-[var(--text-secondary)]",
                      ].join(" ")}
                    >
                      <div className="font-semibold">
                        {format(day, "EE", { locale: de })}
                      </div>
                      <div>{format(day, "dd.MM.")}</div>
                    </div>
                  );
                })}
              </div>

              {/* Rows per Meal Type */}
              {MEAL_TYPES.map((mealType) => (
                <div
                  key={mealType}
                  className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 mb-1"
                >
                  <div className="flex items-center justify-end pr-2 text-xs font-medium text-[var(--text-muted)]">
                    {MEAL_TYPE_LABELS[mealType]}
                  </div>
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const entry = getEntryForSlot(dateStr, mealType);
                    return (
                      <MealSlot
                        key={`${dateStr}-${mealType}`}
                        date={dateStr}
                        mealType={mealType}
                        entry={entry ?? null}
                        onAddClick={handleOpenPicker}
                        onRemove={handleRemove}
                        onServingsChange={handleServingsChange}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Mobile: Stacked Days */}
            <div className="lg:hidden space-y-4" data-testid="meal-plan-grid-mobile">
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const todayStr = format(new Date(), "yyyy-MM-dd");
                const isToday = dateStr === todayStr;
                return (
                  <div
                    key={dateStr}
                    className={[
                      "rounded-2xl border p-3",
                      isToday
                        ? "border-terra-300 dark:border-terra-700 bg-terra-50/30 dark:bg-terra-950/20"
                        : "border-[var(--border-base)] bg-[var(--bg-surface)]",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "text-sm font-semibold mb-2",
                        isToday
                          ? "text-terra-700"
                          : "text-[var(--text-primary)]",
                      ].join(" ")}
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {format(day, "EEEE, dd. MMMM", { locale: de })}
                    </div>
                    <div className="space-y-2">
                      {MEAL_TYPES.map((mealType) => {
                        const entry = getEntryForSlot(dateStr, mealType);
                        return (
                          <div key={mealType}>
                            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                              {MEAL_TYPE_LABELS[mealType]}
                            </div>
                            <MealSlot
                              date={dateStr}
                              mealType={mealType}
                              entry={entry ?? null}
                              onAddClick={handleOpenPicker}
                              onRemove={handleRemove}
                              onServingsChange={handleServingsChange}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </DndContext>
        )}
      </main>

      {/* Recipe Picker Dialog */}
      <RecipePickerDialog
        open={showPicker !== null}
        onClose={() => setShowPicker(null)}
        onSelect={handlePickerSelect}
        recipes={recipes}
      />
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}
