CREATE TYPE "public"."image_source_type" AS ENUM('upload', 'ai_generated', 'web_import');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('fruehstueck', 'mittagessen', 'abendessen', 'snack');--> statement-breakpoint
CREATE TYPE "public"."note_type" AS ENUM('tipp', 'variation', 'erinnerung', 'bewertung', 'allgemein');--> statement-breakpoint
CREATE TYPE "public"."recipe_difficulty" AS ENUM('einfach', 'mittel', 'anspruchsvoll');--> statement-breakpoint
CREATE TYPE "public"."recipe_source_type" AS ENUM('manual', 'image_ocr', 'url_import', 'ai_generated', 'web_search');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "collection_recipes" (
	"collection_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "collection_recipes_collection_id_recipe_id_pk" PRIMARY KEY("collection_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"cover_image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid,
	"file_path" text NOT NULL,
	"file_name" varchar(255),
	"mime_type" varchar(50) NOT NULL,
	"file_size_bytes" bigint,
	"width" integer,
	"height" integer,
	"source_type" "image_source_type" DEFAULT 'upload' NOT NULL,
	"alt_text" text,
	"extracted_text" text,
	"embedding" vector(3072),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"amount" numeric(10, 3),
	"unit" varchar(50),
	"group_name" varchar(255),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"recipe_id" uuid NOT NULL,
	"servings_override" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"note_type" "note_type" DEFAULT 'allgemein' NOT NULL,
	"rating" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_range" CHECK ("recipe_notes"."rating" IS NULL OR ("recipe_notes"."rating" >= 1 AND "recipe_notes"."rating" <= 5))
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"instructions" text NOT NULL,
	"servings" integer NOT NULL,
	"prep_time_minutes" integer,
	"cook_time_minutes" integer,
	"total_time_minutes" integer,
	"difficulty" "recipe_difficulty",
	"source_type" "recipe_source_type" DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"source_image_id" uuid,
	"cuisine" varchar(100),
	"category" varchar(100),
	"tags" text[] DEFAULT '{}',
	"is_favorite" boolean DEFAULT false NOT NULL,
	"embedding" vector(3072),
	"nutrition_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"recipe_id" uuid,
	"ingredient_name" varchar(255) NOT NULL,
	"amount" numeric(10, 3),
	"unit" varchar(50),
	"is_checked" boolean DEFAULT false NOT NULL,
	"aisle_category" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"password_hash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"api_key_encrypted" text,
	"api_provider" varchar(50),
	"preferred_servings" integer DEFAULT 4,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "collection_recipes" ADD CONSTRAINT "collection_recipes_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_recipes" ADD CONSTRAINT "collection_recipes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_cover_image_id_images_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_notes" ADD CONSTRAINT "recipe_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_source_image_id_images_id_fk" FOREIGN KEY ("source_image_id") REFERENCES "public"."images"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_images_recipe_id" ON "images" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_images_user_id" ON "images" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ingredients_recipe_id" ON "ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "idx_meal_plans_user_date" ON "meal_plans" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_recipe_notes_recipe_user" ON "recipe_notes" USING btree ("recipe_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_user_id" ON "recipes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_recipes_category" ON "recipes" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_recipes_is_favorite" ON "recipes" USING btree ("user_id","is_favorite");--> statement-breakpoint
CREATE INDEX "idx_shopping_list_user_checked" ON "shopping_list_items" USING btree ("user_id","is_checked");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");