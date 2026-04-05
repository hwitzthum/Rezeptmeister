import { z } from "zod";

export const ingredientSchema = z.object({
  name: z.string().min(1, "Zutatname ist erforderlich.").max(255),
  amount: z.number().positive().nullable().optional(),
  unit: z.string().max(50).optional(),
  groupName: z.string().max(255).optional(),
  sortOrder: z.number().int().min(0).default(0),
  isOptional: z.boolean().default(false),
});

export const recipeBodySchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich.").max(500),
  description: z.string().max(5000).optional(),
  instructions: z.string().min(1, "Zubereitung ist erforderlich.").max(50000),
  servings: z.number().int().min(1).max(999).default(4),
  prepTimeMinutes: z.number().int().min(0).max(9999).nullable().optional(),
  cookTimeMinutes: z.number().int().min(0).max(9999).nullable().optional(),
  difficulty: z.enum(["einfach", "mittel", "anspruchsvoll"]).nullable().optional(),
  category: z.string().max(100).optional(),
  cuisine: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  sourceType: z
    .enum(["manual", "image_ocr", "url_import", "ai_generated", "web_search"])
    .default("manual"),
  ingredients: z.array(ingredientSchema).max(200).default([]),
});

/** Returns the sum of prep + cook time, or null if both are zero/absent. */
export function calcTotalTime(
  prep?: number | null,
  cook?: number | null,
): number | null {
  const total = (prep ?? 0) + (cook ?? 0);
  return total > 0 ? total : null;
}
