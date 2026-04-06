-- Rezeptmeister – Testdaten (Schweizer Musterrezepte)
-- Wird nur in der Entwicklungsumgebung ausgeführt
-- Idempotent: kann beliebig oft ausgeführt werden ohne Duplikate

-- Admin-Benutzer (Passwort: 05!Shakespeare_15)
INSERT INTO users (id, email, name, password_hash, role, status) VALUES
    ('00000000-0000-0000-0000-000000000001',
     'harrywitzthum@gmail.com',
     'Harry Witzthum',
     '$2b$12$11dCoVbnkYqUb/uUO2M3deWvK6M9PCRJF5UhVs.LAebhe9ge/KGCW', -- 05!Shakespeare_15
     'admin',
     'approved')
ON CONFLICT (id) DO NOTHING;

-- Test-Benutzer (Passwort: test1234)
INSERT INTO users (id, email, name, password_hash, role, status) VALUES
    ('00000000-0000-0000-0000-000000000002',
     'test@rezeptmeister.ch',
     'Test Benutzer',
     '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', -- test1234
     'user',
     'approved')
ON CONFLICT (id) DO NOTHING;

-- Musterrezept 1: Zürcher Geschnetzeltes
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000002',
     'Zürcher Geschnetzeltes',
     'Das klassische Zürcher Geschnetzelte mit Kalbfleisch und Rahmsauce – ein Schweizer Klassiker.',
     '1. Kalbfleisch in feine Streifen schneiden und mit Salz und Pfeffer würzen.
2. Zwiebeln und Champignons fein schneiden.
3. Butter in einer grossen Pfanne erhitzen, Zwiebeln darin glasig dünsten.
4. Champignons hinzufügen und kurz anbraten.
5. Fleisch portionsweise scharf anbraten (nicht übereinanderschichten).
6. Weisswein dazugeben und einkochen lassen.
7. Rahm und Kalbsfond hinzufügen, 5 Minuten köcheln lassen.
8. Mit Salz, Pfeffer und Zitronensaft abschmecken.
9. Mit Rösti oder Nudeln servieren.',
     4, 20, 25, 45, 'mittel', 'manual', 'Schweizerisch', 'Hauptgericht',
     ARRAY['Klassiker', 'Schweiz', 'Fleisch', 'Kalbfleisch'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000001'::uuid, 'Kalbsnierstück', 600::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000001', 'Champignons', 300, 'g', 2),
    ('10000000-0000-0000-0000-000000000001', 'Zwiebeln', 2, 'Stk.', 3),
    ('10000000-0000-0000-0000-000000000001', 'Butter', 50, 'g', 4),
    ('10000000-0000-0000-0000-000000000001', 'Weisswein (trocken)', 1, 'dl', 5),
    ('10000000-0000-0000-0000-000000000001', 'Kalbsfond', 2, 'dl', 6),
    ('10000000-0000-0000-0000-000000000001', 'Rahm (Vollrahm)', 2, 'dl', 7),
    ('10000000-0000-0000-0000-000000000001', 'Zitronensaft', 1, 'EL', 8),
    ('10000000-0000-0000-0000-000000000001', 'Salz und Pfeffer', NULL::decimal, NULL, 9)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000001');

-- Musterrezept 2: Birchermüesli
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000002',
     '00000000-0000-0000-0000-000000000002',
     'Birchermüesli',
     'Das Original Birchermüesli nach Dr. Bircher-Benner – gesund, cremig und voller Früchte.',
     '1. Haferflocken mit Milch über Nacht (oder mindestens 1 Stunde) einweichen.
