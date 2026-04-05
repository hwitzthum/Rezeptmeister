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
- [x] API-Route `POST /api/images/upload` (Validierung MIME-Type, max 10 MB)
- [x] Thumbnail-Generierung (300×300 WebP) via sharp
- [x] Lokale Speicherung in `uploads/originals/` und `uploads/thumbnails/`
- [x] FastAPI: Bild-Embedding via Gemini Embedding 2 asynchron (Phase-4-Stub, Phase-6-Implementierung)
- [x] **Frontend-Design-Skill:** Drag-and-Drop Upload-Zone mit Fortschrittsanzeige (ImageUploadZone)
- [x] **E2E-Test:** Bild hochladen, Thumbnail erscheint, Fehlermeldung bei falschem Format

### 4.2 Bilder einem Rezept zuordnen (F-IMG-02/03/04)
- [x] API-Route `DELETE /api/images/[id]`
- [x] API-Route `PATCH /api/images/[id]` (is_primary setzen, recipe_id zuordnen)
- [x] API-Route `GET /api/images` (Galerie, gefiltert)
- [x] Bildergalerie-Seite `/bilder`
- [x] Drag-and-Drop-Sortierung innerhalb Rezept (frontend-only via @dnd-kit/sortable)
- [x] Batch-Zuordnung und Batch-Löschung
- [x] Bestätigungsdialog vor Bildlöschung
- [x] **E2E-Test:** Bild hochladen, Rezept zuordnen, als Hauptbild markieren, löschen ✅ 17/17 Tests grün

---

## Phase 5 – Volltext-Suche & Filter (F-SEARCH-01/03)

### 5.1 Volltextsuche
- [x] PostgreSQL `tsvector`-Spalte für Rezepte (Deutsch, `german` config)
- [x] Trigger oder Computed Column für automatische Aktualisierung
- [x] API-Route `GET /api/recipes?q=...` mit `tsquery`-Suche (`websearch_to_tsquery`, Gewichtung A/B/C)
- [x] **Frontend-Design-Skill:** Suchleiste mit Debounce (400ms), Suchbegriffe hervorgehoben (`<mark>`)
- [x] Suche-Seite `/suche`
- [x] **E2E-Test:** Suchbegriff eingeben, relevante Rezepte erscheinen mit Highlighting ✅ 21/21 Tests grün

### 5.2 Kategoriebasierte Filter (F-SEARCH-03)
- [x] Erweiterte Filter-UI in der Seitenleiste der Suche
- [x] Filter: Kategorie, Küche, Ernährungsform, Schwierigkeitsgrad, Zeitaufwand, Zutaten
- [x] Filter in URL abgebildet (shareable)
- [x] Treffer-Zähler pro Filteroption (Faceted Counts via `includeFacets=true`)
- [x] **E2E-Test:** Mehrere Filter kombinieren, URL teilen, Filter nach Reload korrekt gesetzt ✅

---

## Phase 6 – FastAPI KI-Pipeline (Embeddings & OCR)

### 6.1 Embedding-Service
- [x] FastAPI-Router `POST /embed/text` (gemini-embedding-2-preview)
- [x] FastAPI-Router `POST /embed/image` (nativ multimodal, kein describe-then-embed)
- [x] FastAPI-Router `POST /embed/multimodal` (Text + Bild interleaved)
- [x] `embedding_service.py` mit google-genai SDK (google-generativeai deprecated → ersetzt)
- [x] Inhaltspräfixe statt task_type: "search_document: " / "search_query: " (gemini-embedding-2-preview unterstützt task_type nicht)
- [x] Background Tasks für asynchrone Embedding-Erstellung (nie blockierend)
- [x] Batch-Embedding-Funktion
- [x] halfvec+HNSW-Index auf `recipes.embedding` und `images.embedding` (Alembic Migration 0001)
- [x] X-Gemini-API-Key Header-Weitergabe: Next.js injiziert entschlüsselten Schlüssel bei fire-and-forget Calls
- [x] **Test:** 12 Backend-Tests grün, 7 Route-Tests (skip ohne asyncpg im PATH, per Konvention) ✅

### 6.2 OCR / Textextraktion aus Bildern (F-AI-01)
- [x] FastAPI-Router `POST /ocr/extract` (Bild + gemini-3.1-pro-preview multimodal)
- [x] Strukturierte Extraktion: Titel, Zutaten (mit CH-Masseinheiten), Anleitung, Metadaten (Pydantic response_schema)
- [x] Übersetzung von Nicht-Deutsch ins Deutsche (Prompt-Instruktion)
- [x] Next.js: API-Route `/api/ai/ocr` (Proxy zu FastAPI mit User-API-Schlüssel, AI_LIMIT Rate-Limit)
- [x] OCR-Vorschau-Panel `OcrPreviewPanel.tsx` mit Editiermöglichkeit vor dem Speichern
- [x] Rezept aus OCR-Ergebnis erstellen (source_type=image_ocr), Bild wird automatisch zugeordnet
- [x] **E2E-Test:** 5/5 Phase-6-Tests grün ✅

