/**
 * Rezept samt Zutaten anlegen — die eine Stelle für den Cascade-Insert.
 * Genutzt von `POST /api/recipes` und vom Backup-Import.
 */

import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db, type DB } from "@/lib/db";
import { recipes, ingredients, users, type Recipe } from "@/lib/db/schema";
import { recipeBodySchema, calcTotalTime } from "@/lib/schemas";
import { buildBackendHeaders, buildAiHeaders } from "@/lib/backend";
import { decrypt } from "@/lib/crypto";

export type RecipeInput = z.infer<typeof recipeBodySchema>;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Zusätzliche Spalten, die nur der Import setzt (Favorit, Quelle, Nährwerte). */
export interface RecipeExtras {
  isFavorite?: boolean;
  sourceUrl?: string | null;
  nutritionInfo?: unknown;
}

export async function createRecipe(
  tx: Tx,
  userId: string,
  data: RecipeInput,
  extras: RecipeExtras = {},
): Promise<Recipe> {
  const [newRecipe] = await tx
    .insert(recipes)
    .values({
      userId,
      title: data.title,
      description: data.description || null,
      instructions: data.instructions,
      servings: data.servings,
      prepTimeMinutes: data.prepTimeMinutes ?? null,
      cookTimeMinutes: data.cookTimeMinutes ?? null,
      totalTimeMinutes: calcTotalTime(
        data.prepTimeMinutes,
        data.cookTimeMinutes,
      ),
      difficulty: data.difficulty ?? null,
      category: data.category || null,
      cuisine: data.cuisine || null,
      tags: data.tags,
      sourceType: data.sourceType,
      isFavorite: extras.isFavorite ?? false,
      sourceUrl: extras.sourceUrl ?? null,
      nutritionInfo: (extras.nutritionInfo as Recipe["nutritionInfo"]) ?? null,
    })
    .returning();

  if (data.ingredients.length > 0) {
    await tx.insert(ingredients).values(
      data.ingredients.map((ing, idx) => ({
        recipeId: newRecipe.id,
        name: ing.name,
        amount: ing.amount != null ? String(ing.amount) : null,
        unit: ing.unit || null,
        groupName: ing.groupName || null,
        sortOrder: ing.sortOrder ?? idx,
        isOptional: ing.isOptional,
      })),
    );
  }

  return newRecipe;
}

/** Entschlüsselter Gemini-Schlüssel des Nutzers oder null. */
async function loadGeminiKey(userId: string): Promise<string | null> {
  const userRecord = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { apiKeyEncrypted: true, apiProvider: true },
  });
  if (userRecord?.apiProvider !== "gemini" || !userRecord.apiKeyEncrypted)
    return null;
  try {
    return decrypt(userRecord.apiKeyEncrypted);
  } catch {
    return null; // Schlüssel beschädigt — Embedding ohne Schlüssel versuchen
  }
}

type EmbeddableRecipe = Pick<
  Recipe,
  "id" | "title" | "description" | "instructions"
>;

/**
 * Text-Embeddings im Hintergrund anstossen. Ein Rezept: fire-and-forget wie
 * bisher. Viele Rezepte (Import): nacheinander mit kurzem Abstand, damit der
 * Backend-Container und das Gemini-Kontingent nicht mit N parallelen
 * Anfragen geflutet werden.
 */
export async function scheduleTextEmbeddings(
  userId: string,
  items: EmbeddableRecipe[],
  { delayMs = 250 }: { delayMs?: number } = {},
): Promise<void> {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl || items.length === 0) return;

  const geminiKey = await loadGeminiKey(userId);
  const headers = geminiKey ? buildAiHeaders(geminiKey) : buildBackendHeaders();

  for (const [i, recipe] of items.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, delayMs));
    await fetch(`${backendUrl}/embed/text`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        recipe_id: recipe.id,
        text: [recipe.title, recipe.description, recipe.instructions]
          .filter(Boolean)
          .join(" "),
      }),
      signal: AbortSignal.timeout(60_000),
    }).catch((err) => {
      console.error("Embedding-Berechnung fehlgeschlagen", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
