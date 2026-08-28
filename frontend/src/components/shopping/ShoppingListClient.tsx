"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui";
import { SWISS_UNITS } from "@/lib/units";
import { getAisleCategory } from "@/lib/shopping/aisle-categories";
import {
  getOfflineShoppingList,
  saveShoppingListOffline,
  setOfflineUserId,
  type ShoppingItem,
} from "@/lib/offline/db";
import {
  createTempId,
  flushQueue,
  getPendingOpsServerSnapshot,
  getPendingOpsSnapshot,
  pendingChangesLabel,
  refreshPendingCount,
  sendOrQueue,
  startSyncListeners,
  subscribeFlush,
  subscribePendingOps,
  type FlushResult,
} from "@/lib/offline/shopping-sync";
import toast from "react-hot-toast";

// -- Types -----------------------------------------------------------------

interface Props {
  initialItems: ShoppingItem[];
  userId: string;
}

// -- Component -------------------------------------------------------------

export default function ShoppingListClient({ initialItems, userId }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [ingredientName, setIngredientName] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const [collapsedAisles, setCollapsedAisles] = useState<Set<string>>(
    new Set(),
  );
  // Server props are only authoritative until the local snapshot has been
  // consulted — see the hydration effect below.
  const [hydrated, setHydrated] = useState(false);

  const pendingCount = useSyncExternalStore(
    subscribePendingOps,
    getPendingOpsSnapshot,
    getPendingOpsServerSnapshot,
  );

  // -- Derived values ------------------------------------------------------

  const uncheckedCount = items.filter((i) => !i.isChecked).length;

  // Group items by aisle category. Memoised so unrelated state changes (e.g.
  // the add-item form fields) don't re-run the reduce + sort on every render.
  const { grouped, aisleKeys } = useMemo(() => {
    const grouped = items.reduce<Record<string, ShoppingItem[]>>(
      (acc, item) => {
        const cat = item.aisleCategory ?? "Sonstiges";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
      },
      {},
    );
    return { grouped, aisleKeys: Object.keys(grouped).sort() };
  }, [items]);

  // -- Offline hydration & sync -------------------------------------------

  /** Replaces temp ids with the server ids a flush handed back. */
  const applyFlushedIds = useCallback((result: FlushResult) => {
    if (result.idMap.size === 0) return;
    setItems((prev) =>
      prev.map((i) => {
        const real = result.idMap.get(i.id);
        return real ? { ...i, id: real } : i;
      }),
    );
  }, []);

  /** Pulls the server list — but never over unsent local changes. */
  const revalidate = useCallback(async () => {
    if (getPendingOpsSnapshot() > 0) return;
    try {
      const res = await fetch("/api/shopping-list");
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ShoppingItem[] };
      // Re-check: an op may have been queued while the request was in flight.
      if (getPendingOpsSnapshot() > 0) return;
      if (Array.isArray(data.items)) setItems(data.items);
    } catch {
      // Offline — the local snapshot stays authoritative.
    }
  }, []);

  // Mount: local snapshot first, then revalidate against the network.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setOfflineUserId(userId);

      let snapshotItems: ShoppingItem[] | null = null;
      let pending = 0;
      try {
        const [snapshot, count] = await Promise.all([
          getOfflineShoppingList(userId),
          refreshPendingCount(userId),
        ]);
        snapshotItems = snapshot?.items ?? null;
        pending = count;
      } catch {
        // IndexedDB unavailable (private mode) — fall back to server props.
      }
      if (cancelled) return;

      // The core of the offline blocker: as long as operations are still
      // unsent, the server props are stale by definition — they were rendered
      // before those changes existed. Only the local snapshot may win here,
      // otherwise every tick would visibly jump back on reload.
      // The same applies offline in general: an offline reload is served by
      // the service worker from the HTML it precached at install time, so its
      // props are of unknown age while the snapshot is always the latest state.
      const serverPropsAreStale =
        pending > 0 ||
        (typeof navigator !== "undefined" && navigator.onLine === false);
      if (serverPropsAreStale && snapshotItems) setItems(snapshotItems);

      setHydrated(true);
      startSyncListeners();

      // Exactly one GET either way: with an empty queue `revalidate` refreshes
      // and the flush is a no-op; with a queue `revalidate` bows out and the
      // flush subscriber below revalidates once the replay is through.
      await revalidate();
      if (cancelled) return;
      void flushQueue(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, revalidate]);

  // Every state the user sees is mirrored into IndexedDB — including each
  // successful server response, so the snapshot never lags behind.
  useEffect(() => {
    if (!hydrated) return;
    void saveShoppingListOffline(userId, items).catch(() => {});
  }, [items, hydrated, userId]);

  // A replay triggered elsewhere (reconnect, tab focus) must be reflected here.
  useEffect(() => {
    return subscribeFlush((result) => {
      applyFlushedIds(result);
      void revalidate();
    });
  }, [applyFlushedIds, revalidate]);

  // -- Handlers ------------------------------------------------------------

  /** Snapshot of the list for rollbacks, without stale closure captures. */
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = ingredientName.trim();
      if (!name) return;

      const parsedAmount = amount ? parseFloat(amount) : undefined;
      const tempId = createTempId();
      const optimistic: ShoppingItem = {
        id: tempId,
        ingredientName: name,
        amount: parsedAmount != null ? String(parsedAmount) : null,
        unit: unit || null,
        isChecked: false,
        aisleCategory: getAisleCategory(name),
        recipeId: null,
        sortOrder: itemsRef.current.length,
        createdAt: new Date().toISOString(),
      };

      setAdding(true);
      setItems((prev) => [...prev, optimistic]);
      setIngredientName("");
      setAmount("");
      setUnit("");

      try {
        const result = await sendOrQueue<ShoppingItem>(userId, {
          kind: "add",
          payload: {
            tempId,
            ingredientName: name,
            amount: parsedAmount,
            unit: unit || undefined,
          },
        });
        if (result.status === "sent" && result.data?.id) {
          const created = result.data;
          setItems((prev) => prev.map((i) => (i.id === tempId ? created : i)));
          toast.success("Zutat hinzugefügt.");
        } else {
          toast.success("Zutat offline gespeichert.");
        }
      } catch {
        setItems((prev) => prev.filter((i) => i.id !== tempId));
        toast.error("Zutat konnte nicht hinzugefügt werden.");
      } finally {
        setAdding(false);
      }
    },
    [ingredientName, amount, unit, userId],
  );

  const handleToggle = useCallback(
    async (id: string, checked: boolean) => {
      // Optimistic update — kept even when the request only got queued.
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isChecked: checked } : i)),
      );
      try {
        await sendOrQueue(userId, {
          kind: "toggle",
          payload: { itemId: id, isChecked: checked },
        });
      } catch {
        // Only a real server rejection rolls back.
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, isChecked: !checked } : i)),
        );
        toast.error("Status konnte nicht geändert werden.");
      }
    },
    [userId],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const before = itemsRef.current;
      setItems((cur) => cur.filter((i) => i.id !== id));
      try {
        await sendOrQueue(userId, { kind: "delete", payload: { itemId: id } });
      } catch {
        setItems(before);
        toast.error("Eintrag konnte nicht gelöscht werden.");
      }
    },
    [userId],
  );

  const handleSetAllChecked = useCallback(
    async (checked: boolean) => {
      const before = itemsRef.current;
      setItems((prev) => prev.map((i) => ({ ...i, isChecked: checked })));
      try {
        await sendOrQueue(userId, {
          kind: "checkAll",
          payload: { action: checked ? "check-all" : "uncheck-all" },
        });
      } catch {
        setItems(before);
        toast.error("Aktion fehlgeschlagen.");
      }
    },
    [userId],
  );

  const handleCheckAll = useCallback(
    () => handleSetAllChecked(true),
    [handleSetAllChecked],
  );

  const handleUncheckAll = useCallback(
    () => handleSetAllChecked(false),
    [handleSetAllChecked],
  );

  const handleClearChecked = useCallback(async () => {
    const before = itemsRef.current;
    setItems((cur) => cur.filter((i) => !i.isChecked));
    try {
      const result = await sendOrQueue(userId, {
        kind: "clear",
        payload: {},
      });
      toast.success(
        result.status === "sent"
          ? "Erledigte Einträge gelöscht."
          : "Offline gespeichert — wird synchronisiert.",
      );
    } catch {
      setItems(before);
      toast.error("Aktion fehlgeschlagen.");
    }
  }, [userId]);

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
    <div
      className="min-h-screen bg-[var(--bg-base)]"
      data-testid="shopping-list-page"
    >
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              Einkaufsliste
            </h1>
            <span
              data-testid="shopping-list-count"
              className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-terra-100 dark:bg-terra-900/40 text-terra-700 dark:text-terra-300"
            >
              {uncheckedCount}
            </span>
            {pendingCount > 0 && (
              <span
                data-testid="shopping-list-pending-badge"
                className="text-xs text-[var(--text-muted)]"
              >
                {pendingChangesLabel(pendingCount)}
              </span>
            )}
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
              className="flex-1 min-w-0 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 pointer-coarse:min-tap text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-300 focus:border-terra-300"
            />
            <input
              data-testid="shopping-list-amount-input"
              type="number"
              step="any"
              min="0"
              placeholder="Menge"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full sm:w-24 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 pointer-coarse:min-tap text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-300 focus:border-terra-300"
            />
            <select
              data-testid="shopping-list-unit-select"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full sm:w-24 rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] px-3 py-2 pointer-coarse:min-tap text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-300 focus:border-terra-300"
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
              {adding ? "..." : "Hinzufügen"}
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
              Zurücksetzen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearChecked}
              disabled={!items.some((i) => i.isChecked)}
            >
              Erledigte löschen
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
              aria-expanded={!collapsedAisles.has(aisle)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--bg-base)]/50 transition-colors"
            >
              <span className="text-sm font-semibold text-[var(--text-primary)] font-display">
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
                      style={{
                        width: 44,
                        height: 44,
                        minWidth: 44,
                        minHeight: 44,
                      }}
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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
                        item.isChecked
                          ? "line-through text-[var(--text-muted)]"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {item.amount ? `${item.amount}` : ""}
                        {item.amount && item.unit
                          ? ` ${item.unit}`
                          : (item.unit ?? "")}
                        {item.amount || item.unit ? " " : ""}
                        {item.ingredientName}
                      </span>
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      data-testid={`shopping-list-delete-${item.id}`}
                      onClick={() => handleDelete(item.id)}
                      className="flex-shrink-0 w-8 h-8 pointer-coarse:min-tap flex items-center justify-center rounded-lg text-warm-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      aria-label={`${item.ingredientName} löschen`}
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
