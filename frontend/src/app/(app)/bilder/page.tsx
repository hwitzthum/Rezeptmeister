"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import ImageUploadZone, { type UploadedImage } from "@/components/images/ImageUploadZone";
import { ConfirmDialog, Button, Modal } from "@/components/ui";
import { formatDate, formatBytes } from "@/lib/format";
import OcrPreviewPanel, { type OcrResult } from "@/components/ocr/OcrPreviewPanel";

type FilterMode = "alle" | "zugeordnet" | "unzugeordnet";
type OcrState = "idle" | "running" | "done" | "error";

interface RecipeSummary {
  id: string;
  title: string;
}

export default function BilderPage() {
  const router = useRouter();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterMode>("alle");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<UploadedImage | null>(null);
  const [imageToDelete, setImageToDelete] = useState<UploadedImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [assigning, setAssigning] = useState(false);

  // OCR-Status
  const [ocrState, setOcrState] = useState<OcrState>("idle");
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);

  // Defer recipes fetch until the detail panel opens for the first time
  useEffect(() => {
    if (!selectedImage || recipes.length > 0) return;
    fetch("/api/recipes?limit=50")
      .then((r) => r.json())
      .then((data) => setRecipes(data.recipes ?? []))
      .catch(() => {});
  }, [selectedImage, recipes.length]);

  const loadImages = useCallback(
    async (pageNum: number, currentFilter: FilterMode, append: boolean) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ seite: String(pageNum), limit: "20" });
        if (currentFilter === "unzugeordnet") params.set("unzugeordnet", "true");
        if (currentFilter === "zugeordnet") params.set("unzugeordnet", "false");

        const res = await fetch(`/api/images?${params.toString()}`);
        if (!res.ok) throw new Error();
        const data = await res.json() as { images: UploadedImage[]; hasMore: boolean };

        setImages((prev) => (append ? [...prev, ...data.images] : data.images));
        setHasMore(data.hasMore);
      } catch {
        toast.error("Bilder konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    void loadImages(1, filter, false);
  }, [filter, loadImages]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    void loadImages(next, filter, true);
  }

  function handleUploadComplete(image: UploadedImage) {
    setImages((prev) => [image, ...prev]);
    setShowUploadModal(false);
    toast.success("Bild hochgeladen.");
  }

  async function confirmDelete() {
    if (!imageToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/images/${imageToDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setImages((prev) => prev.filter((img) => img.id !== imageToDelete.id));
      if (selectedImage?.id === imageToDelete.id) setSelectedImage(null);
      toast.success("Bild gelöscht.");
    } catch {
      toast.error("Bild konnte nicht gelöscht werden.");
    } finally {
      setDeleting(false);
      setImageToDelete(null);
    }
  }

  async function assignToRecipe(imageId: string, recipeId: string | null) {
    setAssigning(true);
    try {
      const res = await fetch(`/api/images/${imageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as UploadedImage;
      setImages((prev) => prev.map((img) => (img.id === imageId ? updated : img)));
      if (selectedImage?.id === imageId) setSelectedImage(updated);
      toast.success(recipeId ? "Bild zugeordnet." : "Zuordnung aufgehoben.");
    } catch {
      toast.error("Zuordnung fehlgeschlagen.");
    } finally {
      setAssigning(false);
    }
  }

  async function runOcr(image: UploadedImage) {
    setOcrState("running");
    setOcrResult(null);
    setShowOcrModal(true);
    try {
      const res = await fetch("/api/ai/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: image.id }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "OCR fehlgeschlagen.");
      }
      const data = (await res.json()) as OcrResult;
      setOcrResult(data);
      setOcrState("done");
    } catch (err) {
      setOcrState("error");
      toast.error(err instanceof Error ? err.message : "OCR fehlgeschlagen.");
      setShowOcrModal(false);
    }
  }

  function handleOcrSaved(recipeId: string) {
    setShowOcrModal(false);
    setOcrState("idle");
    setOcrResult(null);
    setSelectedImage(null);
    router.push(`/rezepte/${recipeId}`);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <h1
            className="text-lg font-semibold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Bildergalerie
          </h1>
          <Button variant="primary" size="sm" onClick={() => setShowUploadModal(true)}>
            Bild hochladen
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Filter-Tabs */}
        <div className="flex gap-2 mb-6">
          {(["alle", "zugeordnet", "unzugeordnet"] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                filter === f
                  ? "bg-terra-500 text-white"
                  : "bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-warm-100",
              ].join(" ")}
            >
              {f === "alle" ? "Alle" : f === "zugeordnet" ? "Zugeordnet" : "Nicht zugeordnet"}
            </button>
          ))}
        </div>

        {/* Bild-Raster */}
        {loading && images.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-warm-100 animate-pulse" />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="text-center py-20">
            <PhotoIcon className="w-16 h-16 text-terra-200 mx-auto mb-4" />
            <p className="text-[var(--text-muted)]">Noch keine Bilder vorhanden.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowUploadModal(true)}>
              Erstes Bild hochladen
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((image) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImage(image)}
                  className={[
                    "relative aspect-square rounded-xl overflow-hidden border-2 transition-all",
                    "hover:shadow-warm focus:outline-none focus:ring-2 focus:ring-terra-400",
                    selectedImage?.id === image.id ? "border-terra-500" : "border-transparent",
                  ].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.thumbnailUrl}
                    alt={image.altText ?? image.fileName ?? "Bild"}
                    className="w-full h-full object-cover"
                  />
                  {image.isPrimary && (
                    <div className="absolute top-1 left-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-terra-500 text-white">
                        Hauptbild
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {hasMore && (
              <div className="text-center mt-8">
                <Button variant="outline" onClick={loadMore} disabled={loading}>
                  {loading ? "Laden …" : "Mehr laden"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bild-Detail-Modal */}
      <Modal
        open={selectedImage !== null}
        onClose={() => setSelectedImage(null)}
        title={selectedImage?.fileName ?? "Bild"}
        size="xl"
      >
        {selectedImage && (
          <div className="space-y-4">
            <div className="aspect-video bg-warm-50 rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage.filePath}
                alt={selectedImage.altText ?? selectedImage.fileName ?? "Bild"}
                className="w-full h-full object-contain"
              />
            </div>

            <p className="text-sm text-[var(--text-secondary)]">
              {formatBytes(selectedImage.fileSizeBytes)}
              {selectedImage.width && selectedImage.height
                ? ` · ${selectedImage.width} × ${selectedImage.height} px`
                : ""}
              {" · "}{formatDate(selectedImage.createdAt)}
            </p>

            <div>
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Rezept
              </label>
              <select
                value={selectedImage.recipeId ?? ""}
                onChange={(e) => assignToRecipe(selectedImage.id, e.target.value || null)}
                disabled={assigning}
                className="mt-1 w-full text-sm border border-[var(--border-base)] rounded-lg px-3 py-2 bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-terra-400"
              >
                <option value="">Keinem Rezept zugeordnet</option>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>

            {/* OCR-Aktion */}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--border-subtle)]">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Rezept aus Bild extrahieren</p>
                <p className="text-xs text-[var(--text-muted)]">KI liest den Rezepttext und erstellt ein neues Rezept</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { void runOcr(selectedImage); }}
                disabled={ocrState === "running"}
              >
                {ocrState === "running" ? "Wird analysiert …" : "OCR starten"}
              </Button>
            </div>

            <div className="flex justify-end">
              <Button
                variant="danger"
                size="sm"
                onClick={() => setImageToDelete(selectedImage)}
              >
                Löschen
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* OCR-Vorschau-Modal */}
      <Modal
        open={showOcrModal}
        onClose={() => {
          if (ocrState !== "running") {
            setShowOcrModal(false);
            setOcrState("idle");
            setOcrResult(null);
          }
        }}
        title="Rezept aus Bild extrahiert"
        size="xl"
      >
        {ocrState === "running" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 rounded-full border-4 border-terra-200 border-t-terra-500 animate-spin" />
            <p className="text-sm text-[var(--text-muted)]">
              KI analysiert das Bild … Dies kann einige Sekunden dauern.
            </p>
          </div>
        )}
        {ocrState === "done" && ocrResult && selectedImage && (
          <OcrPreviewPanel
            result={ocrResult}
            imageId={selectedImage.id}
            onSaved={handleOcrSaved}
            onClose={() => {
              setShowOcrModal(false);
              setOcrState("idle");
              setOcrResult(null);
            }}
          />
        )}
      </Modal>

      {/* Upload-Modal */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Bild hochladen"
        size="md"
      >
        <ImageUploadZone onUploadComplete={handleUploadComplete} />
      </Modal>

      {/* Lösch-Dialog */}
      <ConfirmDialog
        open={imageToDelete !== null}
        title="Bild löschen"
        message="Möchten Sie dieses Bild wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        variant="danger"
        loading={deleting}
        onConfirm={() => { void confirmDelete(); }}
        onClose={() => setImageToDelete(null)}
      />
    </div>
  );
}

function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
