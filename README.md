# Rezeptmeister

**KI-gestutzte Rezeptverwaltung fur den Schweizer Markt** -- Bring Your Own Key (BYOK)

---

## Features

### Authentifizierung & Benutzerverwaltung
- Registrierung mit Admin-Freigabe (Pending/Approved/Rejected)
- JWT-basierte Sessions (NextAuth.js v5)
- Admin-Dashboard: Benutzerverwaltung, Rollen, Status
- BYOK: Benutzer hinterlegen ihren eigenen Gemini/OpenAI/Claude-API-Schluessel (AES-256-verschluesselt)

### Rezeptverwaltung (CRUD)
- Rezepte erstellen, bearbeiten, loeschen
- Mehrstufiges Formular (Grunddaten, Zutaten, Anleitung, Metadaten)
- Dynamische Zutatenliste mit Drag-and-Drop-Sortierung
- Schweizer Masseinheiten: g, kg, ml, dl, l, EL, TL, KL, Msp., Prise, Stk., Bund, Pkg., Scheibe, Dose, Becher, Pfd.
- Portionsregler mit Live-Umrechnung aller Zutatenmengen
- Favoriten-Toggle

### Bildverwaltung
- Bild-Upload (Drag-and-Drop, max. 10 MB, JPEG/PNG)
- Automatische Thumbnail-Generierung (300x300 WebP)
- Bildergalerie mit Batch-Zuordnung und Batch-Loeschung
- KI-Bildgenerierung (Gemini) mit "KI-generiert"-Badge

### Suche
- **Volltextsuche:** PostgreSQL `tsvector` (deutsche Konfiguration, gewichtet A/B/C)
- **Semantische Suche:** Natuerlichsprachliche Anfragen via Gemini Embeddings (3072 Dim.)
- **Hybridsuche:** Volltext + Vektor kombiniert (Reciprocal Rank Fusion)
- **Cross-Modal-Suche:** Bild hochladen, aehnliche Rezepte finden
- **Kategoriefilter:** Kategorie, Kueche, Ernaehrungsform, Schwierigkeitsgrad, Zeitaufwand, Zutaten
- **"Was kann ich kochen?":** Vorhandene Zutaten eingeben, passende Rezepte nach Uebereinstimmungsgrad

### KI-Pipeline (FastAPI)
- **OCR / Textextraktion:** Rezept aus Foto extrahieren (Gemini Pro multimodal)
- **Rezeptvorschlaege:** 5 KI-generierte Vorschlaege basierend auf Kontext, Saison und Zeitbudget
- **Intelligente Skalierung:** KI-Hinweise bei starker Portionsumrechnung (Gewuerze, Backzeiten)
- **Bildgenerierung:** Automatisches Rezeptfoto via Gemini
- **URL-Import:** Webseite einlesen (schema.org/Recipe oder KI-Parsing), automatische CH-Einheitenkonvertierung
- **Websuche:** Rezepte im Web suchen und importieren (Gemini Grounding)
- **Naehrwertberechnung:** KI-Schaetzung (kcal, Protein, Fett, KH, Ballaststoffe) mit manueller Ueberschreibung
- **Embeddings:** Asynchrone Text- und Bild-Embeddings (gemini-embedding-2-preview)

### Notizen & Bewertung
- Notiztypen: Tipp, Variation, Erinnerung, Bewertung (1-5 Sterne), Allgemein
- Durchschnittsbewertung auf Rezeptkarte

### Einkaufsliste
- Zutaten aus Rezept oder Wochenplan hinzufuegen
- Intelligentes Zusammenfuehren (200g Mehl + 300g Mehl = 500g Mehl)
- Kategorisierung nach Ladenabteilung
- Abhaken, "Alle abhaken", Reset
- Manuelle Eintraege

### Wochenplanung
- Kalenderansicht (Wochenansicht, vor/zurueck-Navigation)
- 4 Slots pro Tag: Fruehstueck, Mittagessen, Abendessen, Snack
- Drag-and-Drop zum Einfuegen
- Portionsgroesse pro Eintrag anpassbar
- Einkaufsliste aus Wochenplan generieren

### Sammlungen / Kochbuecher
- Sammlungen erstellen (Name, Beschreibung, Titelbild)
- Rezepte per Drag-and-Drop hinzufuegen/sortieren

### Kochmodus
- Vollbild-Schritt-fuer-Schritt-Navigation (Wake Lock API)
- Swipe-Gesten, grosse Schrift (min. 18px), Timer-Integration
- Zutatenliste als Overlay

