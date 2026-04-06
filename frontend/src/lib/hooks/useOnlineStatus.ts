"use client";

import { useState, useEffect } from "react";

export function useOnlineStatus(): boolean {
  // Always start with true to avoid hydration mismatch (server always renders online)
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Sync with actual browser state after hydration
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
