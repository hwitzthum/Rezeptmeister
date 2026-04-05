"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui";
import { SWISS_UNITS } from "@/lib/units";
import toast from "react-hot-toast";

// -- Types -----------------------------------------------------------------

interface ShoppingItem {
  id: string;
  ingredientName: string;
  amount: string | null;
  unit: string | null;
  isChecked: boolean;
  aisleCategory: string | null;
  recipeId: string | null;
  sortOrder: number;
  createdAt: string;
}

interface Props {
  initialItems: ShoppingItem[];
}

// -- Component -------------------------------------------------------------

export default function ShoppingListClient({ initialItems }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [ingredientName, setIngredientName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const [collapsedAisles, setCollapsedAisles] = useState<Set<string>>(new Set());

  // -- Derived values ------------------------------------------------------

  const uncheckedCount = items.filter((i) => !i.isChecked).length;

  // Group items by aisle category
  const grouped = items.reduce<Record<string, ShoppingItem[]>>((acc, item) => {
    const cat = item.aisleCategory ?? "Sonstiges";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const aisleKeys = Object.keys(grouped).sort();

  // -- Handlers ------------------------------------------------------------

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = ingredientName.trim();
      if (!name) return;

      setAdding(true);
      try {
        const res = await fetch("/api/shopping-list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ingredientName: name,
            amount: amount ? parseFloat(amount) : undefined,
            unit: unit || undefined,
          }),
        });
        if (!res.ok) throw new Error();
        const item: ShoppingItem = await res.json();
        setItems((prev) => [...prev, item]);
        setIngredientName("");
        setAmount("");
        setUnit("");
        toast.success("Zutat hinzugefuegt.");
      } catch {
        toast.error("Zutat konnte nicht hinzugefuegt werden.");
      } finally {
        setAdding(false);
      }
    },
    [ingredientName, amount, unit],
  );

  const handleToggle = useCallback(async (id: string, checked: boolean) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, isChecked: checked } : i)),
    );
    try {
      const res = await fetch(`/api/shopping-list/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isChecked: checked }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isChecked: !checked } : i)),
      );
      toast.error("Status konnte nicht geaendert werden.");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    try {
      const res = await fetch(`/api/shopping-list/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Eintrag konnte nicht geloescht werden.");
    }
  }, [items]);

  const handleCheckAll = useCallback(async () => {
    setItems((prev) => prev.map((i) => ({ ...i, isChecked: true })));
    try {
      const res = await fetch("/api/shopping-list/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-all" }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(initialItems);
      toast.error("Aktion fehlgeschlagen.");
    }
  }, [initialItems]);

  const handleUncheckAll = useCallback(async () => {
    setItems((prev) => prev.map((i) => ({ ...i, isChecked: false })));
    try {
      const res = await fetch("/api/shopping-list/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uncheck-all" }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(initialItems);
      toast.error("Aktion fehlgeschlagen.");
    }
  }, [initialItems]);

  const handleClearChecked = useCallback(async () => {
    const prev = items;
    setItems((cur) => cur.filter((i) => !i.isChecked));
    try {
      const res = await fetch("/api/shopping-list/batch", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Erledigte Eintraege geloescht.");
    } catch {
      setItems(prev);
      toast.error("Aktion fehlgeschlagen.");
    }
  }, [items]);

  const toggleAisle = useCallback((aisle: string) => {
    setCollapsedAisles((prev) => {
      const next = new Set(prev);
      if (next.has(aisle)) next.delete(aisle);
      else next.add(aisle);
      return next;
    });
  }, []);

  // -- Render --------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[var(--bg-base)]" data-testid="shopping-list-page">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1
              className="text-xl font-bold text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Einkaufsliste
            </h1>
            <span
              data-testid="shopping-list-count"
              className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-terra-100 text-terra-700"
            >
              {uncheckedCount}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Add form */}
        <form
          onSubmit={handleAdd}
          data-testid="shopping-list-add-form"
          className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm p-4"
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              data-testid="shopping-list-ingredient-input"
              type="text"
              placeholder="Zutat..."
              value={ingredientName}
              onChange={(e) => setIngredientName(e.target.value)}
              className="flex-1 min-w-0 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-300 focus:border-terra-300"
            />
            <input
              data-testid="shopping-list-amount-input"
              type="number"
              step="any"
              min="0"
              placeholder="Menge"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-300 focus:border-terra-300"
            />
            <select
              data-testid="shopping-list-unit-select"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-24 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-300 focus:border-terra-300"
            >
              <option value="">Einheit</option>
              {SWISS_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={adding || !ingredientName.trim()}
              data-testid="shopping-list-add-button"
            >
              {adding ? "..." : "Hinzufuegen"}
            </Button>
          </div>
        </form>

        {/* Action bar */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleCheckAll}>
              Alle abhaken
            </Button>
            <Button variant="outline" size="sm" onClick={handleUncheckAll}>
              Zuruecksetzen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearChecked}
              disabled={!items.some((i) => i.isChecked)}
            >
              Erledigte loeschen
            </Button>
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <div className="text-center py-16">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-warm-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
              />
            </svg>
            <p className="text-[var(--text-muted)] text-lg">
              Ihre Einkaufsliste ist leer.
            </p>
          </div>
        )}

        {/* Grouped items */}
        {aisleKeys.map((aisle) => (
          <section
            key={aisle}
            data-testid={`aisle-group-${aisle}`}
            className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleAisle(aisle)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-base)]/50 transition-colors"
            >
              <span
                className="text-sm font-semibold text-[var(--text-primary)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {aisle}
              </span>
              <svg
                className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
                  collapsedAisles.has(aisle) ? "-rotate-90" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {!collapsedAisles.has(aisle) && (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {grouped[aisle].map((item) => (
                  <li
                    key={item.id}
                    data-testid={`shopping-list-item-${item.id}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {/* Checkbox */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.isChecked}
                      data-testid={`shopping-list-checkbox-${item.id}`}
                      onClick={() => handleToggle(item.id, !item.isChecked)}
                      className={`flex-shrink-0 flex items-center justify-center rounded-lg border-2 transition-colors ${
                        item.isChecked
                          ? "bg-terra-500 border-terra-500 text-white"
                          : "border-warm-300 text-transparent hover:border-terra-300"
                      }`}
                      style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>

                    {/* Name + amount */}
                    <div
                      className={`flex-1 min-w-0 ${
                        item.isChecked ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {item.amount ? `${item.amount}` : ""}
                        {item.amount && item.unit ? ` ${item.unit}` : item.unit ?? ""}
                        {(item.amount || item.unit) ? " " : ""}
                        {item.ingredientName}
                      </span>
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      data-testid={`shopping-list-delete-${item.id}`}
                      onClick={() => handleDelete(item.id)}
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-warm-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      aria-label={`${item.ingredientName} loeschen`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
