-- Phase 21: Kochhistorie.
-- Ein Eintrag je «gekocht am» (tagesgenau, Zurich-Datum). Speist Dashboard,
-- Rezeptkarten («3x gekocht»), das Geschmacksprofil der KI-Vorschlaege und
-- den KI-Wochenplan (lange nicht Gekochtes bevorzugen).
-- Idempotent, damit die Datei auch im Supabase-SQL-Editor wiederholbar ist.

CREATE TABLE IF NOT EXISTS "recipe_cook_logs" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id"  uuid NOT NULL REFERENCES "recipes"("id") ON DELETE CASCADE,
  "user_id"    uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "cooked_on"  date NOT NULL,
  "servings"   integer,
  "note"       text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipe_cook_logs_recipe"
  ON "recipe_cook_logs" ("user_id", "recipe_id", "cooked_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recipe_cook_logs_user_date"
  ON "recipe_cook_logs" ("user_id", "cooked_on");
