"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import {
  getPendingOpsServerSnapshot,
  getPendingOpsSnapshot,
  pendingChangesLabel,
  startSyncListeners,
  subscribePendingOps,
} from "@/lib/offline/shopping-sync";

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const pendingCount = useSyncExternalStore(
    subscribePendingOps,
    getPendingOpsSnapshot,
    getPendingOpsServerSnapshot,
  );

  // Mounted app-wide, so the queue is replayed on reconnect and on tab focus
  // even when the shopping list itself is not open.
  useEffect(() => {
    startSyncListeners();
  }, []);

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div
        data-testid="offline-indicator"
        className="bg-warm-800 text-cream-50 text-center text-sm py-2 px-4"
      >
        Offline-Modus — Nur gespeicherte Rezepte sind verfügbar
        {pendingCount > 0 && (
          <span data-testid="offline-pending-count">
            {" "}
            · {pendingChangesLabel(pendingCount)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="offline-sync-indicator"
      className="bg-terra-600 text-cream-50 text-center text-sm py-2 px-4"
    >
      <span data-testid="offline-pending-count">
        {pendingChangesLabel(pendingCount)}
      </span>
    </div>
  );
}
