"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import UrlImportDialog from "@/components/ai/UrlImportDialog";

export default function QuickActionsWidget() {
  const [showUrlImport, setShowUrlImport] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-3" data-testid="quick-actions">
        <Link href="/rezepte/neu">
          <Button
            variant="primary"
            size="md"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            Neues Rezept
          </Button>
        </Link>
        <Link href="/bilder">
          <Button
            variant="secondary"
            size="md"
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          >
            Bild hochladen
          </Button>
        </Link>
        <Button
          variant="outline"
          size="md"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          }
          onClick={() => setShowUrlImport(true)}
        >
          URL importieren
        </Button>
      </div>

      <UrlImportDialog isOpen={showUrlImport} onClose={() => setShowUrlImport(false)} />
    </>
  );
}
