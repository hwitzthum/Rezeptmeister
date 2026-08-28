"use client";

import { useRef, useState } from "react";
import { downscaleImage } from "@/lib/images/downscale";

// ── Typen ─────────────────────────────────────────────────────────────────────

export interface UploadedImage {
  id: string;
  userId: string;
  recipeId: string | null;
  filePath: string;
  thumbnailUrl: string;
  fileName: string | null;
  mimeType: string;
  fileSizeBytes: number | null;
  width: number | null;
  height: number | null;
  isPrimary: boolean;
  sourceType: string;
  altText: string | null;
  createdAt: string;
}

interface ImageUploadZoneProps {
  /** Wird nach erfolgreichem Upload aufgerufen */
  onUploadComplete: (image: UploadedImage) => void;
  /** Wenn gesetzt: Bild wird nach Upload automatisch diesem Rezept zugeordnet */
  recipeId?: string;
  /** Zusätzlicher Kamera-Button (mobil). Der Galerie-Weg bleibt unverändert. */
  showCamera?: boolean;
  className?: string;
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

// ── Komponente ────────────────────────────────────────────────────────────────

export default function ImageUploadZone({
  onUploadComplete,
  recipeId,
  showCamera = true,
  className = "",
}: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList) {
    const original = fileList[0];
    if (!original) return;

    // Kameraaufnahmen sind regelmässig grösser als 10 MB. Statt den Upload
    // scheitern zu lassen, wird nur in diesem Fall lokal verkleinert —
    // kleinere Dateien (Galerie-Weg) bleiben unverändert.
    const file =
      original.size > MAX_BYTES && original.type.startsWith("image/")
        ? await downscaleImage(original)
        : original;

    // Client-seitige Vorab-Validierung
    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Nicht unterstütztes Format. Erlaubt: JPEG, PNG, WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Datei zu gross. Maximum: 10 MB.");
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    const fd = new FormData();
    fd.append("file", file);
    // recipeId is assigned server-side atomically during upload (no post-upload PATCH race)
    if (recipeId) fd.append("recipeId", recipeId);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/images/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setProgress(0);

      if (xhr.status === 201) {
        const data = JSON.parse(xhr.responseText) as UploadedImage;
        onUploadComplete(data);
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          setError(err.error ?? "Upload fehlgeschlagen.");
        } catch {
          setError("Upload fehlgeschlagen.");
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError("Netzwerkfehler beim Upload.");
    };

    xhr.send(fd);
  }

  // ── Drag-and-Drop Events ──────────────────────────────────────────────────

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Bild hochladen – hier ablegen oder klicken"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !uploading) {
            inputRef.current?.click();
          }
        }}
        className={[
          "relative flex flex-col items-center justify-center gap-3",
          "rounded-2xl border-2 border-dashed p-8 text-center",
          "transition-all duration-200 cursor-pointer select-none",
          uploading
            ? "border-terra-300 bg-terra-50 cursor-not-allowed"
            : isDragging
              ? "border-terra-400 bg-terra-50 scale-[1.01]"
              : "border-[var(--border-base)] hover:border-terra-300 hover:bg-[var(--bg-subtle)]",
        ].join(" ")}
      >
        {/* Icon */}
        <div
          className={[
            "w-12 h-12 rounded-xl flex items-center justify-center",
            isDragging
              ? "bg-terra-100 dark:bg-terra-900/40 text-terra-600"
              : "bg-warm-100 dark:bg-warm-800 text-warm-500 dark:text-warm-400",
          ].join(" ")}
        >
          <UploadIcon />
        </div>

        {uploading ? (
          /* Fortschrittsanzeige */
          <div className="w-full max-w-48 space-y-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Wird hochgeladen …
            </p>
            <div className="h-2 w-full rounded-full bg-warm-100 dark:bg-warm-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-terra-500 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">{progress} %</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {isDragging ? "Bild loslassen" : "Bild hier ablegen"}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                oder klicken zum Auswählen
              </p>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              JPEG, PNG, WebP · max. 10 MB
            </p>
          </>
        )}
      </div>

      {/* Kamera-Weg (mobil) — zusätzlich zum Ablegen/Auswählen oben */}
      {showCamera && (
        <button
          type="button"
          disabled={uploading}
          onClick={() => cameraInputRef.current?.click()}
          data-testid="upload-kamera-button"
          className={[
            "min-tap mt-3 w-full flex items-center justify-center gap-2",
            "rounded-xl border border-[var(--border-base)] px-4 py-2.5",
            "text-sm font-medium text-[var(--text-primary)]",
            "hover:border-terra-300 hover:bg-[var(--bg-subtle)]",
            "disabled:opacity-50 disabled:cursor-not-allowed transition-all",
          ].join(" ")}
        >
          <CameraIcon />
          Mit Kamera aufnehmen
        </button>
      )}

      {/* Fehlermeldung */}
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Verstecktes File-Input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleFiles(e.target.files);
            // Reset so the same file can be selected again
            e.target.value = "";
          }
        }}
      />

      {/* Verstecktes Kamera-Input */}
      {showCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          data-testid="upload-kamera-input"
          onChange={(e) => {
            if (e.target.files?.length) {
              void handleFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      className="w-6 h-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}
