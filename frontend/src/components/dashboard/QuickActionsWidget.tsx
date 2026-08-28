"use client";

import { useState } from "react";
import { ActionGrid, ActionTile } from "@/components/ui";
import UrlImportDialog from "@/components/ai/UrlImportDialog";

const PlusIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v16m8-8H4" />
  </svg>
);

const PhotoIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const LinkIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
  </svg>
);

/**
 * Die drei Einstiege ins Erfassen als gleichbreite Kacheln.
 *
 * Zuvor standen hier drei unterschiedlich breite Buttons in einem
 * `flex flex-wrap`: auf dem Handy brach das zu zwei plus einem haengenden
 * Button um. Ein Raster haelt die Breiten gleich, unabhaengig von der
 * Beschriftungslaenge.
 */
export default function QuickActionsWidget() {
  const [showUrlImport, setShowUrlImport] = useState(false);

  return (
    <>
      <ActionGrid className="max-w-xl" data-testid="quick-actions">
        <ActionTile
          href="/rezepte/neu"
          tone="primary"
          icon={<PlusIcon />}
          label="Neues Rezept"
          hint="Von Hand erfassen"
          data-testid="quick-action-neu"
        />
        <ActionTile
          href="/bilder"
          icon={<PhotoIcon />}
          label="Bild hochladen"
          hint="Aus der Galerie"
          data-testid="quick-action-bild"
        />
        <ActionTile
          onClick={() => setShowUrlImport(true)}
          icon={<LinkIcon />}
          label="URL importieren"
          hint="Von einer Website"
          data-testid="quick-action-url"
        />
      </ActionGrid>

      <UrlImportDialog isOpen={showUrlImport} onClose={() => setShowUrlImport(false)} />
    </>
  );
}