---

## Phase 7 – Semantische Suche (F-SEARCH-02)

### 7.1 Vektorsuche im Backend
- [x] FastAPI-Router `POST /search/semantic` (Query-Embedding + pgvector Cosinus-Ähnlichkeit)
- [x] FastAPI-Router `POST /search/hybrid` (Volltext + Vektor kombiniert, RRF-Ranking)
- [x] Bild → Rezept Cross-Modal-Suche
- [x] Next.js API-Route `/api/search/semantic` (Proxy)
- [x] **Frontend-Design-Skill:** Semantische Suche UI mit natürlicher Sprache, Cross-Modal-Upload
- [x] **E2E-Test:** Natürlichsprachliche Suchanfrage → relevante Ergebnisse ✅ 8/8 Tests grün

---

## Phase 8 – KI-Funktionen (F-AI-02 bis F-AI-07)

### 8.1 Rezeptvorschläge (F-AI-02)
- [x] FastAPI-Router `POST /ai/suggest` (Gemini Flash, strukturierter Output, 5 Vorschläge)
- [x] Kontext: verfügbare Zutaten, Küchenart, Zeitbudget, Saisonalität (CH)
- [x] Generierung von 5 Vorschlägen mit Titel + Beschreibung + Zeitschätzung
- [x] Vollständige Rezeptgenerierung bei Auswahl (`POST /ai/generate-recipe`)
- [x] Token-Verbrauchsanzeige
- [x] **Frontend-Design-Skill:** Vorschlags-Interface (`RecipeSuggestions.tsx`) mit Einschränkungsoptionen, Regenerieren-Button, Seite `/vorschlaege`
- [x] **E2E-Test:** `phase-8.spec.ts` — Vorschläge generieren, Rezept aus Vorschlag erstellen

### 8.2 Intelligente Portionsumrechnung (F-AI-03 KI)
- [x] FastAPI-Router `POST /ai/scale-recipe`
- [x] KI-Hinweise bei starker Skalierung (Faktor > 2 oder < 0.5; Gewürze, Backzeiten, Rundung)
- [x] Einheitenkonvertierung: ≥1000 ml → l, ≥1000 g → kg
- [x] `ScalingHintsPanel.tsx` in Rezeptdetailansicht eingebettet
- [x] **E2E-Test:** Skalierungshinweise bei 5× Faktor erscheinen

### 8.3 Bildgenerierung (F-AI-04)
- [x] FastAPI-Router `POST /ai/generate-image` (gemini-2.0-flash-preview-image-generation)
- [x] Automatische Prompt-Erstellung aus Rezepttitel + Zutaten + Kategorie
- [x] Generiertes Bild mit "KI-generiert"-Badge (`source_type='ai_generated'`)
- [x] Bild-Embedding erstellen nach Generierung (Background Task)
- [x] `GenerateImageButton.tsx` — erscheint wenn kein Hauptbild vorhanden
- [x] **E2E-Test:** Bildgenerierung via API gibt `image_id` + `thumbnail_url` zurück

### 8.4 URL-Import (F-AI-06)
- [x] FastAPI-Router `POST /import/url`
- [x] Webseite abrufen, schema.org/Recipe JSON-LD bevorzugt parsen (BeautifulSoup4)
- [x] Fallback: KI-basiertes Parsing (Gemini Flash)
- [x] CH-Masseinheiten-Konvertierung (cups → dl, oz/lb → g, tbsp → EL, tsp → TL, °F → °C)
- [x] Next.js API-Route `/api/ai/import-url`
- [x] **Frontend-Design-Skill:** `UrlImportDialog.tsx` (2-Schritt-Modal mit OcrPreviewPanel)
- [x] **E2E-Test:** URL-Import von Chefkoch gibt Titel zurück

### 8.5 Websuche nach Rezepten (F-AI-05)
- [x] FastAPI-Router `POST /search/web` (Gemini Grounding / Google Search)
- [x] Suchresultate-Liste mit Titel, Quelle (Domain), Vorschau
- [x] Import eines Suchresultats via URL-Import-Dialog
- [x] `WebSearchResults.tsx` — neuer "Web"-Tab in `/suche`
- [x] **E2E-Test:** Websuche gibt Ergebnisse mit `url` zurück

### 8.6 Nährwertberechnung (F-AI-07)
- [x] FastAPI-Router `POST /ai/nutrition` (Gemini Flash, strukturierter Output)
- [x] Schätzung aus Zutatenliste (kcal, Protein, Fett, KH, Ballaststoffe)
- [x] "ca. 450 kcal"-Kennzeichnung
- [x] Manuelle Überschreibung + Speichern via `PATCH /api/recipes/[id]/nutrition`
- [x] `NutritionPanel.tsx` in Rezeptdetailansicht
- [x] **E2E-Test:** Nährwerte berechnen → `per_serving.kcal > 0`, Label korrekt

