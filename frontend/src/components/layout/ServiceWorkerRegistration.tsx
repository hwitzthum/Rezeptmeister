"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  watchForUpdates,
  type SwContainer,
  type UpdateWatcher,
} from "@/lib/pwa/sw-update";

/**
 * Registriert den Service Worker und weist auf eine neue Fassung hin.
 *
 * Zuvor lief die Uebernahme still im Hintergrund und wurde nur auf die
 * Entwicklerkonsole geschrieben — als Nutzer sah man weiter den alten Stand,
 * ohne Anhaltspunkt warum. Auf einer vom Home-Bildschirm gestarteten App faellt
 * das besonders auf, weil iOS sie schlafen legt statt sie zu beenden.
 *
 * Diese Komponente sitzt in der Wurzel-Anordnung, also auch auf den
 * Anmeldeseiten. Deshalb bringt sie ihren eigenen Hinweis mit, statt sich auf
 * den Toaster der App-Anordnung zu verlassen.
 */
export default function ServiceWorkerRegistration() {
  const [updateReady, setUpdateReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const watcherRef = useRef<UpdateWatcher | null>(null);
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const watcher = watchForUpdates({
      container: navigator.serviceWorker as unknown as SwContainer,
      onUpdateReady: () => setUpdateReady(true),
      onActivated: () => {
        // controllerchange kann mehrfach feuern — eine Neuladeschleife waere
        // schlimmer als ein alter Stand.
        if (reloadedRef.current) return;
        reloadedRef.current = true;
        window.location.reload();
      },
      onError: (err) => {
        console.warn("[SW] Registrierung fehlgeschlagen:", err);
      },
    });
    watcherRef.current = watcher;
    watcher.checkForUpdate();

    // iOS beendet eine Web-App vom Home-Bildschirm nicht, sondern legt sie
    // schlafen. Ohne diese Pruefung beim Zurueckholen bliebe sie beliebig lange
    // auf dem Stand ihres letzten echten Starts stehen.
    const onVisible = () => {
      if (document.visibilityState === "visible") watcher.checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      watcher.stop();
      watcherRef.current = null;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    setApplying(true);
    watcherRef.current?.applyUpdate();
    // Sicherheitsnetz: bleibt der Wechsel des Controllers aus — etwa weil die
    // wartende Fassung inzwischen weg ist — laedt die Seite trotzdem neu,
    // statt mit einer festhaengenden Schaltflaeche dazustehen.
    window.setTimeout(() => {
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    }, 3_000);
  }, []);

  if (!updateReady) return null;

  return (
    <div
      data-testid="sw-update-banner"
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 safe-area-inset-bottom pointer-events-none md:bottom-4"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-terra-400/40 bg-terra-500 px-4 py-3 text-cream-50 shadow-warm">
        <span className="shrink-0" aria-hidden="true">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m-4.484 0a8.25 8.25 0 0013.803 3.7l3.181-3.182m-16.984 0V9.348m0 0a8.25 8.25 0 0113.803-3.7l3.181 3.182"
            />
          </svg>
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium leading-snug">
          Neue Version verfügbar
        </p>
        <button
          type="button"
          data-testid="sw-update-button"
          onClick={applyUpdate}
          disabled={applying}
          className="min-tap shrink-0 rounded-xl bg-cream-50 px-3 py-1.5 text-sm font-semibold text-terra-700 transition-colors hover:bg-cream-100 active:bg-cream-200 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-50 focus-visible:ring-offset-2 focus-visible:ring-offset-terra-500"
        >
          {applying ? "Wird geladen…" : "Aktualisieren"}
        </button>
        <button
          type="button"
          data-testid="sw-update-dismiss"
          onClick={() => setUpdateReady(false)}
          aria-label="Hinweis ausblenden"
          className="min-tap shrink-0 rounded-xl px-2 text-cream-50/80 transition-colors hover:text-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
