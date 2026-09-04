import { NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  recipes,
  ingredients,
  recipeNotes,
  recipeCookLogs,
  collections,
  collectionRecipes,
  mealPlans,
  shoppingListItems,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  checkRateLimitDistributed,
  getClientIp,
  AUTH_LIMIT,
} from "@/lib/rate-limit";
import { backupSchema } from "@/lib/backup/schema";
import { createRecipe, scheduleTextEmbeddings } from "@/lib/recipes/create";
import { recipeDuplicateKey } from "@/lib/backup/duplicates";

/** 20 MB reichen für mehrere tausend Rezepte ohne Bilder. */
const MAX_BODY_BYTES = 20 * 1024 * 1024;

export interface ImportSummary {
  imported: {
    recipes: number;
    notes: number;
    cookLogs: number;
    collections: number;
    mealPlans: number;
    shoppingItems: number;
  };
  skipped: {
    recipes: number;
    collections: number;
    mealPlans: number;
    shoppingItems: number;
  };
  embeddingQueued: number;
}

/**
 * POST /api/import — Backup wieder einspielen. Fügt hinzu, überschreibt nie:
 * Rezepte mit gleichem Titel und gleichen Zutaten gelten als bereits vorhanden.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimitDistributed(`import:${ip}`, AUTH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }
  const userId = session.user.id;

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Datei zu gross (max. 20 MB)." },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Datei zu gross (max. 20 MB)." },
        { status: 413 },
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Ungültige JSON-Datei." },
      { status: 400 },
    );
  }

  const parsed = backupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Das ist kein gültiges Rezeptmeister-Backup.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const backup = parsed.data;

  // Duplikatschutz: bestehende Rezepte des Nutzers nach Titel + Zutaten
  const existingRows = await db
    .select({
      id: recipes.id,
      title: recipes.title,
      ingredientName: ingredients.name,
    })
    .from(recipes)
    .leftJoin(ingredients, eq(ingredients.recipeId, recipes.id))
    .where(eq(recipes.userId, userId));
  const existingKeys = new Set<string>();
  {
    const byRecipe = new Map<string, { title: string; names: string[] }>();
    for (const row of existingRows) {
      const entry = byRecipe.get(row.id) ?? { title: row.title, names: [] };
      if (row.ingredientName) entry.names.push(row.ingredientName);
      byRecipe.set(row.id, entry);
    }
    for (const { title, names } of byRecipe.values()) {
      existingKeys.add(recipeDuplicateKey(title, names));
    }
  }

  const summary: ImportSummary = {
    imported: {
      recipes: 0,
      notes: 0,
      cookLogs: 0,
      collections: 0,
      mealPlans: 0,
      shoppingItems: 0,
    },
    skipped: { recipes: 0, collections: 0, mealPlans: 0, shoppingItems: 0 },
    embeddingQueued: 0,
  };
  const created: {
    id: string;
    title: string;
    description: string | null;
    instructions: string;
  }[] = [];

  try {
    await db.transaction(async (tx) => {
      // Alt-ID → neue ID, damit Sammlungen und Wochenplan wieder zusammenfinden
      const idMap = new Map<string, string>();

      for (const r of backup.recipes) {
        const key = recipeDuplicateKey(
          r.title,
          r.ingredients.map((i) => i.name),
        );
        if (existingKeys.has(key)) {
          summary.skipped.recipes += 1;
          continue;
        }
        existingKeys.add(key);

        const {
          id: oldId,
          notes,
          cookLogs,
          images: _images,
          isFavorite,
          sourceUrl,
          nutritionInfo,
          createdAt: _c,
          updatedAt: _u,
          ...input
        } = r;
        void _images;
        void _c;
        void _u;
        const newRecipe = await createRecipe(tx, userId, input, {
          isFavorite,
          sourceUrl,
          nutritionInfo,
        });
        idMap.set(oldId, newRecipe.id);
        created.push(newRecipe);
        summary.imported.recipes += 1;

        if (notes.length > 0) {
          await tx.insert(recipeNotes).values(
            notes.map((n) => ({
              recipeId: newRecipe.id,
              userId,
              content: n.content,
              noteType: n.noteType,
              rating: n.rating,
              createdAt: new Date(n.createdAt),
              updatedAt: new Date(n.createdAt),
            })),
          );
          summary.imported.notes += notes.length;
        }
        if (cookLogs.length > 0) {
          await tx.insert(recipeCookLogs).values(
            cookLogs.map((c) => ({
              recipeId: newRecipe.id,
              userId,
              cookedOn: c.cookedOn,
              servings: c.servings,
              note: c.note,
            })),
          );
          summary.imported.cookLogs += cookLogs.length;
        }
      }

      // Übersprungene Rezepte: ihre Alt-IDs auf das vorhandene Rezept abbilden,
      // damit Sammlungen und Wochenplan auf Bestehendes zeigen können.
      const unmapped = backup.recipes.filter((r) => !idMap.has(r.id));
      if (unmapped.length > 0) {
        const byTitle = new Map<string, string>();
        for (const row of existingRows) {
          if (!byTitle.has(row.title.trim().toLowerCase())) {
            byTitle.set(row.title.trim().toLowerCase(), row.id);
          }
        }
        for (const r of unmapped) {
          const id = byTitle.get(r.title.trim().toLowerCase());
          if (id) idMap.set(r.id, id);
        }
      }

      // Duplikatschutz wie bei Rezepten, hier ueber den Namen. Ohne ihn legte
      // jedes erneute Einspielen desselben Backups saemtliche Sammlungen noch
      // einmal an — die Tabelle verdoppelte sich bei jedem Durchlauf, waehrend
      // die Rezepte korrekt uebersprungen wurden.
      const bestehendeNamen = new Set(
        (
          await tx
            .select({ name: collections.name })
            .from(collections)
            .where(eq(collections.userId, userId))
        ).map((row) => row.name.trim().toLowerCase()),
      );

      for (const c of backup.collections) {
        if (bestehendeNamen.has(c.name.trim().toLowerCase())) {
          summary.skipped.collections += 1;
          continue;
        }
        bestehendeNamen.add(c.name.trim().toLowerCase());
        const recipeIds = c.recipeIds
          .map((id) => idMap.get(id))
          .filter((id): id is string => !!id);
        const [newCollection] = await tx
          .insert(collections)
          .values({
            userId,
            name: c.name,
            description: c.description,
            createdAt: new Date(c.createdAt),
          })
          .returning({ id: collections.id });
        if (recipeIds.length > 0) {
          await tx
            .insert(collectionRecipes)
            .values(
              recipeIds.map((recipeId, idx) => ({
                collectionId: newCollection.id,
                recipeId,
                sortOrder: idx,
              })),
            )
            .onConflictDoNothing();
        }
        summary.imported.collections += 1;
      }

      if (backup.mealPlans.length > 0) {
        const values = backup.mealPlans
          .map((m) => ({ ...m, recipeId: idMap.get(m.recipeId) }))
          .filter((m): m is typeof m & { recipeId: string } => !!m.recipeId)
          .map((m) => ({
            userId,
            date: m.date,
            mealType: m.mealType,
            recipeId: m.recipeId,
            servingsOverride: m.servingsOverride,
            notes: m.notes,
          }));
        if (values.length > 0) {
          const inserted = await tx
            .insert(mealPlans)
            .values(values)
            .onConflictDoNothing({
              target: [mealPlans.userId, mealPlans.date, mealPlans.mealType],
            })
            .returning({ id: mealPlans.id });
          summary.imported.mealPlans = inserted.length;
        }
        summary.skipped.mealPlans =
          backup.mealPlans.length - summary.imported.mealPlans;
      }

      if (backup.shoppingList.length > 0) {
        const inserted = await tx
          .insert(shoppingListItems)
          .values(
            backup.shoppingList.map((s) => ({
              userId,
              ingredientName: s.ingredientName,
              amount: s.amount != null ? String(s.amount) : null,
              unit: s.unit,
              isChecked: s.isChecked,
              aisleCategory: s.aisleCategory,
              sortOrder: s.sortOrder,
              recipeId: s.recipeId ? (idMap.get(s.recipeId) ?? null) : null,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: shoppingListItems.id });
        summary.imported.shoppingItems = inserted.length;
        summary.skipped.shoppingItems =
          backup.shoppingList.length - inserted.length;
      }
    });
  } catch (err) {
    console.error("Backup-Import fehlgeschlagen", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Import fehlgeschlagen — es wurde nichts geändert." },
      { status: 500 },
    );
  }

  // Suche im Hintergrund nachziehen, nach der Antwort
  summary.embeddingQueued = created.length;
  if (created.length > 0) {
    after(() => scheduleTextEmbeddings(userId, created));
  }

  return NextResponse.json(summary, { status: 201 });
}

