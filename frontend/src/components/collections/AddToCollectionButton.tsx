"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui";

// ── Typen ────────────────────────────────────────────────────────────────────

interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  recipeCount: number;
  coverImageUrl: string | null;
  createdAt: string;
}

interface AddToCollectionButtonProps {
  recipeId: string;
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export default function AddToCollectionButton({
  recipeId,
}: AddToCollectionButtonProps) {
  const [open, setOpen] = useState(false);
  const [allCollections, setAllCollections] = useState<CollectionSummary[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Fetch collections + check which contain this recipe
  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/collections");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { collections: CollectionSummary[] };
      setAllCollections(data.collections);

      // Check which collections already contain this recipe
      const ids = new Set<string>();
      for (const col of data.collections) {
        const detailRes = await fetch(`/api/collections/${col.id}`);
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as {
            recipes: { recipeId: string }[];
          };
          if (detail.recipes.some((r) => r.recipeId === recipeId)) {
            ids.add(col.id);
          }
        }
      }
      setAddedIds(ids);
    } catch {
      toast.error("Sammlungen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  async function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    await fetchCollections();
  }

  // ── Add recipe to collection ─────────────────────────────────────────────

  async function handleAdd(collectionId: string, collectionName: string) {
    if (addedIds.has(collectionId)) return;
    try {
      const res = await fetch(`/api/collections/${collectionId}/rezepte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) throw new Error();
      setAddedIds((prev) => new Set([...prev, collectionId]));
      toast.success(`Rezept zu '${collectionName}' hinzugefügt.`);
    } catch {
      toast.error("Rezept konnte nicht hinzugefügt werden.");
    }
  }

  // ── Inline create new collection + add recipe ────────────────────────────

  async function handleInlineCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const createRes = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!createRes.ok) throw new Error();
      const created = (await createRes.json()) as { id: string; name: string };

      // Add recipe to new collection
      const addRes = await fetch(`/api/collections/${created.id}/rezepte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!addRes.ok) throw new Error();

      setAllCollections((prev) => [
        {
          id: created.id,
          name: created.name,
          description: null,
          recipeCount: 1,
          coverImageUrl: null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setAddedIds((prev) => new Set([...prev, created.id]));
      setNewName("");
      setShowInlineCreate(false);
      toast.success(`Rezept zu '${created.name}' hinzugefügt.`);
    } catch {
      toast.error("Sammlung konnte nicht erstellt werden.");
    } finally {
      setCreating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void handleToggle();
        }}
        icon={<FolderPlusIcon />}
      >
        Zu Sammlung
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--bg-surface)] border border-[var(--border-base)] rounded-xl shadow-warm-lg z-50 overflow-hidden">
          {loading ? (
            <div className="p-4 text-center text-sm text-[var(--text-muted)]">
              Laden...
            </div>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto">
                {allCollections.length === 0 && !showInlineCreate && (
                  <div className="p-3 text-sm text-[var(--text-muted)] text-center">
                    Keine Sammlungen vorhanden.
                  </div>
                )}
                {allCollections.map((col) => {
                  const isAdded = addedIds.has(col.id);
                  return (
                    <button
                      key={col.id}
                      onClick={() => {
                        void handleAdd(col.id, col.name);
                      }}
                      disabled={isAdded}
                      className={[
                        "w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors",
                        isAdded
                          ? "text-[var(--text-muted)] bg-warm-50 dark:bg-warm-800 cursor-default"
                          : "text-[var(--text-primary)] hover:bg-warm-50 dark:hover:bg-warm-800 cursor-pointer",
                      ].join(" ")}
                    >
                      {isAdded ? (
                        <CheckIcon className="w-4 h-4 shrink-0 text-terra-500" />
                      ) : (
                        <FolderIcon className="w-4 h-4 shrink-0 text-warm-400" />
                      )}
                      <span className="truncate">{col.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Inline create */}
              <div className="border-t border-[var(--border-base)]">
                {showInlineCreate ? (
                  <div className="p-2 flex gap-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Sammlungsname"
                      maxLength={255}
                      className="flex-1 min-w-0 bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-base)] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-terra-500"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleInlineCreate();
                        if (e.key === "Escape") setShowInlineCreate(false);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        void handleInlineCreate();
                      }}
                      disabled={creating || !newName.trim()}
                      className="px-2 py-1 text-xs font-medium bg-terra-500 text-white rounded-lg hover:bg-terra-600 disabled:opacity-50 transition-colors"
                    >
                      {creating ? "..." : "OK"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowInlineCreate(true)}
                    className="w-full text-left px-3 py-2 text-sm text-terra-500 hover:bg-terra-50 dark:hover:bg-terra-950/30 flex items-center gap-2 transition-colors font-medium"
                  >
                    <PlusIcon className="w-4 h-4 shrink-0" />
                    Neue Sammlung
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function FolderPlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"
      />
    </svg>
  );
}

function FolderIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function CheckIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
