"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button } from "@/components/ui";
import OcrPreviewPanel, { type OcrResult } from "@/components/ocr/OcrPreviewPanel";

interface UrlImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
}

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function UrlImportDialog({
  isOpen,
  onClose,
  initialUrl = "",
}: UrlImportDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<"url" | "preview">("url");
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedData, setImportedData] = useState<OcrResult | null>(null);
  const [importedImageId, setImportedImageId] = useState<string | null>(null);

  // Sync initialUrl when dialog opens with a pre-filled URL
  // (handled via key reset in parent or direct prop — just keep url in sync)

  async function handleImport() {
    if (!url.trim()) {
      setError("Bitte eine URL eingeben.");
      return;
    }
    if (!isValidUrl(url.trim())) {
      setError("Ungültige URL. Bitte eine vollständige URL eingeben (z.B. https://…).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(
          data.error ?? "Import fehlgeschlagen. Bitte überprüfen Sie die URL.",
        );
      }
      const data = (await res.json()) as OcrResult & { imageId?: string | null };
      setImportedImageId(data.imageId ?? null);
      setImportedData(data);
      setStep("preview");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Import fehlgeschlagen. Bitte versuchen Sie es erneut.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep("url");
    setUrl(initialUrl);
    setError(null);
    setImportedData(null);
    setImportedImageId(null);
    onClose();
  }

  function handleBack() {
    setStep("url");
    setError(null);
  }

  function handleSaved(recipeId: string) {
    handleClose();
    router.push(`/rezepte/${recipeId}`);
  }

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Rezept von URL importieren"
      description="Geben Sie die Adresse einer Rezeptseite ein. Die KI extrahiert das Rezept automatisch."
      size="xl"
    >
      {step === "url" && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Rezept-URL
            </label>
            <input
              type="url"
              placeholder="https://www.beispiel.ch/rezepte/mein-rezept"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleImport();
              }}
              disabled={loading}
              className={[
                "w-full border rounded-lg px-3.5 py-2.5 text-sm",
                "bg-[var(--bg-surface)] text-[var(--text-primary)]",
                "placeholder:text-warm-400",
                "focus:outline-none focus:ring-2 focus:ring-terra-500",
                "transition-all duration-150",
                error
                  ? "border-red-400 focus:ring-red-400"
                  : "border-[var(--border-base)] hover:border-[var(--border-strong)]",
              ].join(" ")}
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-500" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onClick={() => { void handleImport(); }}
            >
              {loading ? "Importiere…" : "Importieren"}
            </Button>
          </div>
        </div>
      )}

      {step === "preview" && importedData && (
        <div className="space-y-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-terra-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Zurück
          </button>
          {importedData.image_url && (
            <div className="relative w-full h-48 rounded-xl overflow-hidden bg-warm-100 dark:bg-warm-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={importedData.image_url}
                alt={importedData.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
          <OcrPreviewPanel
            result={{ ...importedData, source_type: "url_import" }}
            imageId={importedImageId ?? ""}
            onSaved={handleSaved}
            onClose={handleClose}
          />
        </div>
      )}
    </Modal>
  );
}
