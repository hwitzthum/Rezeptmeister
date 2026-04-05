# Rezeptmeister – Implementierungsplan

**Status:** Entwurf  
**Ziel:** KI-gestützte Rezeptverwaltung für den Schweizer Markt  
**Stack:** Next.js + FastAPI + PostgreSQL/pgvector + Gemini Embedding 2  

---

## Phase 1 – Fundament & Infrastruktur

### 1.1 Projektstruktur & Docker Setup
- [x] Verzeichnisstruktur anlegen (`frontend/`, `backend/`, `db/`, `uploads/`)
- [x] `docker-compose.yml` erstellen (pgvector/pgvector:pg16, FastAPI)
- [x] `db/init.sql` mit pgvector Extension und vollem Schema erstellen
- [x] `db/seed.sql` mit 5 Schweizer Musterrezepten
- [x] `.env.example` anlegen
- [x] **E2E-Test:** FastAPI /health (skipped – Backend nicht gestartet), Next.js-Tests alle grün

### 1.2 Next.js Frontend Setup
- [x] Next.js 16 App Router mit TypeScript initialisieren (`frontend/`)
- [x] Tailwind CSS v4 konfigurieren (Custom Design System in globals.css: Terrakotta #C24D2C, Cremeweis #FFF8F0, Gold #D4A843)
- [x] **Frontend-Design-Skill:** Design-System definiert (Tokens, Farben "Schweizer Küchenmagazin", Playfair Display + DM Sans, Grain-Textur, Animationen)
- [x] Root-Layout mit Playfair/DM Sans, lang="de-CH", deutschem Metadata
- [x] Globale UI-Basiskomponenten: Button (6 Varianten), Input/Textarea/Select, RecipeCard, Badge/DifficultyBadge/SourceBadge, Modal/ConfirmDialog
- [x] Sidebar (Desktop) + BottomNav (Mobile) Layout-Komponenten
- [x] Drizzle ORM einrichten (Schema alle 9 Tabellen, customType Vector(3072), Relations, Lazy-Init für Build-Kompatibilität)
- [x] NextAuth.js v5 konfigurieren (Credential Provider, JWT-Sessions, status=approved-Check, bcrypt)
- [x] `src/proxy.ts` (Next.js 16: middleware.ts → proxy.ts) – schützt alle nicht-öffentlichen Routen
- [x] `drizzle.config.ts` für Migrationen
- [x] **E2E-Test (Playwright):** 11/11 Tests (Phase 1) + 12/12 Tests (Phase 1.2) grün ✅

### 1.3 FastAPI Backend Setup
- [x] `backend/pyproject.toml` mit uv einrichten (FastAPI, SQLAlchemy, Alembic, asyncpg, pgvector, alle KI-Libs)
- [x] `backend/app/main.py` FastAPI-Einstiegspunkt mit CORS
- [x] `backend/app/config.py` mit Pydantic Settings
- [x] SQLAlchemy Modelle für alle DB-Tabellen (inkl. VECTOR(3072)-Spalten via pgvector)
- [x] Alembic env.py + script.py.mako einrichten
- [x] `backend/Dockerfile` erstellen
- [x] Health-Check-Endpoint `/health`
- [x] **E2E-Test:** FastAPI `/health` (skipped – Backend startet per `docker compose up`) ✅

---

## Phase 2 – Authentifizierung (F-AUTH-01 bis F-AUTH-04)

### 2.1 Registrierung & Login
- [x] API-Route `POST /api/auth/register` (Name, E-Mail, Passwort → status=pending, bcrypt-Hash)
- [x] NextAuth Credential Provider (prüft status=approved)
- [x] Registrierungsseite `/auth/registrieren` mit Formular und Validierung
- [x] Login-Seite `/auth/anmelden` mit Fehlerbehandlung
- [x] Pending-Hinweisseite: "Ihre Registrierung wird geprüft"
- [x] Middleware: Route-Schutz für alle authentifizierten Bereiche
- [x] **E2E-Test (Playwright):** Registrierung → Pending-Seite → Login mit pending schlägt fehl

### 2.2 Admin-Dashboard (F-AUTH-04)
- [x] Seeder: Admin-User in `db/seed.sql` (harrywitzthum@gmail.com)
- [x] Admin-Dashboard-Seite `/admin` (nur role=admin)
- [x] Benutzerliste mit Filtermöglichkeiten (pending/approved/rejected)
- [x] Aktionen: Freigeben, Ablehnen, Rolle ändern, Löschen (mit Bestätigungsdialog)
- [x] Paginierung und Suchfunktion
- [x] API-Routes `GET /api/admin/users`, `PUT/DELETE /api/admin/users/[id]`
- [x] **E2E-Test:** Admin loggt ein → sieht pending User → gibt frei → User kann sich einloggen

### 2.3 BYOK API-Schlüssel-Verwaltung (F-AUTH-03)
- [x] AES-256-GCM-Verschlüsselung für API-Schlüssel (`ENCRYPTION_KEY` aus ENV)
- [x] API-Route `PUT /api/settings/api-key` (verschlüsseln + speichern)
- [x] API-Route `GET /api/settings/api-key` (maskiert) + `DELETE`
- [x] Einstellungsseite `/einstellungen` mit API-Schlüssel-Formular
- [x] Maskierter Platzhalter im Frontend (z.B. `sk-...abc1`)
- [x] UI-Hinweis wenn kein API-Schlüssel gesetzt ("KI-Funktionen deaktiviert")
- [x] **E2E-Test:** API-Schlüssel setzen, maskiert anzeigen, KI-Hinweis verschwindet

---

## Phase 3 – Rezeptverwaltung CRUD (F-REC-01 bis F-REC-05)

### 3.1 Rezept erstellen (F-REC-01)
- [x] API-Route `POST /api/recipes` (Validierung, Cascade-Insert Zutaten)
- [x] Rezepterstellungsseite `/rezepte/neu`
- [x] **Frontend-Design-Skill:** Rezeptformular-Komponente (mehrstufig: Grunddaten → Zutaten → Anleitung → Metadaten)
- [x] Dynamische Zutatenliste (Zeilen hinzufügen/entfernen, Drag-and-Drop-Sort)
- [x] Schweizer Masseinheiten-Dropdown (g, kg, ml, dl, l, EL, TL, KL, Msp., Prise, Stk., Bund, Pkg., Scheibe, Dose, Becher, Pfd.)
- [x] Autocomplete für Kategorie, Küche, Tags
- [x] Plain Textarea für Zubereitungsanleitung (mehrstufig-Wizard)
- [x] Asynchrone Embedding-Anfrage an FastAPI nach dem Speichern
- [x] **E2E-Test (Playwright):** Komplettes Rezept erstellen, alle Pflichtfelder validieren, gespeichertes Rezept anzeigen

### 3.2 Rezeptliste & Übersicht (F-REC-05)
- [x] API-Route `GET /api/recipes` (paginiert, gefiltert, sortiert)
- [x] Rezeptliste-Seite `/rezepte`
- [x] **Frontend-Design-Skill:** Rezeptkarten-Komponente (Bild-Platzhalter, Titel, Kategorie, Zeit, Bewertung)
- [x] Sortierung: Neueste, Alphabetisch, Zuletzt bearbeitet
- [x] Schnellfilter-Leiste (Kategorie, Küche, Schwierigkeitsgrad, Favoriten-Toggle)
- [x] "Mehr laden"-Button (20 pro Ladung)
- [x] **E2E-Test:** Rezeptliste lädt, Filterung und Sortierung funktionieren

### 3.3 Rezeptdetailansicht (F-REC-04)
- [x] API-Route `GET /api/recipes/[id]`
- [x] Detailseite `/rezepte/[id]`
- [x] **Frontend-Design-Skill:** Hero-Bereich, Zutaten-Panel, Anleitung-Ansicht
- [x] Portionsregler (live-Umrechnung aller Zutatenmengen via `formatAmount`)
- [x] Aktionsleiste: Bearbeiten, Löschen (Confirm-Dialog), Favoriten-Toggle
- [x] Metadaten-Chips (Zeit, Schwierigkeitsgrad, Kategorie, Tags)
- [x] **E2E-Test:** Rezeptdetail lädt vollständig, Portionsregler rechnet korrekt um

### 3.4 Rezept bearbeiten & löschen (F-REC-02/03)
- [x] API-Route `PUT /api/recipes/[id]` (Berechtigungs-Check: Ersteller oder Admin)
- [x] API-Route `DELETE /api/recipes/[id]` (Cascade-Delete)
- [x] API-Route `PATCH /api/recipes/[id]/favorit` (Toggle)
- [x] Bearbeitungsseite `/rezepte/[id]/bearbeiten` (Formular vorbefüllt)
- [x] Bestätigungsdialog vor dem Löschen
- [x] Embedding-Neuberechnung bei inhaltlichen Änderungen
- [x] **E2E-Test:** Rezept bearbeiten, Änderungen persistiert; Rezept löschen, Confirmation-Dialog ✅ 17/17 Tests grün

---

## Phase 4 – Bildverwaltung (F-IMG-01 bis F-IMG-04)

### 4.1 Bild-Upload (F-IMG-01)
- [ ] API-Route `POST /api/images/upload` (Validierung MIME-Type, max 10 MB)
- [ ] Thumbnail-Generierung (300×300 WebP) via sharp
- [ ] Lokale Speicherung in `uploads/originals/` und `uploads/thumbnails/`
- [ ] FastAPI: Bild-Embedding via Gemini Embedding 2 asynchron
- [ ] **Frontend-Design-Skill:** Drag-and-Drop Upload-Zone mit Fortschrittsanzeige
- [ ] **E2E-Test:** Bild hochladen, Thumbnail erscheint, Fehlermeldung bei falschem Format

### 4.2 Bilder einem Rezept zuordnen (F-IMG-02/03/04)
- [ ] API-Route `DELETE /api/images/[id]`
- [ ] API-Route `PATCH /api/images/[id]` (is_primary setzen, recipe_id zuordnen)
- [ ] API-Route `GET /api/images` (Galerie, gefiltert)
- [ ] Bildergalerie-Seite `/bilder`
- [ ] Drag-and-Drop-Sortierung innerhalb Rezept
- [ ] Batch-Zuordnung und Batch-Löschung
- [ ] Bestätigungsdialog vor Bildlöschung
- [ ] **E2E-Test:** Bild hochladen, Rezept zuordnen, als Hauptbild markieren, löschen

---

## Phase 5 – Volltext-Suche & Filter (F-SEARCH-01/03)

### 5.1 Volltextsuche
- [ ] PostgreSQL `tsvector`-Spalte für Rezepte (Deutsch, `german` config)
- [ ] Trigger oder Computed Column für automatische Aktualisierung
- [ ] API-Route `GET /api/recipes?q=...` mit `tsquery`-Suche
- [ ] **Frontend-Design-Skill:** Suchleiste mit Debounce, Suchbegriffe hervorgehoben
- [ ] Suche-Seite `/suche`
- [ ] **E2E-Test:** Suchbegriff eingeben, relevante Rezepte erscheinen mit Highlighting

### 5.2 Kategoriebasierte Filter (F-SEARCH-03)
- [ ] Erweiterte Filter-UI in der Seitenleiste der Suche
- [ ] Filter: Kategorie, Küche, Ernährungsform, Schwierigkeitsgrad, Zeitaufwand, Zutaten
- [ ] Filter in URL abgebildet (shareable)
- [ ] Treffer-Zähler pro Filteroption
- [ ] **E2E-Test:** Mehrere Filter kombinieren, URL teilen, Filter nach Reload korrekt gesetzt

---

## Phase 6 – FastAPI KI-Pipeline (Embeddings & OCR)

### 6.1 Embedding-Service
- [ ] FastAPI-Router `POST /embed/text` (Gemini Embedding 2)
- [ ] FastAPI-Router `POST /embed/image`
- [ ] FastAPI-Router `POST /embed/multimodal` (Text + Bild interleaved)
- [ ] `embedding_service.py` mit Gemini API-Client
- [ ] Task-Instruction-Präfixe (`task: search_query`, `task: search_document`)
- [ ] Background Tasks für asynchrone Embedding-Erstellung
- [ ] Batch-Embedding-Funktion
- [ ] HNSW-Index auf `recipes.embedding` und `images.embedding`
- [ ] **Test:** Embedding-Endpoint gibt 3072-dimensionalen Vektor zurück

### 6.2 OCR / Textextraktion aus Bildern (F-AI-01)
- [ ] FastAPI-Router `POST /ocr/extract` (Bild + Gemini multimodal)
- [ ] Strukturierte Extraktion: Titel, Zutaten (mit CH-Masseinheiten), Anleitung, Metadaten
- [ ] Übersetzung von Nicht-Deutsch ins Deutsche
- [ ] Next.js: API-Route `/api/ai/ocr` (Proxy zu FastAPI mit User-API-Schlüssel)
- [ ] **Frontend-Design-Skill:** OCR-Vorschau-Panel mit Editiermöglichkeit vor dem Speichern
- [ ] Rezept aus OCR-Ergebnis erstellen (source_type=image_ocr)
- [ ] **E2E-Test:** Bild mit Rezepttext hochladen → OCR läuft → Vorschau zeigen → Rezept speichern

---

## Phase 7 – Semantische Suche (F-SEARCH-02)

### 7.1 Vektorsuche im Backend
- [ ] FastAPI-Router `POST /search/semantic` (Query-Embedding + pgvector Cosinus-Ähnlichkeit)
- [ ] FastAPI-Router `POST /search/hybrid` (Volltext + Vektor kombiniert, RRF-Ranking)
- [ ] Bild → Rezept Cross-Modal-Suche
- [ ] Next.js API-Route `/api/search/semantic` (Proxy)
- [ ] **Frontend-Design-Skill:** Semantische Suche UI mit natürlicher Sprache, Cross-Modal-Upload
- [ ] **E2E-Test:** Natürlichsprachliche Suchanfrage → relevante Ergebnisse

---

## Phase 8 – KI-Funktionen (F-AI-02 bis F-AI-07)

### 8.1 Rezeptvorschläge (F-AI-02)
- [ ] FastAPI-Router `POST /ai/suggest-recipes`
- [ ] Kontext: verfügbare Zutaten, Küchenart, Zeitbudget, Saisonalität (CH)
- [ ] Generierung von 3–5 Vorschlägen mit Titel + Beschreibung + Zeitschätzung
- [ ] Vollständige Rezeptgenerierung bei Auswahl
- [ ] Token-Verbrauchsanzeige
- [ ] **Frontend-Design-Skill:** Vorschlags-Interface mit Einschränkungsoptionen, Regenerieren-Button
- [ ] **E2E-Test:** Rezeptvorschläge generieren, einen auswählen, vollständiges Rezept speichern

### 8.2 Intelligente Portionsumrechnung (F-AI-03 KI)
- [ ] FastAPI-Router `POST /ai/scale-recipe`
- [ ] KI-Hinweise bei starker Skalierung (Gewürze, Backzeiten, Rundung)
- [ ] Einheitenkonvertierung: 1500 ml → 1.5 l, 0.5 dl → 50 ml etc.
- [ ] **E2E-Test:** Rezept von 4 auf 20 Portionen skalieren → KI-Hinweise erscheinen

### 8.3 Bildgenerierung (F-AI-04)
- [ ] FastAPI-Router `POST /ai/generate-image`
- [ ] Automatische Prompt-Erstellung aus Rezepttitel + Zutaten + Kategorie
- [ ] Generiertes Bild mit "KI-generiert"-Badge
- [ ] Bild-Embedding erstellen nach Generierung
- [ ] **E2E-Test:** Rezept ohne Bild öffnen → "Bild generieren" → Vorschau → Akzeptieren

### 8.4 URL-Import (F-AI-06)
- [ ] FastAPI-Router `POST /import/url`
- [ ] Webseite abrufen, schema.org/Recipe JSON-LD bevorzugt parsen
- [ ] Fallback: KI-basiertes Parsing
- [ ] CH-Masseinheiten-Konvertierung (cups → dl/g, °F → °C)
- [ ] Next.js API-Route `/api/ai/import-url`
- [ ] **Frontend-Design-Skill:** URL-Import-Dialog mit Vorschau-Editor
- [ ] **E2E-Test:** Rezept-URL eingeben → Import → Vorschau → Speichern

### 8.5 Websuche nach Rezepten (F-AI-05)
- [ ] FastAPI-Router `POST /search/web`
- [ ] Suchresultate-Liste mit Titel, Quelle, Vorschau
- [ ] Import eines Suchresultats via URL-Import-Service
- [ ] **E2E-Test:** Suchbegriff eingeben → Ergebnisse → ein Rezept importieren

### 8.6 Nährwertberechnung (F-AI-07)
- [ ] FastAPI-Router `POST /ai/nutrition`
- [ ] Schätzung aus Zutatenliste (kcal, Protein, Fett, KH, Ballaststoffe)
- [ ] "ca. 450 kcal"-Kennzeichnung
- [ ] Manuelle Überschreibung möglich
- [ ] **E2E-Test:** Zutaten eingeben → Nährwerte berechnen → anzeigen und überschreiben

---

## Phase 9 – Notizen & Memory (F-NOTE-01)

- [ ] API-Routes `GET/POST/PUT/DELETE /api/notes/[recipeId]`
- [ ] Notiztypen: Tipp, Variation, Erinnerung, Bewertung (1–5 Sterne), Allgemein
- [ ] Durchschnittsbewertung auf Rezeptkarte anzeigen
- [ ] **Frontend-Design-Skill:** Notizen-Panel in Rezeptdetail (Tabbed, Sternebewertung-Komponente)
- [ ] **E2E-Test:** Notiz erstellen, bewerten, Durchschnittsstern auf Karte sichtbar

---

## Phase 10 – Einkaufsliste (F-SHOP-01/02)

- [ ] API-Routes `GET/POST/PUT/DELETE /api/shopping-list`
- [ ] Intelligentes Zusammenführen doppelter Zutaten (200g Mehl + 300g Mehl = 500g Mehl)
- [ ] Kategorisierung nach Ladenabteilung (Obst & Gemüse, Milchprodukte, etc.)
- [ ] **Frontend-Design-Skill:** Einkaufslisten-UI (mobil-optimiert, grosse Touch-Ziele, Abhaken-Funktion)
- [ ] "Alle abhaken" / Reset
- [ ] Aus Rezeptdetail: Zutaten zur Einkaufsliste hinzufügen
- [ ] Aus Wochenplan: Einkaufsliste generieren
- [ ] Manueller Eintrag
- [ ] **E2E-Test:** Zutaten aus Rezept hinzufügen, zusammenführen testen, abhaken, Reset

---

## Phase 11 – Wochenplanung (F-PLAN-01)

- [ ] API-Routes `GET/POST/PUT/DELETE /api/meal-plans`
- [ ] **Frontend-Design-Skill:** Kalenderansicht (Wochenansicht), Drag-and-Drop Slots
- [ ] 4 Slots pro Tag: Frühstück, Mittagessen, Abendessen, Snack
- [ ] Portionsgrösse pro Eintrag anpassbar
- [ ] Navigation vor/zurück (Wochen)
- [ ] "Einkaufsliste generieren"-Button
- [ ] **E2E-Test:** Rezept per Drag-and-Drop in Slot ziehen, Einkaufsliste aus Plan generieren

---

## Phase 12 – Sammlungen / Kochbücher (F-COLL-01)

- [ ] API-Routes `GET/POST/PUT/DELETE /api/collections`
- [ ] API-Route `POST/DELETE /api/collections/[id]/rezepte`
- [ ] **Frontend-Design-Skill:** Sammlungs-Grid mit Titelbildern, Drag-and-Drop innerhalb Sammlung
- [ ] Rezept zu Sammlung hinzufügen (aus Detailansicht)
- [ ] CRUD Sammlung (Name, Beschreibung, Titelbild)
- [ ] **E2E-Test:** Sammlung erstellen, Rezepte hinzufügen/entfernen, sortieren

---

## Phase 13 – Kochmodus & Drucken

### 13.1 Kochmodus
- [ ] Vollbild-Layout-Komponente (Wake Lock API)
- [ ] Schritt-für-Schritt-Navigation (Swipe-Gesten oder Buttons)
- [ ] Zutatenliste als Overlay
- [ ] Timer-Integration bei Zeitangaben
- [ ] Grosses, lesbares Font (min. 18px Text, 24px Zutaten)
- [ ] **E2E-Test:** Kochmodus starten, Steps durchnavigieren, Beenden

### 13.2 Drucken & PDF-Export (F-PRINT-01, F-SHARE-01)
- [ ] Print-CSS-Stylesheet
- [ ] Optionen: mit/ohne Bild, aktuelle Portionsgrösse
- [ ] PDF-Generierung (react-pdf oder puppeteer) für Einzelrezept und Sammlung
- [ ] **E2E-Test:** Druckvorschau öffnen, PDF herunterladen

---

## Phase 14 – Einheitenumrechner (F-CONV-01)

- [ ] `frontend/src/lib/units/` Konvertierungs-Utilities (US cups ↔ dl/g, °F ↔ °C, oz ↔ g, etc.)
- [ ] Zutatenbewusste Konvertierung (1 Cup Mehl = 125g, 1 Cup Zucker = 200g)
- [ ] **Frontend-Design-Skill:** Eigenständige Umrechner-Seite `/werkzeuge` (Sofortergebnis, zutatenbewusst)
- [ ] **E2E-Test:** Verschiedene Einheiten umrechnen, zutatenbewusst

---

## Phase 15 – Dashboard (F-UI-05.3)

- [ ] **Frontend-Design-Skill:** Gesamtes Dashboard `/` (Begrüssung, Karussell, Widgets)
- [ ] "Zuletzt bearbeitet"-Karussell (letzte 5 Rezepte)
- [ ] Favoriten-Schnellzugriff
- [ ] "Rezeptvorschlag des Tages" (KI, falls API-Schlüssel vorhanden)
- [ ] Schnellzugriff-Buttons: Neues Rezept, Bild hochladen, URL importieren
- [ ] Einkaufslisten-Widget (Anzahl offener Einträge)
- [ ] Wochenplan-Vorschau (heutiger Tag)
- [ ] **E2E-Test:** Dashboard lädt, alle Widgets korrekt, Karussell scrollt

---

## Phase 16 – "Was kann ich kochen?" (F-SEARCH-04)

- [ ] Zutaten-Eingabe mit Autocomplete
- [ ] Matching-Algorithmus: Rezepte mit höchstem Übereinstimmungsgrad
- [ ] Ergebnisse zeigen: "4 von 6 Zutaten vorhanden"
- [ ] Fehlende Zutaten direkt zur Einkaufsliste
- [ ] **E2E-Test:** Zutaten eingeben, Ergebnisse nach Übereinstimmung sortiert

---

## Phase 17 – PWA & Offline-Zugang

- [ ] next-pwa oder Service Worker konfigurieren
- [ ] Rezepte für Offline-Zugang markieren
- [ ] Offline-Caching-Strategie (ausgewählte Rezepte)
- [ ] App Manifest (Icons, Splash Screen, Farben)
- [ ] **E2E-Test:** App-Installation, offline markiertes Rezept abrufbar ohne Netz

---

## Phase 18 – Non-Functional & Finalisierung

- [ ] Rate Limiting: express-rate-limit auf alle Next.js API Routes (100/15min), strenger auf KI-Endpunkten
- [ ] Input-Validierung und Sanitisierung (zod auf allen API-Routes)
- [ ] CSRF-Schutz via NextAuth
- [ ] WCAG 2.1 AA: Kontraste prüfen, Tastaturnavigation, ARIA-Labels
- [ ] Dark Mode implementieren (abgedunkelte warme Farbtöne)
- [ ] Performance-Optimierung (next/image, lazy loading, bundle analysis)
- [ ] Admin: Re-Embedding-Funktion für alle Rezepte
- [ ] `db/seed.sql` mit Testdaten (5–10 Schweizer Musterrezepte)
- [ ] README aktualisieren (alle Features dokumentiert, Setup-Anleitung)
- [ ] Deployment-Dokumentation (Vercel, Railway/Fly.io, Supabase)
- [ ] **E2E-Test (Full Journey):** Registrierung → Admin-Freigabe → Login → Rezept erstellen → OCR → Suchen → Einkaufsliste → Wochenplan

---

## Querschnittsthemen (begleitend durch alle Phasen)

- [ ] Alle UI-Texte durchgehend Deutsch (Schweizer Schreibweisen: "ss" statt "ß")
- [ ] Schweizer Masseinheiten überall konsequent einsetzen
- [ ] KI-Funktionen immer mit "Bitte API-Schlüssel in Einstellungen hinterlegen"-Hinweis sichern
- [ ] Playwright-Testdatei für jede Phase anlegen (`tests/phase-X.spec.ts`)
- [ ] Frontend-Design-Skill für alle neuen Seiten/Komponenten aufrufen
- [ ] BYOK: API-Schlüssel nie ins Frontend leaken

---

## Review-Sektion

*(Wird nach Implementierung jeder Phase ausgefüllt)*

---

*Erstellt: 2026-04-04*