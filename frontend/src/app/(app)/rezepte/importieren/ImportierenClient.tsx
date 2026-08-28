"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, PageHeader } from "@/components/ui";
import UrlImportDialog from "@/components/ai/UrlImportDialog";
import { extractSharedUrl } from "./shared-url";

export default function ImportierenClient() {
  const searchParams = useSearchParams();
  const sharedUrl = useMemo(
    () => extractSharedUrl(searchParams.toString()) ?? "",
    [searchParams],
  );

  const [dialogOpen, setDialogOpen] = useState(true);
  // Nur der erste Aufbau der Seite startet von selbst — nach einem Abbruch
  // entscheidet die Benutzerin, wann es weitergeht.
  const [autoStart, setAutoStart] = useState(Boolean(sharedUrl));

  function handleClose() {
    setDialogOpen(false);
    setAutoStart(false);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]" data-testid="import-page">
      <PageHeader
        subtitle="Rezepte"
        title="Rezept importieren"
        description="Eine Rezeptseite aus dem Web übernehmen — geteilt, eingefügt oder von Hand eingegeben."
        sticky={false}
      />

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card padding="lg" className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {sharedUrl ? "Geteilte Adresse" : "Adresse eingeben"}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {sharedUrl
                ? "Die geteilte Adresse wurde übernommen. Der Import läuft im Dialog weiter."
                : "Öffnen Sie den Import und geben Sie die Adresse der Rezeptseite ein. Die KI liest Zutaten und Zubereitung selbstständig aus."}
            </p>
          </div>

          {sharedUrl && (
            <p
              className="break-all rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]"
              data-testid="import-shared-url"
            >
              {sharedUrl}
            </p>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={() => setDialogOpen(true)}
            data-testid="import-open-dialog"
            className="min-tap"
          >
            URL-Import öffnen
          </Button>
        </Card>
      </div>

      <UrlImportDialog
        isOpen={dialogOpen}
        onClose={handleClose}
        initialUrl={sharedUrl}
        autoStart={autoStart}
      />
    </div>
  );
}