2. Am nächsten Morgen Joghurt, Zitronensaft und Honig unterrühren.
3. Äpfel kurz vor dem Servieren reiben und sofort untermischen (damit sie nicht braun werden).
4. Nüsse und Beeren darübergeben.
5. Nach Belieben mit frischen Früchten der Saison garnieren.',
     2, 10, 0, 10, 'einfach', 'manual', 'Schweizerisch', 'Frühstück',
     ARRAY['Frühstück', 'Gesund', 'Vegetarisch', 'Schnell', 'Ohne Kochen'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000002'::uuid, 'Zarte Haferflocken', 6::decimal, 'EL', 1),
    ('10000000-0000-0000-0000-000000000002', 'Milch', 1.5, 'dl', 2),
    ('10000000-0000-0000-0000-000000000002', 'Naturjoghurt', 1.5, 'dl', 3),
    ('10000000-0000-0000-0000-000000000002', 'Zitronensaft', 1, 'EL', 4),
    ('10000000-0000-0000-0000-000000000002', 'Honig', 1, 'EL', 5),
    ('10000000-0000-0000-0000-000000000002', 'Äpfel (gerieben)', 2, 'Stk.', 6),
    ('10000000-0000-0000-0000-000000000002', 'Gemischte Nüsse (gehackt)', 2, 'EL', 7),
    ('10000000-0000-0000-0000-000000000002', 'Beeren (frisch oder tiefgefroren)', 100::decimal, 'g', 8)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000002');

-- Musterrezept 3: Rösti
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags, is_favorite) VALUES
    ('10000000-0000-0000-0000-000000000003',
     '00000000-0000-0000-0000-000000000002',
     'Berner Rösti',
     'Knusprige Rösti aus vorgekochten Kartoffeln – die Beilage schlechthin der Schweizer Küche.',
     '1. Kartoffeln am Vortag kochen (fest kochend), abkühlen lassen und im Kühlschrank aufbewahren.
2. Kartoffeln grob reiben.
3. Zwiebeln fein würfeln und in Butter weichdünsten.
4. Geriebene Kartoffeln dazugeben, mit Salz und Pfeffer würzen.
5. Kartoffelmasse flach in der Pfanne andrücken und auf mittlerer Hitze 10–12 Minuten goldbraun braten.
6. Mit einem Teller wenden: Teller auf die Pfanne legen, Pfanne umdrehen, Rösti zurückgleiten lassen.
7. Weitere 10 Minuten braten, bis auch die zweite Seite goldbraun ist.',
     4, 15, 25, 40, 'mittel', 'manual', 'Schweizerisch', 'Beilage',
     ARRAY['Schweiz', 'Vegetarisch', 'Klassiker', 'Kartoffeln'], true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000003'::uuid, 'Mehlig kochende Kartoffeln (vorgekocht)', 800::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000003', 'Zwiebeln', 1, 'Stk.', 2),
    ('10000000-0000-0000-0000-000000000003', 'Butter', 60, 'g', 3),
    ('10000000-0000-0000-0000-000000000003', 'Salz', 1, 'TL', 4),
    ('10000000-0000-0000-0000-000000000003', 'Pfeffer', 1::decimal, 'Msp.', 5)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000003');

-- Musterrezept 4: Käseschnitten
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000004',
     '00000000-0000-0000-0000-000000000002',
     'Schweizer Käseschnitten',
     'Herzhafte überbackene Käseschnitten – perfekt als schnelles Mittagessen oder Zvieri.',
     '1. Backofengrill auf 220°C vorheizen.
