/**
 * Nutzlast für `POST {BACKEND_URL}/ai/generate-image`.
 *
 * Das Backend (`backend/app/routers/ai.py`, `GenerateImageRequest`) begrenzt
 * Titel, Zutatenzahl und Zutatenlänge. Die Grenzen sind richtig so: die Werte
 * stammen aus Benutzereingaben und landen unverändert in einem LLM-Prompt.
 *
 * Falsch war, sie zu ignorieren. Die Next.js-Route reichte alle Zutaten eines
 * Rezepts durch; ab 21 lehnte Pydantic mit 422 ab, und im Browser stand nur
 * „Ungültige Eingabedaten". Ein Rezept mit 25 Zutaten ist aber völlig normal
 * und darf daran nicht scheitern — zumal das Backend den Prompt ohnehin nur
 * aus den ersten acht Namen baut. Deshalb wird hier gekürzt statt abgelehnt.
 */

/** Spiegelt `GenerateImageRequest` im Backend. Änderungen dort gehören hierher. */
export const GENERATE_IMAGE_LIMITS = {
  title: 200,
  ingredients: 20,
  ingredientName: 100,
  category: 100,
} as const;

export interface GenerateImagePayload {
  title: string;
  ingredients: string[];
  category: string;
}

/** Kürzt die Nutzlast auf das, was das Backend annimmt. */
export function clampGenerateImagePayload<T extends GenerateImagePayload>(
  payload: T,
): T {
  return {
    ...payload,
    title: payload.title.slice(0, GENERATE_IMAGE_LIMITS.title),
    ingredients: payload.ingredients
      .slice(0, GENERATE_IMAGE_LIMITS.ingredients)
      .map((name) => name.slice(0, GENERATE_IMAGE_LIMITS.ingredientName)),
    category: payload.category.slice(0, GENERATE_IMAGE_LIMITS.category),
  };
}
