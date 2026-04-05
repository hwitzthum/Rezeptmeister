"use client";

import { formatAmount } from "@/lib/units";
import type { RecipeDetail } from "./RecipeDetailClient";

interface PrintableRecipeProps {
  recipe: RecipeDetail;
  targetServings: number;
  includeImage: boolean;
}

export default function PrintableRecipe({
  recipe,
  targetServings,
  includeImage,
}: PrintableRecipeProps) {
  function scaledAmount(amountStr: string | null): string {
    if (!amountStr) return "";
    const n = parseFloat(amountStr);
    if (isNaN(n)) return amountStr;
    return formatAmount((n * targetServings) / recipe.servings);
  }

  const heroImg = recipe.images.find((i) => i.isPrimary) ?? recipe.images[0];

  return (
    <div className="print-recipe" data-testid="printable-recipe">
      {/* Titel */}
      <h1 className="text-2xl font-bold mb-1 print-recipe-header">{recipe.title}</h1>

      {/* Meta */}
      <div className="text-sm text-gray-600 mb-3 flex gap-4 flex-wrap">
        <span>{targetServings} {targetServings === 1 ? "Portion" : "Portionen"}</span>
        {recipe.totalTimeMinutes && (
          <span>
            {recipe.totalTimeMinutes < 60
              ? `${recipe.totalTimeMinutes} Min.`
              : `${Math.floor(recipe.totalTimeMinutes / 60)} Std. ${recipe.totalTimeMinutes % 60 > 0 ? `${recipe.totalTimeMinutes % 60} Min.` : ""}`}
          </span>
        )}
        {recipe.difficulty && <span>{recipe.difficulty}</span>}
        {recipe.category && <span>{recipe.category}</span>}
      </div>

      {/* Bild */}
      {includeImage && heroImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={heroImg.filePath}
          alt={recipe.title}
          className="print-recipe-image w-full max-h-[200px] object-cover rounded-lg mb-4"
        />
      )}

      {/* Beschreibung */}
      {recipe.description && (
        <p className="text-sm text-gray-600 mb-4 italic">{recipe.description}</p>
      )}

      {/* Zutaten */}
      <h2 className="text-lg font-semibold mb-2 mt-4 border-b pb-1">Zutaten</h2>
      <div className="print-ingredients mb-4">
        {recipe.ingredients.map((ing) => {
          const amount = scaledAmount(ing.amount);
          return (
            <div key={ing.id} className="flex gap-2 text-sm py-0.5">
              <span className="font-medium w-20 text-right shrink-0">
                {amount}{ing.unit ? ` ${ing.unit}` : ""}
              </span>
              <span>
                {ing.name}
                {ing.isOptional && " (optional)"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Zubereitung */}
      <h2 className="text-lg font-semibold mb-2 border-b pb-1">Zubereitung</h2>
      <div className="print-instructions text-sm leading-relaxed">
        {recipe.instructions.split(/\n+/).map((para, i) => (
          <p key={i} className="mb-2">{para}</p>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-6 pt-3 border-t text-xs text-gray-400">
        Rezeptmeister — gedruckt am {new Date().toLocaleDateString("de-CH")}
      </div>
    </div>
  );
}
