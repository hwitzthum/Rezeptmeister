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

/** Shape of a shopping-list row as it travels over the API and is cached. */
export interface ShoppingItem {
  id: string;
  ingredientName: string;
  amount: string | null;
  unit: string | null;
  isChecked: boolean;
  aisleCategory: string | null;
  recipeId: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface OfflineShoppingList {
  userId: string;
  items: ShoppingItem[];
  updatedAt: number;
}

export type PendingOpKind = "toggle" | "add" | "delete" | "checkAll" | "clear";

/** A queued mutation before IndexedDB assigned its auto-increment key. */
export interface PendingOpInput {
  userId: string;
  kind: PendingOpKind;
  payload: unknown;
  createdAt: number;
}

/** A queued mutation as read back from IndexedDB. */
export interface PendingOp extends PendingOpInput {
  id: number;
}

interface RezeptmeisterOfflineDB extends DBSchema {
  recipes: {
    key: string;
    value: OfflineRecipe;
    indexes: { userId: string; cachedAt: number };
  };
  shoppingList: {
    key: string;
    value: OfflineShoppingList;
  };
  pendingOps: {
    key: number;
    value: PendingOpInput & { id?: number };
    indexes: { userId: string };
  };
}

// ── Database ─────────────────────────────────────────────────────────────────

const DB_NAME = "rezeptmeister-offline";
const DB_VERSION = 3;

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
        // V3 — offline shopping list. Guarded by `contains` so the callback
        // runs cleanly from any previous version (idb replays it once with
        // the actual oldVersion, not once per version step).
        if (!db.objectStoreNames.contains("shoppingList")) {
          db.createObjectStore("shoppingList", { keyPath: "userId" });
        }
        if (!db.objectStoreNames.contains("pendingOps")) {
          const ops = db.createObjectStore("pendingOps", {
            keyPath: "id",
            autoIncrement: true,
          });
          ops.createIndex("userId", "userId", { unique: false });
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

// ── Shopping list snapshot ───────────────────────────────────────────────────

export async function saveShoppingListOffline(
  userId: string,
  items: ShoppingItem[],
): Promise<void> {
  const db = await getDb();
  await db.put("shoppingList", { userId, items, updatedAt: Date.now() });
}

export async function getOfflineShoppingList(
  userId: string,
): Promise<OfflineShoppingList | undefined> {
  const db = await getDb();
  return db.get("shoppingList", userId);
}

// ── Pending operation queue ──────────────────────────────────────────────────

export async function addPendingOp(op: PendingOpInput): Promise<number> {
  const db = await getDb();
  return db.add("pendingOps", op) as Promise<number>;
}

/** All queued ops of a user, oldest first — replay order is insertion order. */
export async function getPendingOps(userId: string): Promise<PendingOp[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex("pendingOps", "userId", userId);
  return rows
    .filter((row): row is PendingOp => typeof row.id === "number")
    .sort((a, b) => a.id - b.id);
}

/** Overwrites a queued op in place — used to persist temp → server id remaps. */
export async function putPendingOp(op: PendingOp): Promise<void> {
  const db = await getDb();
  await db.put("pendingOps", op);
}

export async function deletePendingOp(id: number): Promise<void> {
  const db = await getDb();
  await db.delete("pendingOps", id);
}

export async function countPendingOps(userId: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("pendingOps", "userId", userId);
}