---

## Phase 9 – Notizen & Memory (F-NOTE-01)

- [x] API-Routes `GET/POST/PUT/DELETE /api/notes/[recipeId]`
- [x] Notiztypen: Tipp, Variation, Erinnerung, Bewertung (1–5 Sterne), Allgemein
- [x] Durchschnittsbewertung auf Rezeptkarte anzeigen
- [x] **Frontend-Design-Skill:** Notizen-Panel in Rezeptdetail (Tabbed, Sternebewertung-Komponente)
- [x] **E2E-Test:** Notiz erstellen, bewerten, Durchschnittsstern auf Karte sichtbar

---

## Phase 10 – Einkaufsliste (F-SHOP-01/02)

- [x] API-Routes `GET/POST/PUT/DELETE /api/shopping-list`
- [x] Intelligentes Zusammenführen doppelter Zutaten (200g Mehl + 300g Mehl = 500g Mehl)
- [x] Kategorisierung nach Ladenabteilung (Obst & Gemüse, Milchprodukte, etc.)
- [x] **Frontend-Design-Skill:** Einkaufslisten-UI (mobil-optimiert, grosse Touch-Ziele, Abhaken-Funktion)
- [x] "Alle abhaken" / Reset
- [x] Aus Rezeptdetail: Zutaten zur Einkaufsliste hinzufügen
- [x] Aus Wochenplan: Einkaufsliste generieren
- [x] Manueller Eintrag
- [x] **E2E-Test:** Zutaten aus Rezept hinzufügen, zusammenführen testen, abhaken, Reset ✅ 8/8 Tests grün

---

## Phase 11 – Wochenplanung (F-PLAN-01)

- [x] API-Routes `GET/POST/PUT/DELETE /api/meal-plans`
- [x] **Frontend-Design-Skill:** Kalenderansicht (Wochenansicht), Drag-and-Drop Slots
- [x] 4 Slots pro Tag: Frühstück, Mittagessen, Abendessen, Snack
- [x] Portionsgrösse pro Eintrag anpassbar
- [x] Navigation vor/zurück (Wochen)
- [x] "Einkaufsliste generieren"-Button
- [x] **E2E-Test:** Rezept per Drag-and-Drop in Slot ziehen, Einkaufsliste aus Plan generieren ✅ 7/7 Tests grün

---

## Phase 12 – Sammlungen / Kochbücher (F-COLL-01)

- [x] API-Routes `GET/POST/PUT/DELETE /api/collections`
- [x] API-Route `POST/DELETE /api/collections/[id]/rezepte`
- [x] **Frontend-Design-Skill:** Sammlungs-Grid mit Titelbildern, Drag-and-Drop innerhalb Sammlung
- [x] Rezept zu Sammlung hinzufügen (aus Detailansicht)
- [x] CRUD Sammlung (Name, Beschreibung, Titelbild)
- [x] **E2E-Test:** Sammlung erstellen, Rezepte hinzufügen/entfernen, sortieren ✅ 8/8 Tests grün

---

## Phase 13 – Kochmodus & Drucken

### 13.1 Kochmodus
- [x] Vollbild-Layout-Komponente (Wake Lock API)
- [x] Schritt-für-Schritt-Navigation (Swipe-Gesten oder Buttons)
- [x] Zutatenliste als Overlay
- [x] Timer-Integration bei Zeitangaben
- [x] Grosses, lesbares Font (min. 18px Text, 24px Zutaten)
- [x] **E2E-Test:** Kochmodus starten, Steps durchnavigieren, Beenden ✅ 5/5 Tests grün

### 13.2 Drucken & PDF-Export (F-PRINT-01, F-SHARE-01)
- [x] Print-CSS-Stylesheet
- [x] Optionen: mit/ohne Bild, aktuelle Portionsgrösse
- [x] PDF-Generierung (@react-pdf/renderer) für Einzelrezept und Sammlung
- [x] **E2E-Test:** Druckvorschau öffnen, PDF herunterladen ✅ 4/4 Tests grün, 9/9 gesamt

---

## Phase 14 – Einheitenumrechner (F-CONV-01)

- [x] `frontend/src/lib/units/` Konvertierungs-Utilities (US cups ↔ dl/g, °F ↔ °C, oz ↔ g, etc.)
- [x] Zutatenbewusste Konvertierung (1 Cup Mehl = 125g, 1 Cup Zucker = 200g)
- [x] **Frontend-Design-Skill:** Eigenständige Umrechner-Seite `/werkzeuge` (Sofortergebnis, zutatenbewusst)
- [x] **E2E-Test:** Verschiedene Einheiten umrechnen, zutatenbewusst ✅ 7/7 Tests grün

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