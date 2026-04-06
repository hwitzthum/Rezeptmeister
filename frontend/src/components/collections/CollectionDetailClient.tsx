"use client";

import { useId, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import toast from "react-hot-toast";
import { Button, Modal, ConfirmDialog } from "@/components/ui";
import type { RecipeDetail } from "@/components/recipes/RecipeDetailClient";

// ── Typen ────────────────────────────────────────────────────────────────────

interface CollectionData {
  id: string;
  name: string;
  description: string | null;
  coverImageId: string | null;
  createdAt: string;
}

interface RecipeInCollection {
  sortOrder: number;
  recipeId: string;
  title: string;
  category: string | null;
  totalTimeMinutes: number | null;
  difficulty: string | null;
  servings: number;
  isFavorite: boolean;
  thumbnailUrl: string | null;
}

interface CollectionDetailClientProps {
  collection: CollectionData;
  initialRecipes: RecipeInCollection[];
}

// ── Sortierbare Rezept-Karte ─────────────────────────────────────────────────

function SortableRecipeCard({
  recipe,
  onRemove,
}: {
  recipe: RecipeInCollection;
  onRemove: (recipeId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: recipe.recipeId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`collection-recipe-${recipe.recipeId}`}
      className={[
        "bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] shadow-warm",
        "flex items-center gap-3 p-3 group transition-all",
        isDragging ? "shadow-warm-lg z-50" : "hover:shadow-warm-lg",
      ].join(" ")}
    >
      {/* Drag handle */}
      <div
        className="shrink-0 cursor-grab active:cursor-grabbing text-warm-400 hover:text-warm-600 touch-none"
        {...attributes}
        {...listeners}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 8h16M4 16h16"
          />
        </svg>
      </div>

      {/* Thumbnail */}
      <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-warm-100 dark:bg-warm-800">
        {recipe.thumbnailUrl ? (
          <Image
            src={recipe.thumbnailUrl}
            alt={recipe.title}
            width={56}
            height={56}
            sizes="56px"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <RecipeIcon className="w-6 h-6 text-warm-300" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/rezepte/${recipe.recipeId}`}
          className="text-sm font-semibold text-[var(--text-primary)] hover:text-terra-500 transition-colors line-clamp-1"
        >
          {recipe.title}
        </Link>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {recipe.category && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-terra-50 dark:bg-terra-950/30 text-terra-600 dark:text-terra-400 font-medium">
              {recipe.category}
            </span>
          )}
          {recipe.totalTimeMinutes && (
            <span className="text-xs text-[var(--text-muted)]">
              {recipe.totalTimeMinutes} Min.
            </span>
          )}
          {recipe.difficulty && (
            <span className="text-xs text-[var(--text-muted)]">
              {recipe.difficulty}
            </span>
          )}
        </div>
      </div>

      {/* Remove button */}
      <button
        data-testid={`remove-recipe-button-${recipe.recipeId}`}
        onClick={() => onRemove(recipe.recipeId)}
        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-warm-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
        title="Aus Sammlung entfernen"
        aria-label="Aus Sammlung entfernen"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export default function CollectionDetailClient({
  collection,
  initialRecipes,
}: CollectionDetailClientProps) {
  const router = useRouter();
  const [recipesList, setRecipesList] =
    useState<RecipeInCollection[]>(initialRecipes);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state
  const [formName, setFormName] = useState(collection.name);
  const [formDescription, setFormDescription] = useState(
    collection.description ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ── Remove recipe ────────────────────────────────────────────────────────

  const handleRemoveRecipe = useCallback(
    async (recipeId: string) => {
      const prev = [...recipesList];
      setRecipesList((list) => list.filter((r) => r.recipeId !== recipeId));

      try {
        const res = await fetch(`/api/collections/${collection.id}/rezepte`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipeId }),
        });
        if (!res.ok) throw new Error();
        toast.success("Rezept aus Sammlung entfernt.");
      } catch {
        setRecipesList(prev);
        toast.error("Fehler beim Entfernen des Rezepts.");
      }
    },
    [collection.id, recipesList],
  );

  // ── Reorder (DnD) ───────────────────────────────────────────────────────

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = recipesList.findIndex((r) => r.recipeId === active.id);
    const newIndex = recipesList.findIndex((r) => r.recipeId === over.id);
    const reordered = arrayMove(recipesList, oldIndex, newIndex);

    // Optimistic update
    const prev = [...recipesList];
    const updatedWithSortOrder = reordered.map((r, i) => ({
      ...r,
      sortOrder: i,
    }));
    setRecipesList(updatedWithSortOrder);

    try {
      const res = await fetch(`/api/collections/${collection.id}/rezepte`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: updatedWithSortOrder.map((r) => ({
            recipeId: r.recipeId,
            sortOrder: r.sortOrder,
          })),
        }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRecipesList(prev);
      toast.error("Sortierung konnte nicht gespeichert werden.");
    }
  }

  // ── Edit collection ──────────────────────────────────────────────────────

  function openEditDialog() {
    setFormName(collection.name);
    setFormDescription(collection.description ?? "");
    setShowEditDialog(true);
  }

  async function handleEdit() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || null,
        }),
      });
      if (!res.ok) throw new Error();
      setShowEditDialog(false);
      toast.success("Sammlung aktualisiert.");
      router.refresh();
    } catch {
      toast.error("Sammlung konnte nicht aktualisiert werden.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete collection ────────────────────────────────────────────────────

  async function handleDelete() {
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Sammlung gelöscht.");
      router.push("/sammlungen");
    } catch {
      toast.error("Sammlung konnte nicht gelöscht werden.");
    }
  }

  // ── PDF Export ──────────────────────────────────────────────────────────

  const handlePdfExport = useCallback(async () => {
    if (recipesList.length === 0) return;
    setExportingPdf(true);
    try {
      // Alle Rezeptdetails laden — bei Fehler Export abbrechen
      const fullRecipes: RecipeDetail[] = [];
      const failedRecipes: string[] = [];
      for (const r of recipesList) {
        const res = await fetch(`/api/recipes/${r.recipeId}`);
        if (res.ok) {
          const data = await res.json();
          fullRecipes.push(data);
        } else {
          failedRecipes.push(r.title ?? r.recipeId);
        }
      }

      if (failedRecipes.length > 0) {
        toast.error(
          `${failedRecipes.length} Rezept(e) konnten nicht geladen werden: ${failedRecipes.join(", ")}. Export abgebrochen.`
        );
        return;
      }

      if (fullRecipes.length === 0) {
        toast.error("Keine Rezepte konnten geladen werden.");
        return;
      }

      const { generateCollectionPdf } = await import(
        "@/components/recipes/RecipePdf"
      );
      const blob = await generateCollectionPdf({
        collectionName: collection.name,
        recipes: fullRecipes.map((r) => ({
          recipe: r,
          targetServings: r.servings,
          originalServings: r.servings,
          includeImage: true,
        })),
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${collection.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF wurde erstellt.");
    } catch (err) {
      console.error("PDF-Export fehlgeschlagen:", err);
      toast.error("PDF-Export fehlgeschlagen.");
    } finally {
      setExportingPdf(false);
    }
  }, [recipesList, collection.name]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      data-testid="collection-detail-page"
      className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full"
    >
      {/* Back link */}
      <Link
        href="/sammlungen"
        className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-terra-500 transition-colors mb-4"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Zurück zu Sammlungen
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1
            data-testid="collection-detail-name"
            className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] break-words"
          >
            {collection.name}
          </h1>
          {collection.description && (
            <p className="mt-2 text-[var(--text-secondary)]">
              {collection.description}
            </p>
          )}
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {recipesList.length}{" "}
            {recipesList.length === 1 ? "Rezept" : "Rezepte"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            data-testid="collection-pdf-export"
            variant="outline"
            size="sm"
            onClick={() => void handlePdfExport()}
            disabled={exportingPdf || recipesList.length === 0}
          >
            {exportingPdf ? "Wird erstellt…" : "PDF exportieren"}
          </Button>
          <Button
            data-testid="edit-collection-button"
            variant="outline"
            size="sm"
            onClick={openEditDialog}
            icon={<PencilIcon />}
          >
            Bearbeiten
          </Button>
          <Button
            data-testid="delete-collection-button"
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            icon={<TrashIcon />}
          >
            Löschen
          </Button>
        </div>
      </div>

      {/* Recipe list with DnD */}
      {recipesList.length === 0 ? (
        <div className="text-center py-16">
          <RecipeIcon className="w-16 h-16 mx-auto text-warm-300 mb-4" />
          <p className="text-[var(--text-secondary)]">
            Diese Sammlung enthält noch keine Rezepte.
          </p>
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            void handleDragEnd(e);
          }}
        >
          <SortableContext
            items={recipesList.map((r) => r.recipeId)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {recipesList.map((recipe) => (
                <SortableRecipeCard
                  key={recipe.recipeId}
                  recipe={recipe}
                  onRemove={(id) => {
                    void handleRemoveRecipe(id);
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Edit Dialog */}
      <Modal
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        title="Sammlung bearbeiten"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEditDialog(false)}
            >
              Abbrechen
            </Button>
            <Button
              size="sm"
              onClick={() => {
                void handleEdit();
              }}
              loading={saving}
              disabled={!formName.trim()}
            >
              Speichern
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Name
            </label>
            <input
              data-testid="collection-name-input"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Sammlungsname"
              maxLength={255}
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-base)] rounded-lg px-3.5 py-2.5 text-sm placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-terra-500 focus:border-terra-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Beschreibung (optional)
            </label>
            <textarea
              data-testid="collection-description-input"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Worum geht es in dieser Sammlung?"
              maxLength={1000}
              rows={3}
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-base)] rounded-lg px-3.5 py-2.5 text-sm placeholder:text-warm-400 focus:outline-none focus:ring-2 focus:ring-terra-500 focus:border-terra-500 transition-all resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Sammlung löschen"
        message={`Möchten Sie die Sammlung "${collection.name}" wirklich löschen? Die Rezepte werden nicht gelöscht.`}
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        onConfirm={() => {
          void handleDelete();
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function RecipeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    </svg>
  );
}
