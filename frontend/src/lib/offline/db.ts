import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RecipeDetail } from "@/components/recipes/RecipeDetailClient";

// ── Schema ───────────────────────────────────────────────────────────────────

interface CachedImageBlob {
  id: string;
  blob: Blob;
  filePath: string;
}

export interface OfflineRecipe {
  /** Composite key: `${userId}:${recipeId}` */
  id: string;
  recipeId: string;
  userId: string;
  data: RecipeDetail;
  imageThumbnails: CachedImageBlob[];
  cachedAt: number;
}

interface RezeptmeisterOfflineDB extends DBSchema {
  recipes: {
    key: string;
    value: OfflineRecipe;
    indexes: { userId: string; cachedAt: number };
  };
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = "rezeptmeister-offline";
const DB_VERSION = 2;

function compositeKey(userId: string, recipeId: string): string {
  return `${userId}:${recipeId}`;
}

let dbPromise: Promise<IDBPDatabase<RezeptmeisterOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<RezeptmeisterOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // V1 had a global keyPath=recipeId — delete it and recreate per-user
        if (oldVersion < 2 && db.objectStoreNames.contains("recipes")) {
          db.deleteObjectStore("recipes");
        }
        if (!db.objectStoreNames.contains("recipes")) {
          const store = db.createObjectStore("recipes", {
            keyPath: "id",
          });
          store.createIndex("userId", "userId", { unique: false });
          store.createIndex("cachedAt", "cachedAt", { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// ── User ID persistence (localStorage) ──────────────────────────────────────

const OFFLINE_USER_KEY = "offlineUserId";

export function setOfflineUserId(userId: string): void {
  try {
    localStorage.setItem(OFFLINE_USER_KEY, userId);
  } catch {
    // Private browsing or quota — non-critical
  }
}

export function getOfflineUserId(): string | null {
  try {
    return localStorage.getItem(OFFLINE_USER_KEY);
  } catch {
    return null;
  }
}

// ── Public API — all operations are scoped to userId ─────────────────────────

export async function saveRecipeOffline(
  userId: string,
  recipeId: string,
  data: RecipeDetail,
  imageThumbnails: CachedImageBlob[],
): Promise<void> {
  const db = await getDb();
  await db.put("recipes", {
    id: compositeKey(userId, recipeId),
    recipeId,
    userId,
    data,
    imageThumbnails,
    cachedAt: Date.now(),
  });
  setOfflineUserId(userId);
}

export async function removeRecipeOffline(
  userId: string,
  recipeId: string,
): Promise<void> {
  const db = await getDb();
  await db.delete("recipes", compositeKey(userId, recipeId));
}

export async function getOfflineRecipe(
  userId: string,
  recipeId: string,
): Promise<OfflineRecipe | undefined> {
  const db = await getDb();
  return db.get("recipes", compositeKey(userId, recipeId));
}

export async function getAllOfflineRecipes(
  userId: string,
): Promise<OfflineRecipe[]> {
  const db = await getDb();
  return db.getAllFromIndex("recipes", "userId", userId);
}

export async function isRecipeOffline(
  userId: string,
  recipeId: string,
): Promise<boolean> {
  const db = await getDb();
  const entry = await db.get("recipes", compositeKey(userId, recipeId));
  return !!entry;
}

