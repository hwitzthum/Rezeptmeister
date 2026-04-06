-- Adversarial-Review Fix: Duplikate in shopping_list_items bereinigen
-- und Unique-Index als strukturelle DB-Absicherung hinzufuegen.

-- Schritt 1: Mengen der Keeper-Zeilen aktualisieren (Summe aller Duplikate)
UPDATE shopping_list_items s
SET amount = sub.total_amount
FROM (
  SELECT
    user_id,
    lower(trim(ingredient_name)) AS norm_name,
    lower(trim(coalesce(unit, ''))) AS norm_unit,
    min(id::text)::uuid AS keep_id,
    sum(amount) AS total_amount
  FROM shopping_list_items
  GROUP BY user_id, lower(trim(ingredient_name)), lower(trim(coalesce(unit, '')))
  HAVING count(*) > 1
) sub
WHERE s.id = sub.keep_id;--> statement-breakpoint
-- Schritt 2: Ueberzaehlige Duplikate loeschen (nur Keeper behalten)
DELETE FROM shopping_list_items s
USING (
  SELECT
    user_id,
    lower(trim(ingredient_name)) AS norm_name,
    lower(trim(coalesce(unit, ''))) AS norm_unit,
    min(id::text)::uuid AS keep_id
  FROM shopping_list_items
  GROUP BY user_id, lower(trim(ingredient_name)), lower(trim(coalesce(unit, '')))
  HAVING count(*) > 1
) sub
WHERE s.user_id = sub.user_id
  AND lower(trim(s.ingredient_name)) = sub.norm_name
  AND lower(trim(coalesce(s.unit, ''))) = sub.norm_unit
  AND s.id != sub.keep_id;--> statement-breakpoint
-- Schritt 3: Unique-Index erstellen
CREATE UNIQUE INDEX IF NOT EXISTS "idx_shopping_list_unique_ingredient"
  ON "shopping_list_items" (user_id, lower(trim(ingredient_name)), lower(trim(coalesce(unit, ''))));