### Drucken & PDF-Export
- Print-CSS, Optionen: mit/ohne Bild, aktuelle Portionsgroesse
- PDF-Generierung fuer Einzelrezept und Sammlung (@react-pdf/renderer)

### Einheitenumrechner
- Eigenstaendige Seite `/werkzeuge`
- US cups <-> dl/g, Fahrenheit <-> Celsius, oz <-> g, lb <-> kg
- Zutatenbewusste Konvertierung (1 Cup Mehl = 125g, 1 Cup Zucker = 200g)

### Dashboard
- Begruessung, "Zuletzt bearbeitet"-Karussell, Favoriten-Schnellzugriff
- "Rezeptvorschlag des Tages" (KI)
- Schnellzugriff-Buttons, Einkaufslisten-Widget, Wochenplan-Vorschau

### PWA & Offline
- Service Worker mit CacheFirst/NetworkFirst-Strategien
- Rezepte fuer Offline-Zugang markieren (IndexedDB)
- Offline-Seiten fuer Rezeptliste und Detailansicht
- App Manifest (installierbar)

### Dark Mode
- Abgedunkelte warme Farbtoene via `next-themes`

---

## Tech Stack

| Komponente | Technologie | Version |
|---|---|---|
| **Frontend** | Next.js (App Router, TypeScript) | 16.2 |
| **UI** | Tailwind CSS, Lucide Icons | v4 |
| **State** | TanStack React Query | v5 |
| **ORM (Frontend)** | Drizzle ORM + drizzle-kit | 0.45 |
| **Auth** | NextAuth.js v5 (Credential Provider, JWT) | beta.30 |
| **Backend** | FastAPI (Python, uv) | 0.115+ |
| **ORM (Backend)** | SQLAlchemy + Alembic (asyncpg) | 2.0+ |
| **Datenbank** | PostgreSQL 16 + pgvector | pg16 |
| **KI** | Google Gemini (Embedding 2, Flash, Pro), OpenAI, Claude | - |
| **PDF** | @react-pdf/renderer | 4.3 |
| **Bilder** | sharp (Thumbnails), Gemini (Generierung) | 0.34 |
| **Drag-and-Drop** | @dnd-kit, @hello-pangea/dnd | - |
| **E2E-Tests** | Playwright | 1.59 |
| **Unit-Tests** | Vitest (Frontend), Pytest (Backend) | - |
| **Offline** | Service Worker, IndexedDB (idb) | - |

---

