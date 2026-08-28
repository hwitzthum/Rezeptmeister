-- Phase 20: Smarte Suche — Praefix-, Tippfehler- und Zutatentreffer
--
-- Bisher fand die Suche nur ganze, gestemmte Woerter ("Zop" fand "Zopf" nicht).
-- pg_trgm ergaenzt die Volltextsuche um Aehnlichkeit; rm_normalize() bildet
-- Umlaute und Eszett auf ihre Ersatzschreibung ab, damit "Rösti" und "Roesti"
-- einander finden. Die Funktion ist IMMUTABLE, deshalb koennen die
-- GIN-Trigramm-Indizes direkt auf ihrem Ergebnis liegen — sie stuetzen sowohl
-- die Teilzeichenketten-Suche (LIKE '%...%') als auch die Aehnlichkeitssuche.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rm_normalize(txt text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT replace(replace(replace(replace(lower(txt), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss')
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_recipes_title_norm_trgm ON recipes USING GIN (rm_normalize(title) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingredients_name_norm_trgm ON ingredients USING GIN (rm_normalize(name) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingredients_recipe_id ON ingredients (recipe_id);
