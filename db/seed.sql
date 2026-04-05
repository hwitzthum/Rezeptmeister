-- Rezeptmeister – Testdaten (Schweizer Musterrezepte)
-- Wird nur in der Entwicklungsumgebung ausgeführt

-- Admin-Benutzer (Passwort: 05!Shakespeare_15)
INSERT INTO users (id, email, name, password_hash, role, status) VALUES
    ('00000000-0000-0000-0000-000000000001',
     'harrywitzthum@gmail.com',
     'Harry Witzthum',
     '$2b$12$11dCoVbnkYqUb/uUO2M3deWvK6M9PCRJF5UhVs.LAebhe9ge/KGCW', -- 05!Shakespeare_15
     'admin',
     'approved');

-- Test-Benutzer (Passwort: test1234)
INSERT INTO users (id, email, name, password_hash, role, status) VALUES
    ('00000000-0000-0000-0000-000000000002',
     'test@rezeptmeister.ch',
     'Test Benutzer',
     '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', -- test1234
     'user',
     'approved');

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
     ARRAY['Klassiker', 'Schweiz', 'Fleisch', 'Kalbfleisch']);

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order) VALUES
    ('10000000-0000-0000-0000-000000000001', 'Kalbsnierstück', 600, 'g', 1),
    ('10000000-0000-0000-0000-000000000001', 'Champignons', 300, 'g', 2),
    ('10000000-0000-0000-0000-000000000001', 'Zwiebeln', 2, 'Stk.', 3),
    ('10000000-0000-0000-0000-000000000001', 'Butter', 50, 'g', 4),
    ('10000000-0000-0000-0000-000000000001', 'Weisswein (trocken)', 1, 'dl', 5),
    ('10000000-0000-0000-0000-000000000001', 'Kalbsfond', 2, 'dl', 6),
    ('10000000-0000-0000-0000-000000000001', 'Rahm (Vollrahm)', 2, 'dl', 7),
    ('10000000-0000-0000-0000-000000000001', 'Zitronensaft', 1, 'EL', 8),
    ('10000000-0000-0000-0000-000000000001', 'Salz und Pfeffer', NULL, NULL, 9);

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
     ARRAY['Frühstück', 'Gesund', 'Vegetarisch', 'Schnell', 'Ohne Kochen']);

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order) VALUES
    ('10000000-0000-0000-0000-000000000002', 'Zarte Haferflocken', 6, 'EL', 1),
    ('10000000-0000-0000-0000-000000000002', 'Milch', 1.5, 'dl', 2),
    ('10000000-0000-0000-0000-000000000002', 'Naturjoghurt', 1.5, 'dl', 3),
    ('10000000-0000-0000-0000-000000000002', 'Zitronensaft', 1, 'EL', 4),
    ('10000000-0000-0000-0000-000000000002', 'Honig', 1, 'EL', 5),
    ('10000000-0000-0000-0000-000000000002', 'Äpfel (gerieben)', 2, 'Stk.', 6),
    ('10000000-0000-0000-0000-000000000002', 'Gemischte Nüsse (gehackt)', 2, 'EL', 7),
    ('10000000-0000-0000-0000-000000000002', 'Beeren (frisch oder tiefgefroren)', 100, 'g', 8);

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
     ARRAY['Schweiz', 'Vegetarisch', 'Klassiker', 'Kartoffeln'], true);

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order) VALUES
    ('10000000-0000-0000-0000-000000000003', 'Mehlig kochende Kartoffeln (vorgekocht)', 800, 'g', 1),
    ('10000000-0000-0000-0000-000000000003', 'Zwiebeln', 1, 'Stk.', 2),
    ('10000000-0000-0000-0000-000000000003', 'Butter', 60, 'g', 3),
    ('10000000-0000-0000-0000-000000000003', 'Salz', 1, 'TL', 4),
    ('10000000-0000-0000-0000-000000000003', 'Pfeffer', 1, 'Msp.', 5);

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
     ARRAY['Schnell', 'Käse', 'Vegetarisch', 'Zvieri']);

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order) VALUES
    ('10000000-0000-0000-0000-000000000004', 'Ruchbrot (Scheiben)', 4, 'Scheibe', 1),
    ('10000000-0000-0000-0000-000000000004', 'Gruyère oder Emmentaler', 200, 'g', 2),
    ('10000000-0000-0000-0000-000000000004', 'Mittelscharfer Senf', 2, 'TL', 3),
    ('10000000-0000-0000-0000-000000000004', 'Cornichons (zum Servieren)', NULL, NULL, 4);

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
     ARRAY['Dessert', 'Backen', 'Vegetarisch', 'Herbst', 'Äpfel', 'Wähe']);

INSERT INTO ingredients (recipe_id, name, amount, unit, sort_order) VALUES
    ('10000000-0000-0000-0000-000000000005', 'Mehl (Weissmehl)', 250, 'g', 1),
    ('10000000-0000-0000-0000-000000000005', 'Kalte Butter (gewürfelt)', 125, 'g', 2),
    ('10000000-0000-0000-0000-000000000005', 'Salz', 1, 'Msp.', 3),
    ('10000000-0000-0000-0000-000000000005', 'Kaltes Wasser', 3, 'EL', 4),
    ('10000000-0000-0000-0000-000000000005', 'Äpfel (Boskoop oder Braeburn)', 1, 'kg', 5),
    ('10000000-0000-0000-0000-000000000005', 'Zimt', 1, 'TL', 6),
    ('10000000-0000-0000-0000-000000000005', 'Zucker', 3, 'EL', 7),
    ('10000000-0000-0000-0000-000000000005', 'Eier', 2, 'Stk.', 8),
    ('10000000-0000-0000-0000-000000000005', 'Rahm (Vollrahm)', 2, 'dl', 9),
    ('10000000-0000-0000-0000-000000000005', 'Zucker (für Guss)', 2, 'EL', 10);
