/**
 * Drizzle ORM Schema – Rezeptmeister
 * Spiegelt db/init.sql 1:1 wider (PostgreSQL + pgvector)
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  decimal,
  bigint,
  jsonb,
  timestamp,
  date,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { customType } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ── pgvector custom type ────────────────────────────────────────
export const vector = customType<{
  data: number[];
  config: { dimensions: number };
  configRequired: true;
  driverData: string;
}>({
  dataType(config) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
  },
});

// ── Enums ────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["admin", "user"]);
export const userStatusEnum = pgEnum("user_status", [
  "pending",
  "approved",
  "rejected",
]);
export const recipeDifficultyEnum = pgEnum("recipe_difficulty", [
  "einfach",
  "mittel",
  "anspruchsvoll",
]);
export const recipeSourceTypeEnum = pgEnum("recipe_source_type", [
  "manual",
  "image_ocr",
  "url_import",
  "ai_generated",
  "web_search",
]);
export const imageSourceTypeEnum = pgEnum("image_source_type", [
  "upload",
  "ai_generated",
  "web_import",
]);
export const noteTypeEnum = pgEnum("note_type", [
  "tipp",
  "variation",
  "erinnerung",
  "bewertung",
  "allgemein",
]);
export const mealTypeEnum = pgEnum("meal_type", [
  "fruehstueck",
  "mittagessen",
  "abendessen",
  "snack",
]);

// ── users ────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }),
    passwordHash: text("password_hash"),
    role: userRoleEnum("role").notNull().default("user"),
    status: userStatusEnum("status").notNull().default("pending"),
    apiKeyEncrypted: text("api_key_encrypted"),
    apiProvider: varchar("api_provider", { length: 50 }),
    preferredServings: integer("preferred_servings").default(4),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("idx_users_email").on(t.email),
    index("idx_users_status").on(t.status),
  ],
);

// ── images (vor recipes wegen FK) ────────────────────────────────
export const images = pgTable(
  "images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // recipeId: FK kommt nach recipes-Definition
    recipeId: uuid("recipe_id"),
    filePath: text("file_path").notNull(),
    fileName: varchar("file_name", { length: 255 }),
    mimeType: varchar("mime_type", { length: 50 }).notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    sourceType: imageSourceTypeEnum("source_type").notNull().default("upload"),
    altText: text("alt_text"),
    extractedText: text("extracted_text"),
    embedding: vector("embedding", { dimensions: 3072 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_images_recipe_id").on(t.recipeId),
    index("idx_images_user_id").on(t.userId),
  ],
);

// ── recipes ──────────────────────────────────────────────────────
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    instructions: text("instructions").notNull(),
    servings: integer("servings").notNull(),
    prepTimeMinutes: integer("prep_time_minutes"),
    cookTimeMinutes: integer("cook_time_minutes"),
    totalTimeMinutes: integer("total_time_minutes"),
    difficulty: recipeDifficultyEnum("difficulty"),
    sourceType: recipeSourceTypeEnum("source_type")
      .notNull()
      .default("manual"),
    sourceUrl: text("source_url"),
    sourceImageId: uuid("source_image_id").references(() => images.id, {
      onDelete: "set null",
    }),
    cuisine: varchar("cuisine", { length: 100 }),
    category: varchar("category", { length: 100 }),
    tags: text("tags").array().default([]),
    isFavorite: boolean("is_favorite").notNull().default(false),
    embedding: vector("embedding", { dimensions: 3072 }),
    nutritionInfo: jsonb("nutrition_info"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_recipes_user_id").on(t.userId),
    index("idx_recipes_category").on(t.category),
    index("idx_recipes_is_favorite").on(t.userId, t.isFavorite),
  ],
);

// ── ingredients ───────────────────────────────────────────────────
export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 3 }),
    unit: varchar("unit", { length: 50 }),
    groupName: varchar("group_name", { length: 255 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isOptional: boolean("is_optional").notNull().default(false),
  },
  (t) => [index("idx_ingredients_recipe_id").on(t.recipeId)],
);

// ── recipe_notes ──────────────────────────────────────────────────
export const recipeNotes = pgTable(
  "recipe_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    noteType: noteTypeEnum("note_type").notNull().default("allgemein"),
    rating: integer("rating"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_recipe_notes_recipe_user").on(t.recipeId, t.userId),
    check("rating_range", sql`${t.rating} IS NULL OR (${t.rating} >= 1 AND ${t.rating} <= 5)`),
  ],
);

// ── shopping_list_items ───────────────────────────────────────────
export const shoppingListItems = pgTable(
  "shopping_list_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id").references(() => recipes.id, {
      onDelete: "set null",
    }),
    ingredientName: varchar("ingredient_name", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 10, scale: 3 }),
    unit: varchar("unit", { length: 50 }),
    isChecked: boolean("is_checked").notNull().default(false),
    aisleCategory: varchar("aisle_category", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
    mealPlanEntryId: uuid("meal_plan_entry_id").references(
      () => mealPlans.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_shopping_list_user_checked").on(t.userId, t.isChecked),
  ],
);

// ── meal_plans ────────────────────────────────────────────────────
export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    mealType: mealTypeEnum("meal_type").notNull(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    servingsOverride: integer("servings_override"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_meal_plans_user_date").on(t.userId, t.date),
    uniqueIndex("idx_meal_plans_unique_slot").on(t.userId, t.date, t.mealType),
  ],
);

// ── collections ───────────────────────────────────────────────────
export const collections = pgTable("collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  coverImageId: uuid("cover_image_id").references(() => images.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── collection_recipes (join table) ───────────────────────────────
export const collectionRecipes = pgTable(
  "collection_recipes",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.recipeId] })],
);

// ── Relations ─────────────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  recipes: many(recipes),
  images: many(images),
  recipeNotes: many(recipeNotes),
  shoppingListItems: many(shoppingListItems),
  mealPlans: many(mealPlans),
  collections: many(collections),
}));

export const recipesRelations = relations(recipes, ({ one, many }) => ({
  user: one(users, { fields: [recipes.userId], references: [users.id] }),
  ingredients: many(ingredients),
  images: many(images),
  recipeNotes: many(recipeNotes),
  collectionRecipes: many(collectionRecipes),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  recipe: one(recipes, {
    fields: [ingredients.recipeId],
    references: [recipes.id],
  }),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  user: one(users, { fields: [images.userId], references: [users.id] }),
  recipe: one(recipes, { fields: [images.recipeId], references: [recipes.id] }),
}));

export const recipeNotesRelations = relations(recipeNotes, ({ one }) => ({
  recipe: one(recipes, {
    fields: [recipeNotes.recipeId],
    references: [recipes.id],
  }),
  user: one(users, { fields: [recipeNotes.userId], references: [users.id] }),
}));

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  user: one(users, { fields: [shoppingListItems.userId], references: [users.id] }),
  recipe: one(recipes, { fields: [shoppingListItems.recipeId], references: [recipes.id] }),
  mealPlanEntry: one(mealPlans, {
    fields: [shoppingListItems.mealPlanEntryId],
    references: [mealPlans.id],
  }),
}));

export const mealPlansRelations = relations(mealPlans, ({ one }) => ({
  user: one(users, { fields: [mealPlans.userId], references: [users.id] }),
  recipe: one(recipes, { fields: [mealPlans.recipeId], references: [recipes.id] }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, { fields: [collections.userId], references: [users.id] }),
  collectionRecipes: many(collectionRecipes),
}));

export const collectionRecipesRelations = relations(
  collectionRecipes,
  ({ one }) => ({
    collection: one(collections, {
      fields: [collectionRecipes.collectionId],
      references: [collections.id],
    }),
    recipe: one(recipes, {
      fields: [collectionRecipes.recipeId],
      references: [recipes.id],
    }),
  }),
);

// ── Inferred Types ────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;
export type Ingredient = typeof ingredients.$inferSelect;
export type NewIngredient = typeof ingredients.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type RecipeNote = typeof recipeNotes.$inferSelect;
export type NewRecipeNote = typeof recipeNotes.$inferInsert;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type NewShoppingListItem = typeof shoppingListItems.$inferInsert;
export type MealPlan = typeof mealPlans.$inferSelect;
export type NewMealPlan = typeof mealPlans.$inferInsert;
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
