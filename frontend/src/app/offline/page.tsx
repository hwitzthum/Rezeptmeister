"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAllOfflineRecipes, type OfflineRecipe } from "@/lib/offline/db";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { useOfflineUserId } from "@/lib/hooks/useOfflineUserId";

export default function OfflinePage() {
  const isOnline = useOnlineStatus();
  const userId = useOfflineUserId();
  const [recipes, setRecipes] = useState<OfflineRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoaded(true);
      return;
    }
    getAllOfflineRecipes(userId).then((r) => {
      setRecipes(r);
      setLoaded(true);
    });
  }, [userId]);

  return (
    <div className="min-h-screen bg-[var(--bg-base,#FFF8F0)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--bg-surface,#fff)] border-b border-[var(--border-base,#e5e0db)] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1
            className="text-2xl font-bold"
          >
            Rezeptmeister
          </h1>
          {!isOnline && (
            <span
              data-testid="offline-badge"
              className="text-xs bg-warm-200 dark:bg-warm-700 text-warm-700 dark:text-warm-200 px-2 py-1 rounded-full"
            >
              Offline
            </span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <h2 className="text-xl font-semibold mb-1">Gespeicherte Rezepte</h2>
        <p className="text-sm text-warm-500 dark:text-warm-400 mb-6">
          {isOnline
            ? "Rezepte, die für den Offline-Zugang gespeichert wurden."
            : "Sie sind offline. Nur gespeicherte Rezepte sind verfügbar."}
        </p>

        {!loaded ? (
          <div className="text-warm-400 text-sm">Laden...</div>
        ) : recipes.length === 0 ? (
          <div
            data-testid="no-offline-recipes"
            className="text-center py-12 text-warm-400"
          >
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-40"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2 15.2C2 14 2.94 13 4.14 13h.01c.46-2.83 2.9-5 5.85-5 2.64 0 4.86 1.74 5.62 4.13A4.5 4.5 0 0120 16.5c0 2.49-2.01 4.5-4.5 4.5H5a3 3 0 01-3-3v-.3z"
              />
            </svg>
            <p>Keine Rezepte offline gespeichert.</p>
            {isOnline && (
              <p className="text-xs mt-1">
                Öffnen Sie ein Rezept und tippen Sie auf das Cloud-Symbol.
              </p>
            )}
          </div>
        ) : (
          <ul data-testid="offline-recipe-list" className="space-y-3">
            {recipes.map((r) => (
              <li key={r.recipeId}>
                <Link
                  href={
                    isOnline
                      ? `/rezepte/${r.recipeId}`
                      : `/offline/rezept?id=${r.recipeId}`
                  }
                  className="block bg-[var(--bg-surface,#fff)] border border-[var(--border-base,#e5e0db)] rounded-xl p-4 hover:border-terra-300 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {/* Thumbnail */}
                    {r.imageThumbnails.length > 0 ? (
                      <ThumbnailFromBlob blob={r.imageThumbnails[0].blob} title={r.data.title} />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-warm-100 dark:bg-warm-800 flex items-center justify-center text-warm-300 shrink-0">
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">
                        {r.data.title}
                      </h3>
                      {r.data.category && (
                        <p className="text-xs text-warm-500 dark:text-warm-400">
                          {r.data.category}
                        </p>
                      )}
                      <p className="text-xs text-warm-400 mt-0.5">
                        Gespeichert am{" "}
                        {new Date(r.cachedAt).toLocaleDateString("de-CH")}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {isOnline && (
          <div className="mt-8 text-center">
            <Link
              href="/"
              className="text-terra-500 hover:text-terra-600 text-sm font-medium"
            >
              ← Zurück zur Startseite
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Helper: render blob as img ────────────────────────────────────────────────

function ThumbnailFromBlob({ blob, title }: { blob: Blob; title: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (blob.size === 0) return;
    const url = URL.createObjectURL(blob);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  if (!src) {
    return (
      <div className="w-14 h-14 rounded-lg bg-warm-100 dark:bg-warm-800 shrink-0" />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      loading="lazy"
      className="w-14 h-14 rounded-lg object-cover shrink-0"
    />
  );
}
