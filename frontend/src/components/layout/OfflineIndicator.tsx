"use client";

import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      data-testid="offline-indicator"
      className="bg-warm-800 text-cream-50 text-center text-sm py-2 px-4"
    >
      Offline-Modus — Nur gespeicherte Rezepte sind verfügbar
    </div>
  );
}
