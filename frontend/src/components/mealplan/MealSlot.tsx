"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { MealPlanEntry } from "./MealPlanClient";

// ── Props ────────────────────────────────────────────────────────────────────

interface MealSlotProps {
  date: string;
  mealType: string;
  entry: MealPlanEntry | null;
  onAddClick: (date: string, mealType: string) => void;
  onRemove: (entryId: string) => void;
  onServingsChange: (entryId: string, servings: number) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MealSlot({
  date,
  mealType,
  entry,
  onAddClick,
  onRemove,
  onServingsChange,
}: MealSlotProps) {
  const slotId = `slot-${date}-${mealType}`;

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId });

  return (
    <div
      ref={setDropRef}
      data-testid={`meal-slot-${date}-${mealType}`}
      className={[
        "min-h-[60px] rounded-xl transition-all duration-150",
        isOver ? "ring-2 ring-terra-400 bg-terra-50/50" : "",
        entry ? "" : "border border-dashed border-[var(--border-base)]",
      ].join(" ")}
    >
      {entry ? (
        <FilledSlot
          entry={entry}
          onRemove={onRemove}
          onServingsChange={onServingsChange}
        />
      ) : (
        <button
          type="button"
          onClick={() => onAddClick(date, mealType)}
          data-testid={`meal-slot-add-${date}-${mealType}`}
          className="w-full h-full min-h-[60px] flex items-center justify-center text-[var(--text-muted)] hover:text-terra-500 hover:bg-[var(--bg-subtle)] rounded-xl transition-colors"
          aria-label={`Rezept hinzufügen`}
        >
          <PlusIcon />
        </button>
      )}
    </div>
  );
}

// ── Filled Slot (Draggable) ──────────────────────────────────────────────────

function FilledSlot({
  entry,
  onRemove,
  onServingsChange,
}: {
  entry: MealPlanEntry;
  onRemove: (id: string) => void;
  onServingsChange: (id: string, servings: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: entry.id });

  const currentServings =
    entry.servingsOverride ?? entry.recipeServings ?? 4;

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`meal-plan-entry-${entry.id}`}
      className={[
        "rounded-xl bg-[var(--bg-surface)] border border-[var(--border-base)] p-2 group",
        "hover:border-terra-300 hover:shadow-sm transition-all",
        isDragging ? "shadow-warm" : "",
      ].join(" ")}
    >
      {/* Drag Handle + Title */}
      <div className="flex items-start gap-1.5">
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab active:cursor-grabbing text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0"
          aria-label="Verschieben"
        >
          <GripIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-[var(--text-primary)] truncate">
            {entry.recipeTitle ?? "Rezept"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          data-testid={`meal-plan-remove-${entry.id}`}
          className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
          aria-label="Entfernen"
        >
          <XIcon />
        </button>
      </div>

      {/* Servings Controls */}
      <div
        className="flex items-center gap-1 mt-1.5"
        data-testid={`meal-plan-servings-${entry.id}`}
      >
        <button
          type="button"
          onClick={() =>
            onServingsChange(entry.id, Math.max(1, currentServings - 1))
          }
          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Weniger Portionen"
        >
          -
        </button>
        <span className="text-[10px] text-[var(--text-secondary)] min-w-[40px] text-center">
          {currentServings} Port.
        </span>
        <button
          type="button"
          onClick={() => onServingsChange(entry.id, currentServings + 1)}
          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Mehr Portionen"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="w-3 h-3"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
    </svg>
  );
}
