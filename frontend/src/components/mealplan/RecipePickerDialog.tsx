"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/ui";

// ── Props ────────────────────────────────────────────────────────────────────

interface RecipePickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (recipeId: string, recipeTitle: string) => void;
  recipes: { id: string; title: string }[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RecipePickerDialog({
  open,
  onClose,
  onSelect,
  recipes,
}: RecipePickerDialogProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return recipes;
    const lower = search.toLowerCase();
    return recipes.filter((r) => r.title.toLowerCase().includes(lower));
  }, [recipes, search]);

  function handleSelect(recipeId: string, recipeTitle: string) {
    onSelect(recipeId, recipeTitle);
    setSearch("");
  }

  function handleClose() {
    setSearch("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Rezept auswählen"
      size="md"
    >
      <div data-testid="recipe-picker-dialog">
        {/* Search */}
        <div className="mb-3">
          <input
            type="search"
            placeholder="Rezept suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="recipe-picker-search"
            className={[
              "w-full px-3 py-2 rounded-xl text-sm",
              "bg-[var(--bg-subtle)] border border-[var(--border-base)]",
              "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
              "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
            ].join(" ")}
            autoFocus
          />
        </div>

        {/* Recipe List */}
        <div className="max-h-[300px] overflow-y-auto -mx-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              Keine Rezepte gefunden.
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((recipe) => (
                <li key={recipe.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(recipe.id, recipe.title)}
                    data-testid={`recipe-picker-item-${recipe.id}`}
                    className={[
                      "w-full text-left px-3 py-2.5 rounded-xl text-sm",
                      "text-[var(--text-primary)] hover:bg-terra-50 dark:hover:bg-terra-950/30 hover:text-terra-700 dark:hover:text-terra-300",
                      "transition-colors duration-100",
                    ].join(" ")}
                  >
                    {recipe.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
