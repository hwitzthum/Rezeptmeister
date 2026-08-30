"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getOfflineUserId, setOfflineUserId } from "@/lib/offline/db";

export interface OfflineUser {
  userId: string | null;
  /** true nach der Hydration — vorher darf die Seite nichts «Leeres» behaupten. */
  resolved: boolean;
}

// localStorage als externer Store: der Server-Snapshot ist null, der Client
// liest erst nach der Hydration. Vorher stand der Wert schon im ersten
// Client-Render und `/offline` warf einen Hydration-Fehler («Keine Rezepte»
// vom Server gegen «Laden…» vom Client).
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Resolves the active userId for offline pages.
 * Tries the session API first (when online), falls back to localStorage.
 */
export function useOfflineUserId(): OfflineUser {
  const stored = useSyncExternalStore(subscribe, getOfflineUserId, () => null);
  const resolved = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((session) => {
        const id = session?.user?.id;
        if (id) {
          setOfflineUserId(id);
          notify();
          setSessionUserId(id);
        }
      })
      .catch(() => {
        // Offline — keep localStorage value
      });
  }, []);

  return { userId: sessionUserId ?? stored, resolved };
}
