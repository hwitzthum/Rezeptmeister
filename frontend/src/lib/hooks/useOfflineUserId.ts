"use client";

import { useEffect, useState } from "react";
import { getOfflineUserId, setOfflineUserId } from "@/lib/offline/db";

/**
 * Resolves the active userId for offline pages.
 * Tries the session API first (when online), falls back to localStorage.
 */
export function useOfflineUserId(): string | null {
  const [userId, setUserId] = useState<string | null>(() =>
    getOfflineUserId(),
  );

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((session) => {
        const id = session?.user?.id;
        if (id) {
          setUserId(id);
          setOfflineUserId(id);
        }
      })
      .catch(() => {
        // Offline — keep localStorage value
      });
  }, []);

  return userId;
}
