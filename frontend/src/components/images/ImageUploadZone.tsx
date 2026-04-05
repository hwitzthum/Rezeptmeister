"use client";

import { useRef, useState } from "react";

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
  className?: string;
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// ── Komponente ────────────────────────────────────────────────────────────────

export default function ImageUploadZone({
  onUploadComplete,
  recipeId,
  className = "",
}: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function handleFiles(fileList: FileList) {
    const file = fileList[0];
    if (!file) return;

    // Client-seitige Vorab-Validierung
    if (!ALLOWED_MIME.includes(file.type)) {
      setError("Nicht unterstütztes Format. Erlaubt: JPEG, PNG, WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
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
      handleFiles(e.dataTransfer.files);
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
            ? "border-terra-300 bg-terra-25 cursor-not-allowed"
            : isDragging
              ? "border-terra-400 bg-terra-50 scale-[1.01]"
              : "border-[var(--border-base)] hover:border-terra-300 hover:bg-[var(--bg-subtle)]",
        ].join(" ")}
      >
        {/* Icon */}
        <div
          className={[
            "w-12 h-12 rounded-xl flex items-center justify-center",
            isDragging ? "bg-terra-100 text-terra-600" : "bg-warm-100 text-warm-500",
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
            <div className="h-2 w-full rounded-full bg-warm-100 overflow-hidden">
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
            handleFiles(e.target.files);
            // Reset so the same file can be selected again
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function UploadIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}
