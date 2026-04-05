"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui";

interface GenerateImageResult {
  image_id: string;
  thumbnail_url: string;
  original_url: string;
}

interface GenerateImageButtonProps {
  recipeId: string;
  title: string;
  ingredients: string[];
  category: string;
  onImageGenerated: (imageUrl: string) => void;
}

export default function GenerateImageButton({
  recipeId,
  title,
  ingredients,
  category,
  onImageGenerated,
}: GenerateImageButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId, title, ingredients, category }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Fehler beim Generieren des Bildes.");
      }

      const data = (await res.json()) as GenerateImageResult;
      setGenerated(true);
      onImageGenerated(data.thumbnail_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Generieren des Bildes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 mt-4">
      {generated ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#D4A843]/20 text-[#9a7520] border border-[#D4A843]/40">
          <Sparkles className="w-3.5 h-3.5" />
          KI-generiert
        </span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          icon={<Sparkles className="w-4 h-4" />}
          loading={loading}
          disabled={loading}
          onClick={() => { void handleGenerate(); }}
          className="bg-white/80 hover:bg-white"
        >
          KI-Bild generieren
        </Button>
      )}

      {error && (
        <p className="text-xs text-red-600 text-center max-w-[200px]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
