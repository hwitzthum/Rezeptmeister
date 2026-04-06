"use client";

import { useId, useState } from "react";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SWISS_UNITS } from "@/lib/units";

export interface IngredientItem {
  id: string;
  name: string;
  amount: string;
  unit: string;
  groupName: string;
  isOptional: boolean;
}

export interface Step2Data {
  ingredients: IngredientItem[];
}

interface Props {
  data: Step2Data;
  onChange: (data: Step2Data) => void;
}

function newIngredient(): IngredientItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    amount: "",
    unit: "g",
    groupName: "",
    isOptional: false,
  };
}

// ── Sortierbare Zutatzeile ─────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg
      className="w-4 h-4 text-warm-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 8h16M4 16h16"
      />
    </svg>
  );
}

interface RowProps {
  item: IngredientItem;
  onUpdate: (updated: IngredientItem) => void;
  onRemove: () => void;
  index: number;
}

function SortableIngredientRow({ item, onUpdate, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 py-2 px-3 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] group"
    >
      {/* Drag-Handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-1 rounded hover:bg-[var(--bg-subtle)] text-warm-400"
        aria-label="Zeile verschieben"
      >
        <GripIcon />
      </button>

      {/* Menge */}
      <input
        type="text"
        inputMode="decimal"
        value={item.amount}
        onChange={(e) => onUpdate({ ...item, amount: e.target.value })}
        placeholder="Menge"
        aria-label="Menge"
        className={[
          "w-20 shrink-0 px-2.5 py-1.5 rounded-lg text-sm text-center",
          "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
          "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
        ].join(" ")}
      />

      {/* Einheit */}
      <select
        value={item.unit}
        onChange={(e) => onUpdate({ ...item, unit: e.target.value })}
        aria-label="Einheit"
        className={[
          "w-24 shrink-0 px-2 py-1.5 rounded-lg text-sm",
          "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
          "text-[var(--text-primary)]",
          "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
        ].join(" ")}
      >
        <option value="">—</option>
        {SWISS_UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      {/* Name */}
      <input
        type="text"
        value={item.name}
        onChange={(e) => onUpdate({ ...item, name: e.target.value })}
        placeholder="Zutat *"
        aria-label="Zutatname"
        required
        className={[
          "flex-1 min-w-0 px-2.5 py-1.5 rounded-lg text-sm",
          "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
          "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
          "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
        ].join(" ")}
      />

      {/* Optional-Checkbox */}
      <label className="flex items-center gap-1 shrink-0 text-xs text-[var(--text-muted)] cursor-pointer">
        <input
          type="checkbox"
          checked={item.isOptional}
          onChange={(e) => onUpdate({ ...item, isOptional: e.target.checked })}
          className="rounded border-[var(--border-base)] text-terra-500 focus:ring-terra-400"
        />
        Opt.
      </label>

      {/* Entfernen */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Zutat entfernen"
        className={[
          "shrink-0 w-7 h-7 flex items-center justify-center rounded-lg",
          "text-warm-400 hover:text-red-500 hover:bg-red-50",
          "transition-colors duration-150",
          "opacity-0 group-hover:opacity-100 focus:opacity-100",
        ].join(" ")}
      >
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

// ── Hauptkomponente ────────────────────────────────────────────────────────────

export default function Step2Zutaten({ data, onChange }: Props) {
  const [showGroupName, setShowGroupName] = useState(false);
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = data.ingredients.findIndex((i) => i.id === active.id);
      const newIndex = data.ingredients.findIndex((i) => i.id === over.id);
      onChange({
        ingredients: arrayMove(data.ingredients, oldIndex, newIndex),
      });
    }
  }

  function updateItem(id: string, updated: IngredientItem) {
    onChange({
      ingredients: data.ingredients.map((i) => (i.id === id ? updated : i)),
    });
  }

  function removeItem(id: string) {
    onChange({ ingredients: data.ingredients.filter((i) => i.id !== id) });
  }

  function addItem() {
    onChange({ ingredients: [...data.ingredients, newIngredient()] });
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-[var(--text-secondary)]">
          Zutaten in der gewünschten Reihenfolge hinzufügen.
          {data.ingredients.length > 0 && (
            <span className="ml-1 text-[var(--text-muted)]">
              ({data.ingredients.length} Zutat
              {data.ingredients.length !== 1 ? "en" : ""})
            </span>
          )}
        </p>
      </div>

      {/* Spaltenheader */}
      {data.ingredients.length > 0 && (
        <div className="flex items-center gap-2 px-3 text-xs text-[var(--text-muted)] font-medium">
          <span className="w-5 shrink-0" />
          <span className="w-20 shrink-0 text-center">Menge</span>
          <span className="w-24 shrink-0">Einheit</span>
          <span className="flex-1">Zutat</span>
          <span className="w-10 text-center">Opt.</span>
          <span className="w-7 shrink-0" />
        </div>
      )}

      {/* Sortierbare Liste */}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={data.ingredients.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {data.ingredients.map((item, idx) => (
              <SortableIngredientRow
                key={item.id}
                item={item}
                index={idx}
                onUpdate={(updated) => updateItem(item.id, updated)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Leer-Zustand */}
      {data.ingredients.length === 0 && (
        <div className="py-8 flex flex-col items-center gap-2 text-[var(--text-muted)] border-2 border-dashed border-[var(--border-base)] rounded-xl">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <p className="text-sm">Noch keine Zutaten. Fügen Sie die erste hinzu.</p>
        </div>
      )}

      {/* + Zutat hinzufügen */}
      <button
        type="button"
        onClick={addItem}
        className={[
          "w-full py-2.5 rounded-xl border-2 border-dashed border-[var(--border-base)]",
          "text-sm font-medium text-[var(--text-secondary)]",
          "hover:border-terra-300 hover:text-terra-600 hover:bg-terra-50",
          "transition-colors duration-150",
          "flex items-center justify-center gap-2",
        ].join(" ")}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Zutat hinzufügen
      </button>

      {/* Hinweis zu Gruppen */}
      {data.ingredients.length >= 3 && !showGroupName && (
        <button
          type="button"
          onClick={() => setShowGroupName(true)}
          className="text-xs text-terra-500 hover:text-terra-700 underline"
        >
          Zutaten in Gruppen aufteilen?
        </button>
      )}

      {showGroupName && (
        <p className="text-xs text-[var(--text-muted)]">
          Gruppenname: Klicken Sie auf eine Zutatzeile und fügen Sie einen
          Gruppenbezeichner hinzu (z.B. &quot;Für die Sauce&quot;).
        </p>
      )}
    </div>
  );
}