2. Brotscheiben auf einem Backblech verteilen und kurz im Ofen rösten.
3. Jede Scheibe mit etwas Senf bestreichen.
4. Käse in dünne Scheiben schneiden und üppig auf das Brot legen.
5. Unter dem Grill 5–7 Minuten überbacken, bis der Käse blubbert und goldbraun ist.
6. Sofort mit Cornichons und frischem Salat servieren.',
     2, 5, 10, 15, 'einfach', 'manual', 'Schweizerisch', 'Snack',
     ARRAY['Schnell', 'Käse', 'Vegetarisch', 'Zvieri'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000004'::uuid, 'Ruchbrot (Scheiben)', 4::decimal, 'Scheibe', 1),
    ('10000000-0000-0000-0000-000000000004', 'Gruyère oder Emmentaler', 200, 'g', 2),
    ('10000000-0000-0000-0000-000000000004', 'Mittelscharfer Senf', 2, 'TL', 3),
    ('10000000-0000-0000-0000-000000000004', 'Cornichons (zum Servieren)', NULL::decimal, NULL, 4)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000004');

-- Musterrezept 5: Apfelwähe
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000005',
     '00000000-0000-0000-0000-000000000002',
     'Schweizer Apfelwähe',
     'Die klassische Schweizer Apfelwähe aus Mürbeteig mit Zimtäpfeln und Guss – unverzichtbar im Herbst.',
     '1. Mehl, Butter, Salz und kaltes Wasser zu einem Mürbeteig verkneten. 30 Minuten kühl stellen.
2. Ofen auf 200°C (Ober-/Unterhitze) vorheizen.
3. Teig auf einer bemehlten Fläche ausrollen und in eine gefettete Wähenform (28 cm) legen.
4. Äpfel schälen, entkernen und in feine Scheiben schneiden. Mit Zimt und Zucker mischen.
5. Apfelscheiben fächerartig auf dem Teig verteilen.
6. Eier, Rahm und Zucker für den Guss verquirlen und über die Äpfel giessen.
7. Im Ofen 35–40 Minuten backen, bis der Guss gestockt und der Teig goldbraun ist.
8. Lauwarm oder kalt servieren, nach Belieben mit Schlagsahne.',
     8, 30, 40, 70, 'mittel', 'manual', 'Schweizerisch', 'Dessert',
     ARRAY['Dessert', 'Backen', 'Vegetarisch', 'Herbst', 'Äpfel', 'Wähe'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000005'::uuid, 'Mehl (Weissmehl)', 250::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000005', 'Kalte Butter (gewürfelt)', 125, 'g', 2),
    ('10000000-0000-0000-0000-000000000005', 'Salz', 1, 'Msp.', 3),
    ('10000000-0000-0000-0000-000000000005', 'Kaltes Wasser', 3, 'EL', 4),
    ('10000000-0000-0000-0000-000000000005', 'Äpfel (Boskoop oder Braeburn)', 1, 'kg', 5),
    ('10000000-0000-0000-0000-000000000005', 'Zimt', 1, 'TL', 6),
    ('10000000-0000-0000-0000-000000000005', 'Zucker', 3, 'EL', 7),
    ('10000000-0000-0000-0000-000000000005', 'Eier', 2, 'Stk.', 8),
    ('10000000-0000-0000-0000-000000000005', 'Rahm (Vollrahm)', 2, 'dl', 9),
    ('10000000-0000-0000-0000-000000000005', 'Zucker (für Guss)', 2::decimal, 'EL', 10)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000005');

-- Musterrezept 6: Älplermagronen
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000006',
     '00000000-0000-0000-0000-000000000002',
     'Älplermagronen',
     'Deftige Älplermagronen mit Kartoffeln, Rahm und Käse – das Hirtengericht aus den Schweizer Alpen, serviert mit Apfelmus.',
     '1. Kartoffeln schälen und in ca. 1 cm grosse Würfel schneiden.
2. Kartoffelwürfel in reichlich Salzwasser 5 Minuten vorkochen.
3. Magronen (kurze Röhren) zu den Kartoffeln geben und gemäss Packungsanleitung al dente kochen. Abgiessen, 1 dl Kochwasser auffangen.
4. Zwiebeln in feine Ringe schneiden und in Butter goldbraun rösten.
5. Rahm und aufgefangenes Kochwasser in einer grossen Pfanne erhitzen.
6. Kartoffeln und Magronen dazugeben, gut mischen.
7. Geriebenen Gruyère unterrühren, bis er schmilzt.
8. Mit Salz, Pfeffer und einer Prise Muskatnuss abschmecken.
9. Auf Teller verteilen, Röstzwiebeln darübergeben.
10. Mit Apfelmus als Beilage servieren.',
     4, 15, 25, 40, 'einfach', 'manual', 'Schweizerisch', 'Hauptgericht',
     ARRAY['Schweiz', 'Alpen', 'Deftig', 'Vegetarisch', 'Kartoffeln', 'Käse'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000006'::uuid, 'Magronen (kurze Röhren)', 250::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000006', 'Kartoffeln (festkochend)', 400, 'g', 2),
    ('10000000-0000-0000-0000-000000000006', 'Gruyère (gerieben)', 150, 'g', 3),
    ('10000000-0000-0000-0000-000000000006', 'Rahm (Vollrahm)', 2, 'dl', 4),
    ('10000000-0000-0000-0000-000000000006', 'Zwiebeln (gross)', 2, 'Stk.', 5),
    ('10000000-0000-0000-0000-000000000006', 'Butter', 40, 'g', 6),
    ('10000000-0000-0000-0000-000000000006', 'Muskatnuss', 1, 'Msp.', 7),
    ('10000000-0000-0000-0000-000000000006', 'Salz und Pfeffer', NULL::decimal, NULL, 8),
    ('10000000-0000-0000-0000-000000000006', 'Apfelmus (als Beilage)', 3::decimal, 'dl', 9)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000006');

-- Musterrezept 7: Basler Mehlsuppe
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000007',
     '00000000-0000-0000-0000-000000000002',
     'Basler Mehlsuppe',
     'Die traditionelle Basler Mehlsuppe – eine kräftige, dunkel geröstete Suppe, die zur Fasnacht in Basel serviert wird.',
     '1. Butter in einem grossen Topf schmelzen und das Mehl unter ständigem Rühren darin anrösten, bis es gleichmässig dunkelbraun ist (ca. 15–20 Minuten). Vorsicht: nicht anbrennen lassen!
2. Zwiebeln fein hacken und zum gerösteten Mehl geben. 2–3 Minuten mitrösten.
3. Die Fleischbrühe nach und nach unter kräftigem Rühren dazugiessen, damit keine Klumpen entstehen.
4. Aufkochen lassen, dann die Hitze reduzieren und 30 Minuten leise köcheln lassen.
5. Mit Salz, Pfeffer und einer Prise Muskatnuss abschmecken.
6. Die Suppe durch ein feines Sieb passieren.
7. Den Gruyère reiben. In vorgewärmte Teller füllen und grosszügig mit geriebenem Käse bestreuen.
8. Heiss servieren – traditionell in der Morgenstunde der Basler Fasnacht.',
     4, 10, 50, 60, 'mittel', 'manual', 'Schweizerisch', 'Suppe',
     ARRAY['Basel', 'Fasnacht', 'Tradition', 'Suppe', 'Winter'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000007'::uuid, 'Butter', 60::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000007', 'Mehl (Weissmehl)', 60, 'g', 2),
    ('10000000-0000-0000-0000-000000000007', 'Zwiebeln', 2, 'Stk.', 3),
    ('10000000-0000-0000-0000-000000000007', 'Fleischbrühe (kräftig)', 1, 'l', 4),
    ('10000000-0000-0000-0000-000000000007', 'Gruyère (gerieben)', 100, 'g', 5),
    ('10000000-0000-0000-0000-000000000007', 'Muskatnuss', 1, 'Msp.', 6),
    ('10000000-0000-0000-0000-000000000007', 'Salz und Pfeffer', NULL::decimal, NULL, 7)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000007');

-- Musterrezept 8: Bündner Gerstensuppe
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000008',
     '00000000-0000-0000-0000-000000000002',
     'Bündner Gerstensuppe',
     'Die gehaltvolle Gerstensuppe aus Graubünden mit Rollgerste, Gemüse und Bündnerfleisch – ein wärmendes Wintergericht.',
     '1. Rollgerste in kaltem Wasser 2 Stunden (oder über Nacht) einweichen. Abgiessen.
2. Speck in kleine Würfel schneiden und in einem grossen Topf auslassen.
3. Zwiebeln, Karotten, Sellerie und Lauch putzen und in feine Würfel schneiden.
4. Das Gemüse zum Speck geben und 5 Minuten andünsten.
5. Eingeweichte Rollgerste dazugeben und kurz mitrösten.
6. Fleischbrühe und Wasser dazugiessen, aufkochen.
7. Hitze reduzieren und zugedeckt ca. 1.5 Stunden köcheln lassen, bis die Gerste weich ist.
8. Rahm einrühren und nochmals 5 Minuten ziehen lassen.
9. Bündnerfleisch in feine Streifen schneiden.
10. Suppe mit Salz und Pfeffer abschmecken.
11. In Teller füllen und mit Bündnerfleischstreifen und gehackter Petersilie garnieren.',
     6, 20, 100, 120, 'mittel', 'manual', 'Schweizerisch', 'Suppe',
     ARRAY['Graubünden', 'Bündner', 'Suppe', 'Winter', 'Deftig', 'Gerste'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000008'::uuid, 'Rollgerste', 200::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000008', 'Geräucherter Speck', 100, 'g', 2),
    ('10000000-0000-0000-0000-000000000008', 'Zwiebeln', 2, 'Stk.', 3),
    ('10000000-0000-0000-0000-000000000008', 'Karotten', 2, 'Stk.', 4),
    ('10000000-0000-0000-0000-000000000008', 'Stangensellerie', 2, 'Stk.', 5),
    ('10000000-0000-0000-0000-000000000008', 'Lauch', 1, 'Stk.', 6),
    ('10000000-0000-0000-0000-000000000008', 'Fleischbrühe', 1, 'l', 7),
    ('10000000-0000-0000-0000-000000000008', 'Wasser', 5, 'dl', 8),
    ('10000000-0000-0000-0000-000000000008', 'Rahm (Vollrahm)', 1, 'dl', 9),
    ('10000000-0000-0000-0000-000000000008', 'Bündnerfleisch', 100, 'g', 10),
    ('10000000-0000-0000-0000-000000000008', 'Petersilie (gehackt)', 2, 'EL', 11),
    ('10000000-0000-0000-0000-000000000008', 'Salz und Pfeffer', NULL::decimal, NULL, 12)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000008');

-- Musterrezept 9: Vermicelles
INSERT INTO recipes (id, user_id, title, description, instructions, servings, prep_time_minutes, cook_time_minutes, total_time_minutes, difficulty, source_type, cuisine, category, tags) VALUES
    ('10000000-0000-0000-0000-000000000009',
     '00000000-0000-0000-0000-000000000002',
     'Vermicelles',
     'Das elegante Schweizer Kastanien-Dessert – feine Marroni-Vermicelles auf einem Meringue-Nest mit Schlagrahm.',
     '1. Kastanien mit einem Messer kreuzweise einritzen und in kochendem Wasser 20 Minuten garen.
2. Noch heiss schälen (innere Haut sorgfältig entfernen – geht am besten, solange die Kastanien warm sind).
3. Geschälte Kastanien mit der Milch und der Vanilleschote in einem Topf weich kochen (ca. 25 Minuten).
4. Vanilleschote entfernen. Kastanien abtropfen lassen (Kochflüssigkeit auffangen).
5. Kastanien mit Puderzucker und Kirsch durch eine Kartoffelpresse oder ein Passevite drücken.
6. Falls die Masse zu trocken ist, löffelweise Kochflüssigkeit dazugeben.
7. Schlagrahm mit 1 EL Zucker steif schlagen.
8. Meringue-Schalen auf Teller setzen und mit einem Klacks Schlagrahm füllen.
9. Die Kastanienmasse locker und spaghettiartig über den Schlagrahm häufeln.
10. Mit einem Tupfer Schlagrahm und Puderzucker garnieren. Sofort servieren.',
     4, 40, 45, 85, 'anspruchsvoll', 'manual', 'Schweizerisch', 'Dessert',
     ARRAY['Dessert', 'Kastanien', 'Marroni', 'Herbst', 'Klassiker', 'Elegant'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order)
SELECT v.* FROM (VALUES
    ('10000000-0000-0000-0000-000000000009'::uuid, 'Frische Kastanien (Marroni)', 800::decimal, 'g', 1),
    ('10000000-0000-0000-0000-000000000009', 'Milch', 3, 'dl', 2),
    ('10000000-0000-0000-0000-000000000009', 'Vanilleschote', 1, 'Stk.', 3),
    ('10000000-0000-0000-0000-000000000009', 'Puderzucker', 100, 'g', 4),
    ('10000000-0000-0000-0000-000000000009', 'Kirsch (Kirschwasser)', 2, 'EL', 5),
    ('10000000-0000-0000-0000-000000000009', 'Schlagrahm', 3, 'dl', 6),
    ('10000000-0000-0000-0000-000000000009', 'Zucker (für Schlagrahm)', 1, 'EL', 7),
    ('10000000-0000-0000-0000-000000000009', 'Meringue-Schalen (fertig gekauft)', 4::decimal, 'Stk.', 8)
) AS v(recipe_id, name, amount, unit, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE recipe_id = '10000000-0000-0000-0000-000000000009');
