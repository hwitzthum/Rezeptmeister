"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Note {
  id: string;
  content: string;
  noteType: "tipp" | "variation" | "erinnerung" | "bewertung" | "allgemein";
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

type NoteType = Note["noteType"];
type TabKey = "alle" | NoteType;

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "alle", label: "Alle" },
  { key: "tipp", label: "Tipp" },
  { key: "variation", label: "Variation" },
  { key: "erinnerung", label: "Erinnerung" },
  { key: "bewertung", label: "Bewertung" },
  { key: "allgemein", label: "Allgemein" },
];

const TYPE_LABELS: Record<NoteType, string> = {
  tipp: "Tipp",
  variation: "Variation",
  erinnerung: "Erinnerung",
  bewertung: "Bewertung",
  allgemein: "Allgemein",
};

const TYPE_BADGE: Record<NoteType, string> = {
  tipp: "bg-sky-50 text-sky-700 border-sky-200",
  variation: "bg-violet-50 text-violet-700 border-violet-200",
  erinnerung: "bg-amber-50 text-amber-700 border-amber-200",
  bewertung: "bg-[#FDF8E7] text-[#9A7A1A] border-[#E8D88A]",
  allgemein: "bg-warm-100 text-warm-600 border-warm-200",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Monaten`;
  return `vor ${Math.floor(days / 365)} Jahren`;
}

// ── Star Components ───────────────────────────────────────────────────────────

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg
          key={s}
          className={`w-3.5 h-3.5 ${s <= rating ? "text-[#D4A843]" : "text-warm-200"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-xs font-medium text-[#9A7A1A]">{rating}/5</span>
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Bewertung auswählen">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`${s} Stern${s !== 1 ? "e" : ""}`}
          className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A843] rounded"
        >
          <svg
            className={`w-6 h-6 transition-colors ${
              s <= (hovered || value) ? "text-[#D4A843]" : "text-warm-200"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
      {value > 0 && (
        <span className="ml-1 text-sm font-semibold text-[#9A7A1A]">{value}/5</span>
      )}
    </div>
  );
}

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  recipeId,
  onUpdated,
  onDeleted,
}: {
  note: Note;
  recipeId: string;
  onUpdated: (updated: Note) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  const [editType, setEditType] = useState<NoteType>(note.noteType);
  const [editRating, setEditRating] = useState(note.rating ?? 0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/notes/${recipeId}/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editContent.trim(),
          noteType: editType,
          rating: editType === "bewertung" && editRating > 0 ? editRating : null,
        }),
      });
      if (!res.ok) throw new Error();
      const updated: Note = await res.json();
      onUpdated(updated);
      setEditing(false);
      toast.success("Notiz gespeichert.");
    } catch {
      toast.error("Notiz konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${recipeId}/${note.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      onDeleted(note.id);
      toast.success("Notiz gelöscht.");
    } catch {
      toast.error("Notiz konnte nicht gelöscht werden.");
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-4 shadow-sm">
        <div className="flex gap-2 mb-3">
          <select
            value={editType}
            onChange={(e) => setEditType(e.target.value as NoteType)}
            className="px-2.5 py-1.5 rounded-lg text-sm bg-[var(--bg-subtle)] border border-[var(--border-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400"
          >
            {(Object.entries(TYPE_LABELS) as [NoteType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {editType === "bewertung" && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Bewertung
            </label>
            <StarPicker value={editRating} onChange={setEditRating} />
          </div>
        )}

        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-subtle)] border border-[var(--border-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-terra-400 resize-none"
        />

        <div className="flex gap-2 mt-3">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !editContent.trim()}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-terra-600 text-white hover:bg-terra-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Speichern…" : "Speichern"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setEditContent(note.content);
              setEditType(note.noteType);
              setEditRating(note.rating ?? 0);
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-base)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm hover:shadow-warm transition-shadow">
      {/* Top row: badge + date */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span
          className={[
            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
            TYPE_BADGE[note.noteType],
          ].join(" ")}
        >
          {TYPE_LABELS[note.noteType]}
        </span>
        <span className="text-xs text-[var(--text-muted)] shrink-0">
          {relativeDate(note.updatedAt !== note.createdAt ? note.updatedAt : note.createdAt)}
        </span>
      </div>

      {/* Star rating */}
      {note.rating !== null && (
        <div className="mb-2">
          <StarDisplay rating={note.rating} />
        </div>
      )}

      {/* Content */}
      <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">
        {note.content}
      </p>

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-[var(--text-secondary)] hover:text-terra-600 transition-colors flex items-center gap-1"
        >
          <PencilIcon className="w-3 h-3" />
          Bearbeiten
        </button>
        <button
          onClick={() => void handleDelete()}
          disabled={deleting}
          className="text-xs text-[var(--text-muted)] hover:text-red-600 transition-colors flex items-center gap-1 disabled:opacity-40"
        >
          <TrashIcon className="w-3 h-3" />
          {deleting ? "Löschen…" : "Löschen"}
        </button>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function NotesSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map((n) => (
        <div key={n} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex justify-between mb-3">
            <div className="h-5 w-20 bg-warm-100 rounded-md" />
            <div className="h-4 w-14 bg-warm-100 rounded" />
          </div>
          <div className="h-4 bg-warm-100 rounded mb-2 w-full" />
          <div className="h-4 bg-warm-100 rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NotesPanel({ recipeId }: { recipeId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("alle");

  // Create form state
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<NoteType>("allgemein");
  const [newRating, setNewRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // ── Load notes ──────────────────────────────────────────────────────────────

  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/notes/${recipeId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNotes(data.notes);
    } catch {
      toast.error("Notizen konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  // ── Create note ─────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/notes/${recipeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent.trim(),
          noteType: newType,
          rating: newType === "bewertung" && newRating > 0 ? newRating : null,
        }),
      });
      if (!res.ok) throw new Error();
      const created: Note = await res.json();
      // Batch all state resets together so the form re-enables in the same render
      setNotes((prev) => [...prev, created]);
      setNewContent("");
      setNewRating(0);
      setSubmitting(false);
      toast.success("Notiz hinzugefügt.");
    } catch {
      toast.error("Notiz konnte nicht gespeichert werden.");
      setSubmitting(false);
    }
  }

  // ── Filter notes ────────────────────────────────────────────────────────────

  const filtered =
    activeTab === "alle" ? notes : notes.filter((n) => n.noteType === activeTab);

  const tabCount = (key: TabKey) =>
    key === "alle" ? notes.length : notes.filter((n) => n.noteType === key).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section
      className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] shadow-warm overflow-hidden"
      data-testid="notes-panel"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <BookmarkIcon className="w-5 h-5 text-terra-500" />
          <h2
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Notizen & Bewertungen
          </h2>
          {notes.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-terra-100 text-terra-700">
              {notes.length}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-0.5 scrollbar-none -mb-px">
          {TABS.filter((t) => tabCount(t.key) > 0 || t.key === "alle").map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0",
                activeTab === tab.key
                  ? "bg-terra-600 text-white shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              {tab.label}
              {tabCount(tab.key) > 0 && (
                <span
                  className={[
                    "px-1.5 py-0 rounded-full text-xs font-bold tabular-nums",
                    activeTab === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-warm-200 text-warm-600",
                  ].join(" ")}
                >
                  {tabCount(tab.key)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Note list */}
      <div className="px-5 py-4">
        {loading ? (
          <NotesSkeleton />
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
              <PencilLineIcon className="w-6 h-6 text-warm-400" />
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {activeTab === "alle"
                ? "Noch keine Notizen. Fügen Sie Ihre erste Notiz hinzu."
                : `Keine ${TABS.find((t) => t.key === activeTab)?.label ?? ""}-Notizen vorhanden.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                recipeId={recipeId}
                onUpdated={(updated) =>
                  setNotes((prev) =>
                    prev.map((n) => (n.id === updated.id ? updated : n)),
                  )
                }
                onDeleted={(id) =>
                  setNotes((prev) => prev.filter((n) => n.id !== id))
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Create form */}
      <form
        onSubmit={(e) => void handleCreate(e)}
        className="px-5 pb-5 pt-4 border-t border-[var(--border-subtle)] bg-[var(--bg-subtle)]"
      >
        <p
          className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3"
          style={{ letterSpacing: "0.08em" }}
        >
          Neue Notiz
        </p>

        <div className="flex gap-2 mb-3">
          <select
            value={newType}
            onChange={(e) => {
              setNewType(e.target.value as NoteType);
              if (e.target.value !== "bewertung") setNewRating(0);
            }}
            className="flex-1 px-2.5 py-1.5 rounded-lg text-sm bg-[var(--bg-surface)] border border-[var(--border-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400"
            aria-label="Notiztyp"
          >
            {(Object.entries(TYPE_LABELS) as [NoteType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {newType === "bewertung" && (
          <div className="mb-3">
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Bewertung
            </label>
            <StarPicker value={newRating} onChange={setNewRating} />
          </div>
        )}

        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Ihre Notiz zum Rezept…"
          rows={3}
          required
          className={[
            "w-full px-3 py-2 rounded-lg text-sm mb-3",
            "bg-[var(--bg-surface)] border border-[var(--border-base)]",
            "text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
            "focus:outline-none focus:ring-2 focus:ring-terra-400 focus:border-terra-400",
            "resize-none",
          ].join(" ")}
          data-testid="note-content-input"
        />

        <button
          type="submit"
          disabled={submitting || !newContent.trim()}
          className={[
            "w-full py-2 rounded-xl text-sm font-medium transition-all",
            "bg-terra-600 text-white hover:bg-terra-700",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "shadow-sm hover:shadow-md",
          ].join(" ")}
          data-testid="note-submit-btn"
        >
          {submitting ? "Speichern…" : "Notiz speichern"}
        </button>
      </form>
    </section>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function BookmarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  );
}

function PencilLineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}
