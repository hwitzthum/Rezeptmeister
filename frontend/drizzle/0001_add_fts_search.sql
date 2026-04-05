-- Phase 5: Volltext-Suchvektor (Deutsch) hinzufügen
-- GENERATED ALWAYS AS (STORED): Drizzle kann diesen Spaltentyp nicht modellieren,
-- daher wird er als manuelle Migration verwaltet.

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fts_vector TSVECTOR
    GENERATED ALWAYS AS (
        setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('german', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('german', coalesce(instructions, '')), 'C')
    ) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recipes_fts ON recipes USING GIN (fts_vector);
