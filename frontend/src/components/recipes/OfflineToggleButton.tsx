"use client";

import { useState, useEffect } from "react";
import { isRecipeOffline } from "@/lib/offline/db";
import {
  cacheRecipeForOffline,
  uncacheRecipe,
} from "@/lib/offline/cache-recipe";
import type { RecipeDetail } from "./RecipeDetailClient";
import toast from "react-hot-toast";

interface Props {
  recipe: RecipeDetail;
  userId: string;
}

export default function OfflineToggleButton({ recipe, userId }: Props) {
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    isRecipeOffline(userId, recipe.id).then(setCached);
  }, [recipe.id, userId]);

  async function toggle() {
    setLoading(true);
    try {
      if (cached) {
        await uncacheRecipe(recipe.id, userId);
        setCached(false);
        toast.success("Offline-Speicherung entfernt");
      } else {
        await cacheRecipeForOffline(recipe.id, userId);
        setCached(true);
        toast.success("Rezept offline gespeichert");
      }
    } catch {
      toast.error("Offline-Speicherung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      data-testid="offline-toggle"
      aria-label={cached ? "Offline-Speicherung entfernen" : "Offline speichern"}
      title={cached ? "Offline gespeichert" : "Offline speichern"}
      className={[
        "w-9 h-9 rounded-xl flex items-center justify-center",
        "border transition-all duration-150",
        loading && "opacity-50 cursor-wait",
        cached
          ? "border-terra-300 bg-terra-50 text-terra-500"
          : "border-[var(--border-base)] text-warm-400 hover:text-terra-500 hover:border-terra-300",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {loading ? (
        <svg
          className="w-4 h-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : cached ? (
        /* Cloud with checkmark */
        <svg
          className="w-4 h-4"
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 16l2 2 4-4"
          />
        </svg>
      ) : (
        /* Cloud with download arrow */
        <svg
          className="w-4 h-4"
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 13v5m0 0l-2-2m2 2l2-2"
          />
        </svg>
      )}
    </button>
  );
}
