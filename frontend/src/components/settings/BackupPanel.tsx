"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, ConfirmDialog } from "@/components/ui";
import { backupSchema, type BackupV1 } from "@/lib/backup/schema";

interface ImportSummary {
  imported: {
    recipes: number;
    notes: number;
    cookLogs: number;
    collections: number;
    mealPlans: number;
    shoppingItems: number;
  };
  skipped: { recipes: number; mealPlans: number; shoppingItems: number };
  embeddingQueued: number;
}

/**
 * «Daten & Backup»: Download des JSON-Backups und Wiederherstellung.
 * Die Datei wird vor dem Bestätigen lokal geprüft, damit die Nutzerin weiss,
 * was sie einspielt — Anzahl Rezepte, Herkunft, Datum.
 */
export default function BackupPanel() {
  const [downloading, setDownloading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pending, setPending] = useState<{
    file: File;
    backup: BackupV1;
  } | null>(null);
  const [lastResult, setLastResult] = useState<ImportSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/export");
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Backup konnte nicht erstellt werden.");
      }
      const blob = await res.blob();
      const name =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ?? "rezeptmeister-backup.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup heruntergeladen.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Backup konnte nicht erstellt werden.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleFileChosen(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = backupSchema.safeParse(JSON.parse(text));
      if (!parsed.success) {
        toast.error("Das ist kein gültiges Rezeptmeister-Backup.");
        return;
      }
      setPending({ file, backup: parsed.data });
    } catch {
      toast.error("Datei konnte nicht gelesen werden.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleImport() {
    if (!pending) return;
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.backup),
      });
      const data = (await res.json()) as ImportSummary & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import fehlgeschlagen.");
      setLastResult(data);
      toast.success(
        `${data.imported.recipes} Rezepte importiert, ${data.skipped.recipes} bereits vorhanden.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Import fehlgeschlagen.",
      );
    } finally {
      setImporting(false);
      setPending(null);
    }
  }

  const exportedAt = pending ? new Date(pending.backup.exportedAt) : null;

  return (
    <div className="space-y-6" data-testid="backup-panel">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-medium text-[var(--text-primary)]">
            Backup herunterladen
          </h3>
          <p className="text-sm text-warm-500 dark:text-warm-400 mt-0.5">
            Alle Rezepte, Zutaten, Notizen, Kochhistorie, Sammlungen, Wochenplan
            und Einkaufsliste als JSON. Bilder sind nur als Verweis enthalten.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleDownload()}
          disabled={downloading}
          data-testid="backup-download"
        >
          {downloading ? "Wird erstellt…" : "Backup herunterladen"}
        </Button>
      </div>

      <div className="pt-6 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-medium text-[var(--text-primary)]">
            Backup wiederherstellen
          </h3>
          <p className="text-sm text-warm-500 dark:text-warm-400 mt-0.5">
            Fügt die Daten aus der Datei hinzu. Bereits vorhandene Rezepte
            (gleicher Titel und gleiche Zutaten) werden übersprungen, nichts
            wird überschrieben.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => void handleFileChosen(e.target.files?.[0])}
          data-testid="backup-file-input"
          aria-label="Backup-Datei auswählen"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={importing}
          data-testid="backup-restore"
        >
          Datei auswählen…
        </Button>
      </div>

      {lastResult && (
        <p
          className="text-sm text-[var(--text-secondary)]"
          data-testid="backup-result"
        >
          Importiert: {lastResult.imported.recipes} Rezepte,{" "}
          {lastResult.imported.notes} Notizen, {lastResult.imported.cookLogs}{" "}
          Kochlog-Einträge, {lastResult.imported.collections} Sammlungen,{" "}
          {lastResult.imported.mealPlans} Wochenplan-Einträge,{" "}
          {lastResult.imported.shoppingItems} Einkaufsposten. Übersprungen:{" "}
          {lastResult.skipped.recipes} Rezepte.
          {lastResult.embeddingQueued > 0 &&
            " Die Suche wird im Hintergrund aktualisiert."}
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Backup einspielen?"
        message={
          pending
            ? `Datei «${pending.file.name}» vom ${exportedAt?.toLocaleDateString("de-CH") ?? "?"} mit ${pending.backup.recipes.length} Rezepten, ${pending.backup.collections.length} Sammlungen und ${pending.backup.mealPlans.length} Wochenplan-Einträgen. Bilder werden nicht übernommen.`
            : ""
        }
        confirmLabel="Einspielen"
        cancelLabel="Abbrechen"
        variant="info"
        loading={importing}
        onConfirm={() => {
          void handleImport();
        }}
        onClose={() => {
          if (!importing) setPending(null);
        }}
      />
    </div>
  );
}
