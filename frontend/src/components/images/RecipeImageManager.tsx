"use client";

import { useState } from "react";
import Image from "next/image";
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
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import toast from "react-hot-toast";
import ImageUploadZone, { type UploadedImage } from "./ImageUploadZone";
import { ConfirmDialog } from "@/components/ui";

// ── Typen ─────────────────────────────────────────────────────────────────────

interface RecipeImageManagerProps {
  recipeId: string;
  initialImages: UploadedImage[];
}

// ── Sortierbare Bild-Karte ────────────────────────────────────────────────────

function SortableImageCard({
  image,
  onSetPrimary,
  onDelete,
  isSelected,
  onToggleSelect,
}: {
  image: UploadedImage;
  onSetPrimary: (id: string) => void;
  onDelete: (image: UploadedImage) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "relative group rounded-xl overflow-hidden border-2 transition-all",
        isSelected ? "border-terra-500" : "border-transparent hover:border-warm-200",
        isDragging ? "shadow-warm z-50" : "",
      ].join(" ")}
    >
      {/* Thumbnail */}
      <div
        className="relative w-full aspect-square bg-warm-100 dark:bg-warm-800 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <Image
          src={image.thumbnailUrl}
          alt={image.altText ?? image.fileName ?? "Bild"}
          fill
          sizes="150px"
          className="object-cover"
          draggable={false}
        />
      </div>

      {/* Hauptbild-Badge */}
      {image.isPrimary && (
        <div className="absolute top-1.5 left-1.5">
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-terra-500 text-white shadow-sm">
            Hauptbild
          </span>
        </div>
      )}

      {/* Auswahl-Checkbox */}
      <div className="absolute top-1.5 right-1.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(image.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Bild auswählen"
          className="w-4 h-4 rounded accent-terra-500"
        />
      </div>

      {/* Aktionen (erscheinen bei Hover) */}
      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        {!image.isPrimary && image.recipeId && (
          <button
            onClick={() => onSetPrimary(image.id)}
            title="Als Hauptbild setzen"
            className="flex-1 text-[10px] font-medium text-white bg-terra-500/90 rounded-md py-1 hover:bg-terra-600 transition-colors"
          >
            Hauptbild
          </button>
        )}
        <button
          onClick={() => onDelete(image)}
          title="Bild löschen"
          aria-label="Bild löschen"
          className="w-6 h-6 flex items-center justify-center text-white bg-red-500/80 rounded-md hover:bg-red-600 transition-colors shrink-0"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function RecipeImageManager({
  recipeId,
  initialImages,
}: RecipeImageManagerProps) {
  const [imageList, setImageList] = useState<UploadedImage[]>(initialImages);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageToDelete, setImageToDelete] = useState<UploadedImage | null>(null);
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Upload ────────────────────────────────────────────────────────────────

  function handleUploadComplete(uploaded: UploadedImage) {
    // recipeId is assigned server-side during upload — response already contains it
    setImageList((prev) => [uploaded, ...prev]);
    toast.success("Bild hochgeladen.");
  }

  // ── Drag-and-Drop Sortierung (nur visuell, kein DB-Persist in Phase 4) ─────

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setImageList((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  // ── Als Hauptbild setzen ──────────────────────────────────────────────────

  async function handleSetPrimary(imageId: string) {
    try {
      const res = await fetch(`/api/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!res.ok) throw new Error();

      setImageList((prev) =>
        prev.map((img) => ({
          ...img,
          isPrimary: img.id === imageId,
        })),
      );
      toast.success("Hauptbild gesetzt.");
    } catch {
      toast.error("Fehler beim Setzen des Hauptbildes.");
    }
  }

  // ── Einzelnes Bild löschen ────────────────────────────────────────────────

  async function confirmDeleteSingle() {
    if (!imageToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/images/${imageToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setImageList((prev) => prev.filter((img) => img.id !== imageToDelete.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(imageToDelete.id);
        return next;
      });
      toast.success("Bild gelöscht.");
    } catch {
      toast.error("Bild konnte nicht gelöscht werden.");
    } finally {
      setDeleting(false);
      setImageToDelete(null);
    }
  }

  // ── Batch-Löschen ─────────────────────────────────────────────────────────

  async function confirmBatchDelete() {
    setDeleting(true);
    const ids = Array.from(selectedIds);

    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/images/${id}`, { method: "DELETE" })),
    );

    const succeeded = ids.filter(
      (_, i) =>
        results[i].status === "fulfilled" &&
        (results[i] as PromiseFulfilledResult<Response>).value.ok,
    );
    const failedCount = ids.length - succeeded.length;

    // Single state update for all deletions
    if (succeeded.length > 0) {
      const deletedSet = new Set(succeeded);
      setImageList((prev) => prev.filter((img) => !deletedSet.has(img.id)));
    }

    setSelectedIds(new Set());
    setDeleting(false);
    setShowBatchDeleteDialog(false);

    if (failedCount === 0) {
      toast.success(`${ids.length} Bild${ids.length !== 1 ? "er" : ""} gelöscht.`);
    } else {
      toast.error(`${failedCount} Bild${failedCount !== 1 ? "er" : ""} konnten nicht gelöscht werden.`);
    }
  }

  // ── Auswahl ───────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === imageList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(imageList.map((i) => i.id)));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Upload-Zone */}
      <ImageUploadZone
        recipeId={recipeId}
        onUploadComplete={handleUploadComplete}
      />

      {imageList.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.size === imageList.length && imageList.length > 0}
                onChange={toggleSelectAll}
                aria-label="Alle Bilder auswählen"
                className="w-4 h-4 rounded accent-terra-500"
              />
              Alle auswählen
            </label>

            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowBatchDeleteDialog(true)}
                className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1 transition-colors"
              >
                <TrashIcon />
                {selectedIds.size} löschen
              </button>
            )}

            <span className="ml-auto text-xs text-[var(--text-muted)]">
              {imageList.length} Bild{imageList.length !== 1 ? "er" : ""}
            </span>
          </div>

          {/* Bild-Raster mit Drag-and-Drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={imageList.map((i) => i.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {imageList.map((image) => (
                  <SortableImageCard
                    key={image.id}
                    image={image}
                    onSetPrimary={handleSetPrimary}
                    onDelete={setImageToDelete}
                    isSelected={selectedIds.has(image.id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {imageList.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">
          Noch keine Bilder vorhanden. Laden Sie oben ein Bild hoch.
        </p>
      )}

      {/* Einzel-Lösch-Dialog */}
      <ConfirmDialog
        open={imageToDelete !== null}
        title="Bild löschen"
        message="Möchten Sie dieses Bild wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        loading={deleting}
        onConfirm={() => { void confirmDeleteSingle(); }}
        onClose={() => setImageToDelete(null)}
      />

      {/* Batch-Lösch-Dialog */}
      <ConfirmDialog
        open={showBatchDeleteDialog}
        title="Bilder löschen"
        message={`Möchten Sie ${selectedIds.size} Bild${selectedIds.size !== 1 ? "er" : ""} wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        loading={deleting}
        onConfirm={() => { void confirmBatchDelete(); }}
        onClose={() => setShowBatchDeleteDialog(false)}
      />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
