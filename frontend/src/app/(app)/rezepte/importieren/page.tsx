import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import ImportierenClient from "./ImportierenClient";

export const metadata: Metadata = {
  title: "Rezept importieren | Rezeptmeister",
  description:
    "Ein Rezept von einer Webseite übernehmen — Ziel des Android-Teilen-Sheets und des iOS-Kurzbefehls.",
};

/** `useSearchParams` braucht eine Suspense-Grenze, sonst scheitert der Build. */
export default function ImportierenPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-base)]">
          <PageHeader
            subtitle="Rezepte"
            title="Rezept importieren"
            description="Eine Rezeptseite aus dem Web übernehmen."
            sticky={false}
          />
          <div className="container mx-auto px-4 py-8 max-w-2xl">
            <p className="text-sm text-[var(--text-muted)]">
              Import wird vorbereitet…
            </p>
          </div>
        </div>
      }
    >
      <ImportierenClient />
    </Suspense>
  );
}
