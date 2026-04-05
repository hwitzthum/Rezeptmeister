"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Button, Modal, ConfirmDialog } from "@/components/ui";

// ── Typen ────────────────────────────────────────────────────────────────────

interface CollectionSummary {
  id: string;
  name: string;
  description: string | null;
  recipeCount: number;
  coverImageUrl: string | null;
  createdAt: string;
}

interface CollectionsClientProps {
  initialCollections: CollectionSummary[];
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

export default function CollectionsClient({
  initialCollections,
}: CollectionsClientProps) {
  const [collectionsList, setCollectionsList] =
    useState<CollectionSummary[]>(initialCollections);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCollection, setEditingCollection] =
    useState<CollectionSummary | null>(null);
  const [deletingCollection, setDeletingCollection] =
    useState<CollectionSummary | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Create ───────────────────────────────────────────────────────────────

  function openCreateDialog() {
    setFormName("");
    setFormDescription("");
    setShowCreateDialog(true);
  }

  async function handleCreate() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler");
      }
      const created = await res.json();
      setCollectionsList((prev) => [
        {
          id: created.id,
          name: created.name,
          description: created.description,
          recipeCount: 0,
          coverImageUrl: null,
          createdAt: created.createdAt,
        },
        ...prev,
      ]);
      setShowCreateDialog(false);
      toast.success("Sammlung erstellt.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Sammlung konnte nicht erstellt werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Edit ─────────────────────────────────────────────────────────────────

  function openEditDialog(collection: CollectionSummary) {
    setFormName(collection.name);
    setFormDescription(collection.description ?? "");
    setEditingCollection(collection);
  }

  async function handleUpdate() {
    if (!editingCollection || !formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${editingCollection.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Fehler");
      }
      const updated = await res.json();
      setCollectionsList((prev) =>
        prev.map((c) =>
          c.id === editingCollection.id
            ? { ...c, name: updated.name, description: updated.description }
            : c,
        ),
      );
      setEditingCollection(null);
      toast.success("Sammlung aktualisiert.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Sammlung konnte nicht aktualisiert werden.",
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deletingCollection) return;
    try {
      const res = await fetch(`/api/collections/${deletingCollection.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setCollectionsList((prev) =>
        prev.filter((c) => c.id !== deletingCollection.id),
      );
      setDeletingCollection(null);
      toast.success("Sammlung geloescht.");
    } catch {
      toast.error("Sammlung konnte nicht geloescht werden.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div data-testid="collections-page" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Sammlungen
        </h1>
        <Button
          data-testid="create-collection-button"
          onClick={openCreateDialog}
          icon={<PlusIcon />}
        >
          Neue Sammlung
        </Button>
      </div>

      {/* Grid or empty state */}
      {collectionsList.length === 0 ? (
        <div className="text-center py-16">
          <FolderIcon className="w-16 h-16 mx-auto text-warm-300 mb-4" />
          <p className="text-[var(--text-secondary)] mb-4">
            Noch keine Sammlungen erstellt. Erstellen Sie Ihre erste Sammlung!
          </p>
          <Button onClick={openCreateDialog} icon={<PlusIcon />}>
            Neue Sammlung
          </Button>
        </div>
      ) : (
        <div
          data-testid="collections-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {collectionsList.map((collection) => (
            <div
              key={collection.id}
              data-testid={`collection-card-${collection.id}`}
              className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden group relative transition-all hover:shadow-warm-lg"
            >
              {/* Cover image or placeholder */}
              <Link href={`/sammlungen/${collection.id}`}>
                <div className="h-36 bg-gradient-to-br from-terra-100 to-warm-100 relative overflow-hidden">
                  {collection.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={collection.coverImageUrl}
                      alt={collection.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FolderIcon className="w-12 h-12 text-terra-300" />
                    </div>
                  )}
                </div>
              </Link>

              {/* Content */}
              <div className="p-4">
                <Link href={`/sammlungen/${collection.id}`}>
                  <h2
                    className="text-lg font-semibold text-[var(--text-primary)] hover:text-terra-500 transition-colors line-clamp-1"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {collection.name}
                  </h2>
                </Link>
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-terra-50 text-terra-600">
                  {collection.recipeCount}{" "}
                  {collection.recipeCount === 1 ? "Rezept" : "Rezepte"}
                </span>
                {collection.description && (
                  <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-1">
                    {collection.description}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    openEditDialog(collection);
                  }}
                  className="w-8 h-8 rounded-lg bg-[var(--bg-surface)]/80 backdrop-blur-sm flex items-center justify-center text-warm-500 hover:text-terra-500 hover:bg-[var(--bg-surface)] transition-all shadow-sm"
                  title="Bearbeiten"
                  aria-label="Bearbeiten"
                >
                  <PencilIcon />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setDeletingCollection(collection);
                  }}
                  className="w-8 h-8 rounded-lg bg-[var(--bg-surface)]/80 backdrop-blur-sm flex items-center justify-center text-warm-500 hover:text-red-500 hover:bg-[var(--bg-surface)] transition-all shadow-sm"
                  title="Loeschen"
                  aria-label="Loeschen"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Modal
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title="Neue Sammlung"
        data-testid="create-collection-dialog"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCreateDialog(false)}
            >
              Abbrechen
            </Button>
            <Button
              data-testid="collection-save-button"
              size="sm"
              onClick={() => {
                void handleCreate();
              }}
              loading={saving}
              disabled={!formName.trim()}
            >
              Erstellen
            </Button>
          </>
        }
      >
        <div data-testid="create-collection-dialog" className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Name
            </label>
            <input
              data-testid="collection-name-input"
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="z.B. Feierabend-Rezepte"
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

      {/* Edit Dialog */}
      <Modal
        open={editingCollection !== null}
        onClose={() => setEditingCollection(null)}
        title="Sammlung bearbeiten"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingCollection(null)}
            >
              Abbrechen
            </Button>
            <Button
              data-testid="collection-save-button"
              size="sm"
              onClick={() => {
                void handleUpdate();
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
        open={deletingCollection !== null}
        title="Sammlung loeschen"
        message={`Moechten Sie die Sammlung "${deletingCollection?.name ?? ""}" wirklich loeschen? Die Rezepte werden nicht geloescht.`}
        confirmLabel="Loeschen"
        cancelLabel="Abbrechen"
        variant="danger"
        onConfirm={() => {
          void handleDelete();
        }}
        onClose={() => setDeletingCollection(null)}
      />
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function FolderIcon({ className = "w-5 h-5" }: { className?: string }) {
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
