"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, PageHeader } from "@/components/ui";
import OcrMultiPreview from "@/components/ocr/OcrMultiPreview";
import type { OcrResult } from "@/components/ocr/OcrPreviewPanel";
import { downscaleImage } from "@/lib/images/downscale";

// ── Konstanten ────────────────────────────────────────────────────────────────

/** Vertrag 4.1: höchstens 10 Seiten pro OCR-Aufruf. */
const MAX_PAGES = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// ── Typen ─────────────────────────────────────────────────────────────────────

type PageStatus = "bereit" | "laedt" | "fertig" | "fehler";
type Phase = "sammeln" | "hochladen" | "erkennen" | "ergebnis";

interface ScanPage {
  /** Stabiler lokaler Schlüssel — Seiten haben vor dem Upload keine ID. */
  key: string;
  file: File;
  previewUrl: string;
  status: PageStatus;
  progress: number;
  imageId?: string;
  error?: string;
}

// ── Seite ─────────────────────────────────────────────────────────────────────

export default function ScannenPage() {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  /** Object-URLs, die beim Verlassen der Seite freigegeben werden müssen. */
  const objectUrlsRef = useRef<Set<string>>(new Set());
  /** Bereits hochgeladene Seiten: lokaler Schlüssel → Bild-ID. */
  const uploadedIdsRef = useRef<Map<string, string>>(new Map());

  const [pages, setPages] = useState<ScanPage[]>([]);
  const [phase, setPhase] = useState<Phase>("sammeln");
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<OcrResult[] | null>(null);

  const pageCount = pages.length;
  const busy = phase !== "sammeln" || preparing;

  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // ── Seiten aufnehmen ────────────────────────────────────────────────────────

  const addFiles = useCallback(
    async (fileList: FileList) => {
      const incoming = Array.from(fileList);
      if (incoming.length === 0) return;

      const freeSlots = MAX_PAGES - pageCount;
      if (freeSlots <= 0) {
        toast.error(`Maximal ${MAX_PAGES} Seiten pro Rezept.`);
        return;
      }
      if (incoming.length > freeSlots) {
        toast.error(`Maximal ${MAX_PAGES} Seiten pro Rezept.`);
      }

      setError(null);
      setPreparing(true);
      try {
        const accepted: ScanPage[] = [];
        for (const file of incoming.slice(0, freeSlots)) {
          if (!file.type.startsWith("image/")) {
            toast.error(`„${file.name}" ist kein Bild.`);
            continue;
          }

          // Vor dem Upload verkleinern: Handyfotos sind sonst zu gross fürs
          // 10-MB-Limit und über Mobilfunk unnötig langsam.
          const prepared = await downscaleImage(file);

          if (!ALLOWED_MIME.includes(prepared.type)) {
            toast.error(
              `„${file.name}": Format wird nicht unterstützt. Erlaubt: JPEG, PNG, WebP.`,
            );
            continue;
          }
          if (prepared.size > MAX_BYTES) {
            toast.error(
              `„${file.name}" ist auch verkleinert grösser als 10 MB.`,
            );
            continue;
          }

          const previewUrl = URL.createObjectURL(prepared);
          objectUrlsRef.current.add(previewUrl);
          accepted.push({
            key: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            file: prepared,
            previewUrl,
            status: "bereit",
            progress: 0,
          });
        }
        if (accepted.length > 0) {
          setPages((prev) => [...prev, ...accepted]);
        }
      } finally {
        setPreparing(false);
      }
    },
    [pageCount],
  );

  function removePage(key: string) {
    setPages((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((p) => p.key !== key);
    });
    uploadedIdsRef.current.delete(key);
    setError(null);
  }

  function movePage(key: string, direction: -1 | 1) {
    setPages((prev) => {
      const index = prev.findIndex((p) => p.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function resetAll() {
    pages.forEach((p) => {
      URL.revokeObjectURL(p.previewUrl);
      objectUrlsRef.current.delete(p.previewUrl);
    });
    uploadedIdsRef.current.clear();
    setPages([]);
    setOcrResults(null);
    setError(null);
    setPhase("sammeln");
  }

  // ── Upload + OCR ────────────────────────────────────────────────────────────

  function uploadOne(
    page: ScanPage,
    onProgress: (percent: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", page.file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/images/upload");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          try {
            const data = JSON.parse(xhr.responseText) as { id: string };
            resolve(data.id);
          } catch {
            reject(new Error("Unerwartete Antwort des Servers."));
          }
          return;
        }
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(err.error ?? "Upload fehlgeschlagen."));
        } catch {
          reject(new Error("Upload fehlgeschlagen."));
        }
      };

      xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
      xhr.ontimeout = () =>
        reject(new Error("Zeitüberschreitung beim Upload."));

      xhr.send(fd);
    });
  }

  function patchPage(key: string, patch: Partial<ScanPage>) {
    setPages((prev) =>
      prev.map((p) => (p.key === key ? { ...p, ...patch } : p)),
    );
  }

  async function startScan() {
    if (pages.length === 0 || busy) return;

    const snapshot = pages;
    setError(null);
    setPhase("hochladen");

    let failed = 0;
    for (const page of snapshot) {
      // Bereits erfolgreich hochgeladene Seiten werden beim Wiederholen
      // nicht erneut übertragen.
      if (uploadedIdsRef.current.has(page.key)) {
        patchPage(page.key, {
          status: "fertig",
          progress: 100,
          error: undefined,
          imageId: uploadedIdsRef.current.get(page.key),
        });
        continue;
      }

      patchPage(page.key, { status: "laedt", progress: 0, error: undefined });
      try {
        const imageId = await uploadOne(page, (percent) =>
          patchPage(page.key, { progress: percent }),
        );
        uploadedIdsRef.current.set(page.key, imageId);
        patchPage(page.key, { status: "fertig", progress: 100, imageId });
      } catch (err) {
        failed += 1;
        patchPage(page.key, {
          status: "fehler",
          progress: 0,
          error: err instanceof Error ? err.message : "Upload fehlgeschlagen.",
        });
      }
    }

    if (failed > 0) {
      setPhase("sammeln");
      setError(
        failed === 1
          ? "Eine Seite konnte nicht hochgeladen werden. Bitte erneut versuchen."
          : `${failed} Seiten konnten nicht hochgeladen werden. Bitte erneut versuchen.`,
      );
      return;
    }

    const imageIds = snapshot
      .map((p) => uploadedIdsRef.current.get(p.key))
      .filter((id): id is string => Boolean(id));

    if (imageIds.length !== snapshot.length) {
      setPhase("sammeln");
      setError(
        "Nicht alle Seiten konnten hochgeladen werden. Bitte erneut versuchen.",
      );
      return;
    }

    await runOcr(imageIds);
  }

  async function runOcr(imageIds: string[]) {
    setPhase("erkennen");
    try {
      const res = await fetch("/api/ai/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Reihenfolge der Liste = Seitenreihenfolge (Vertrag 4.1)
        body: JSON.stringify({ imageIds }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Texterkennung fehlgeschlagen.");
      }
      const data = (await res.json()) as { recipes: OcrResult[] };
      if (!data.recipes || data.recipes.length === 0) {
        throw new Error("Auf den Seiten wurde kein Rezept erkannt.");
      }
      setOcrResults(data.recipes);
      setPhase("ergebnis");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Texterkennung fehlgeschlagen.";
      setPhase("sammeln");
      setError(message);
      toast.error(message);
    }
  }

  function handleAllDone(savedIds: string[]) {
    if (savedIds.length > 0) {
      router.push(`/rezepte/${savedIds[0]}`);
      return;
    }
    resetAll();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const firstImageId = pages.find((p) => p.imageId)?.imageId ?? "";

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <PageHeader
        subtitle="Erfassen"
        title="Rezept abfotografieren"
        description="Mehrseitige Rezepte nacheinander aufnehmen — daraus entsteht ein Rezept."
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {phase === "ergebnis" && ocrResults ? (
          <div data-testid="scan-ergebnis">
            <OcrMultiPreview
              recipes={ocrResults}
              imageId={firstImageId}
              onAllDone={handleAllDone}
              onRecipeSaved={() => {}}
            />
          </div>
        ) : (
          <>
            {/* Aufnahme-Aktionen */}
            <section className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={busy || pages.length >= MAX_PAGES}
                onClick={() => cameraInputRef.current?.click()}
                data-testid="scan-kamera-button"
                icon={<CameraIcon />}
              >
                {pages.length === 0
                  ? "Seite aufnehmen"
                  : "Weitere Seite aufnehmen"}
              </Button>

              <Button
                variant="outline"
                size="md"
                fullWidth
                disabled={busy || pages.length >= MAX_PAGES}
                onClick={() => galleryInputRef.current?.click()}
                data-testid="scan-galerie-button"
              >
                Aus Galerie wählen
              </Button>

              <p className="text-xs text-[var(--text-muted)] text-center">
                {pages.length} von {MAX_PAGES} Seiten · JPEG, PNG, WebP
              </p>
            </section>

            {preparing && (
              <p
                className="mt-4 text-sm text-[var(--text-muted)] text-center"
                data-testid="scan-vorbereitung"
              >
                Aufnahmen werden vorbereitet …
              </p>
            )}

            {/* Seitenliste */}
            {pages.length > 0 && (
              <section className="mt-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)] mb-3">
                  Seitenreihenfolge
                </h2>
                <ul className="space-y-3" data-testid="scan-seiten-liste">
                  {pages.map((page, index) => (
                    <li
                      key={page.key}
                      data-testid="scan-seite"
                      className="flex items-center gap-3 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-surface)] p-3"
                    >
                      {/* Vorschau */}
                      <div className="relative w-16 h-20 shrink-0 rounded-lg overflow-hidden bg-warm-100 dark:bg-warm-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={page.previewUrl}
                          alt={`Seite ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute top-0 left-0 px-1.5 py-0.5 text-[10px] font-semibold bg-terra-500 text-cream-100 rounded-br-lg">
                          {index + 1}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          Seite {index + 1}
                        </p>
                        {page.status === "laedt" ? (
                          <div
                            className="mt-1.5 space-y-1"
                            data-testid="scan-fortschritt"
                          >
                            <div className="h-1.5 w-full rounded-full bg-warm-100 dark:bg-warm-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-terra-500 transition-all duration-150"
                                style={{ width: `${page.progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">
                              Wird hochgeladen … {page.progress} %
                            </p>
                          </div>
                        ) : page.status === "fertig" ? (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Hochgeladen
                          </p>
                        ) : page.status === "fehler" ? (
                          <p
                            className="text-xs text-red-600 dark:text-red-400"
                            data-testid="scan-seite-fehler"
                          >
                            {page.error ?? "Upload fehlgeschlagen."}
                          </p>
                        ) : (
                          <p className="text-xs text-[var(--text-muted)]">
                            {formatSize(page.file.size)}
                          </p>
                        )}
                      </div>

                      {/* Reihenfolge + Löschen */}
                      <div className="flex items-center gap-1 shrink-0">
                        <IconButton
                          label={`Seite ${index + 1} nach oben`}
                          testId="scan-seite-hoch"
                          disabled={busy || index === 0}
                          onClick={() => movePage(page.key, -1)}
                        >
                          <ArrowUpIcon />
                        </IconButton>
                        <IconButton
                          label={`Seite ${index + 1} nach unten`}
                          testId="scan-seite-runter"
                          disabled={busy || index === pages.length - 1}
                          onClick={() => movePage(page.key, 1)}
                        >
                          <ArrowDownIcon />
                        </IconButton>
                        <IconButton
                          label={`Seite ${index + 1} entfernen`}
                          testId="scan-seite-entfernen"
                          disabled={busy}
                          onClick={() => removePage(page.key)}
                        >
                          <TrashIcon />
                        </IconButton>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Fehlerbanner */}
            {error && (
              <p
                role="alert"
                data-testid="scan-fehler"
                className="mt-5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300"
              >
                {error}
              </p>
            )}

            {/* Erkennen */}
            {pages.length > 0 && (
              <section className="mt-6 space-y-3">
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={phase === "hochladen" || phase === "erkennen"}
                  disabled={busy}
                  onClick={startScan}
                  data-testid="scan-start-ocr"
                >
                  {phase === "hochladen"
                    ? "Seiten werden hochgeladen …"
                    : phase === "erkennen"
                      ? "KI liest die Seiten …"
                      : error
                        ? "Erneut versuchen"
                        : `Rezept erkennen (${pages.length} ${pages.length === 1 ? "Seite" : "Seiten"})`}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  disabled={busy}
                  onClick={resetAll}
                  data-testid="scan-zuruecksetzen"
                >
                  Alle Seiten verwerfen
                </Button>
              </section>
            )}

            {phase === "erkennen" && (
              <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
                Mehrseitige Rezepte brauchen etwas länger — bitte die Seite
                offen lassen.
              </p>
            )}
          </>
        )}

        {/* Versteckte Datei-Inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          tabIndex={-1}
          data-testid="scan-kamera-input"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          tabIndex={-1}
          data-testid="scan-galerie-input"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </main>
    </div>
  );
}

// ── Hilfen ────────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className="min-tap flex items-center justify-center rounded-lg text-warm-500 hover:text-warm-700 hover:bg-warm-100 dark:text-warm-400 dark:hover:text-warm-200 dark:hover:bg-warm-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
    >
      {children}
    </button>
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

function ArrowUpIcon() {
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
        strokeWidth={2}
        d="M5 15l7-7 7 7"
      />
    </svg>
  );
}

function ArrowDownIcon() {
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
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

function TrashIcon() {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