## Architektur

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                         │
│  Next.js App (React 19, Tailwind, PWA)                          │
│  Service Worker ◄── IndexedDB (Offline-Rezepte)                 │
└───────────────────────┬──────────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Next.js Server (Port 3000)                     │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────────────────────────────┐  │
│  │  API Routes      │  │  NextAuth.js (JWT Sessions)          │  │
│  │  /api/recipes    │  │  Credential Provider, bcrypt         │  │
│  │  /api/shopping   │  └──────────────────────────────────────┘  │
│  │  /api/meal-plans │                                            │
│  │  /api/notes      │  ┌──────────────────────────────────────┐  │
│  │  /api/images     │  │  /api/ai/* (Proxy)                   │  │
│  │  /api/collections│  │  Injiziert entschluesselten API-Key  │  │
│  │  /api/admin      │  │  Key wird NIE an Browser gesendet    │  │
│  └────────┬─────────┘  └───────────────┬──────────────────────┘  │
│           │ Drizzle ORM                 │ HTTP (internes Netz)    │
└───────────┼─────────────────────────────┼────────────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────┐  ┌─────────────────────────────────────┐
│  PostgreSQL + pgvector │  │  FastAPI Backend (Port 8000)        │
│  (Port 5432)           │  │                                     │
│                        │  │  /embed/*     Embeddings (Gemini)   │
│  - Rezepte             │  │  /ocr/*       OCR (Gemini Pro)      │
│  - Zutaten             │  │  /ai/*        Vorschlaege, Bild,    │
│  - Benutzer            │  │               Naehrwerte, Skalierung│
│  - Bilder              │  │  /import/*    URL-Import            │
│  - Notizen             │  │  /search/*    Semantische Suche,    │
│  - Einkaufsliste       │◄─┤               Websuche              │
│  - Wochenplaene        │  │                                     │
│  - Sammlungen          │  │  SQLAlchemy + Alembic (asyncpg)     │
│  - Embeddings (3072d)  │  └─────────────────────────────────────┘
└────────────────────────┘
```

**BYOK-Schluesselfluss:** Benutzer speichert API-Key in `/einstellungen` -> AES-256-verschluesselt in DB -> Next.js API-Route entschluesselt serverseitig -> Weiterleitung an FastAPI im Header `X-Gemini-API-Key` -> Key verlässt nie den Server.

---

## Voraussetzungen

- **Docker** und **Docker Compose** (fuer PostgreSQL + pgvector + FastAPI)
- **Node.js** >= 20 und **npm**
- **Python** >= 3.12 und **uv** (Python-Paketmanager)
- **Git**

---

## Installation & Lokale Entwicklung

### 1. Repository klonen

```bash
git clone https://github.com/<benutzername>/rezeptmeister.git
cd rezeptmeister
```

### 2. Umgebungsvariablen einrichten

```bash
cp .env.example .env.local
```

Pflichtfelder ausfuellen:
- `NEXTAUTH_SECRET` generieren: `openssl rand -base64 48`
- `ENCRYPTION_KEY` generieren: `openssl rand -hex 32`

### 3. Docker starten (Datenbank + Backend)

```bash
docker compose up -d
```

Startet:
- **PostgreSQL + pgvector** auf Port 5434 (intern 5432)
- **FastAPI Backend** (nur intern, Zugang via Next.js Proxy)

### 4. Datenbank initialisieren und Testdaten laden

Die Datei `db/init.sql` wird automatisch beim ersten Start von Docker ausgefuehrt. Testdaten (9 Schweizer Musterrezepte) laden:

```bash
docker compose exec db psql -U rezeptmeister -d rezeptmeister -f /docker-entrypoint-initdb.d/init.sql
cat db/seed.sql | docker compose exec -T db psql -U rezeptmeister -d rezeptmeister
```

### 5. Frontend einrichten

```bash
cd frontend
npm install
npx drizzle-kit generate    # Drizzle-Migrationen generieren
npx drizzle-kit migrate     # Migrationen anwenden
npm run dev                 # Entwicklungsserver auf http://localhost:3000
```

### 6. Anmelden

- **Admin:** harrywitzthum@gmail.com / `05!Shakespeare_15`
- **Testbenutzer:** test@rezeptmeister.ch / `test1234`

---

## Umgebungsvariablen

| Variable | Beschreibung | Pflicht | Beispiel |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindungsstring | Ja | `postgresql://rezeptmeister:localdev@localhost:5432/rezeptmeister` |
| `NEXTAUTH_SECRET` | Geheimschluessel fuer JWT-Sessions | Ja | `openssl rand -base64 48` |
| `NEXTAUTH_URL` | Basis-URL der App | Ja | `http://localhost:3000` |
| `BACKEND_URL` | FastAPI-Backend-URL | Ja | `http://localhost:8000` |
| `UPLOAD_DIR` | Verzeichnis fuer Bild-Uploads | Ja | `./uploads` |
| `ENCRYPTION_KEY` | AES-256-Schluessel (64 Hex-Zeichen) | Ja | `openssl rand -hex 32` |
| `INTERNAL_SECRET` | Shared Secret Next.js -> FastAPI | Nein | `openssl rand -hex 32` |
| `DB_PASSWORD` | Datenbank-Passwort | Nein | `localdev` |
| `S3_BUCKET` | S3-Bucket (nur Produktion) | Nein | `rezeptmeister-uploads` |
| `S3_REGION` | S3-Region | Nein | `eu-central-1` |
| `S3_ACCESS_KEY` | S3-Zugangsdaten | Nein | - |
| `S3_SECRET_KEY` | S3-Zugangsdaten | Nein | - |
| `S3_ENDPOINT_URL` | S3-Endpunkt (Cloudflare R2, MinIO) | Nein | - |

**Hinweis:** KI-API-Schluessel (Gemini, OpenAI, Claude) werden NICHT in Umgebungsvariablen konfiguriert. Jeder Benutzer hinterlegt seinen eigenen Schluessel unter `/einstellungen`.

---

## Tests

### Playwright E2E-Tests (Frontend)

```bash
cd frontend
npx playwright install        # Erstmalig: Browser installieren
npx playwright test           # Alle E2E-Tests ausfuehren (Port 3002)
npx playwright test tests/phase-2.spec.ts   # Einzelne Testdatei
npx playwright test --ui      # Interaktiver UI-Modus
npx playwright show-report    # Letzten Testbericht anzeigen
```

Die Tests laufen auf **Port 3002** (Ports 3000/3001 sind belegt).

### Pytest Backend-Tests

```bash
cd backend
uv run pytest                          # Alle Tests
uv run pytest tests/test_embeddings.py # Einzelne Testdatei
uv run pytest -k "test_ocr"           # Test nach Name
```

Backend-Tests laufen gegen eine echte PostgreSQL-Instanz (nie SQLite). Tests ueberspringen automatisch, wenn keine DB-Verbindung besteht.

### Vitest Unit-Tests (Frontend)

```bash
cd frontend
npm run test          # Einmalig ausfuehren
npm run test:watch    # Watch-Modus
```

---

## Deployment

### Frontend: Vercel

1. GitHub-Repository mit Vercel verbinden
2. Build-Einstellungen:
   - **Framework:** Next.js
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build`
3. Umgebungsvariablen in Vercel setzen (siehe Tabelle oben)
4. `NEXTAUTH_URL` auf die Produktions-Domain setzen

### Backend: Railway oder Fly.io

1. FastAPI-App aus `backend/` deployen
2. Dockerfile ist vorhanden (`backend/Dockerfile`)
3. Umgebungsvariablen setzen:
   - `DATABASE_URL` (mit `asyncpg` Treiber)
   - `UPLOAD_DIR`
   - `INTERNAL_SECRET`
4. Health-Check: `GET /health`

### Datenbank: Supabase oder Railway Postgres

1. PostgreSQL-Instanz mit **pgvector-Extension** erstellen
2. `db/init.sql` ausfuehren (Schema + pgvector)
3. `DATABASE_URL` in Frontend und Backend konfigurieren
4. Alembic-Migrationen anwenden: `uv run alembic upgrade head`

---

## Projektstruktur

```
rezeptmeister/
├── CLAUDE.md               # Entwicklungsrichtlinien (Claude Code)
├── SPEC.md                 # Feature-Spezifikation
├── README.md               # Diese Datei
├── docker-compose.yml      # PostgreSQL/pgvector + FastAPI
├── .env.example            # Umgebungsvariablen-Vorlage
├── db/
│   ├── init.sql            # Schema-DDL + pgvector Extension
│   └── seed.sql            # 9 Schweizer Musterrezepte
├── frontend/
│   ├── package.json
│   ├── next.config.ts
│   ├── drizzle.config.ts
│   ├── public/
│   │   ├── sw.js           # Service Worker (PWA)
│   │   └── icons/          # PWA-Icons
│   ├── src/
│   │   ├── app/            # Next.js App Router (Seiten + API Routes)
│   │   │   ├── (auth)/     # Login, Registrierung
│   │   │   ├── admin/      # Admin-Dashboard
│   │   │   ├── rezepte/    # Rezept-CRUD
│   │   │   ├── suche/      # Volltextsuche, Semantische Suche, Web
│   │   │   ├── bilder/     # Bildergalerie
│   │   │   ├── einkaufsliste/  # Einkaufsliste
│   │   │   ├── wochenplan/     # Wochenplanung
│   │   │   ├── sammlungen/     # Sammlungen / Kochbuecher
│   │   │   ├── vorschlaege/    # KI-Rezeptvorschlaege
│   │   │   ├── werkzeuge/      # Einheitenumrechner
│   │   │   ├── einstellungen/  # API-Schluessel, Profil
│   │   │   └── api/            # API Routes (REST)
│   │   ├── components/     # UI-Komponenten
│   │   ├── lib/
│   │   │   ├── db/         # Drizzle Schema + Verbindung
│   │   │   ├── units/      # Einheitenkonvertierung
│   │   │   └── auth/       # NextAuth Konfiguration
│   │   └── proxy.ts        # Route-Schutz (Next.js 16)
│   └── tests/              # Playwright E2E-Tests (phase-X.spec.ts)
├── backend/
│   ├── pyproject.toml      # Python-Abhaengigkeiten (uv)
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py         # FastAPI-Einstiegspunkt
│   │   ├── config.py       # Pydantic Settings
│   │   ├── models/         # SQLAlchemy-Modelle
│   │   ├── routers/        # API-Router (embed, ocr, ai, search, import)
│   │   └── services/       # Embedding, OCR, AI Services
│   ├── alembic/            # Datenbank-Migrationen
│   └── tests/              # Pytest-Tests
└── uploads/                # Lokaler Bild-Speicher (nur Entwicklung, gitignored)
    ├── originals/
    └── thumbnails/
```

---

## Lizenz

MIT License -- siehe [LICENSE](LICENSE) fuer Details.
