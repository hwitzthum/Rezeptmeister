# Rezeptmeister

**AI-powered recipe management for the Swiss market.**  
*Bring Your Own Key (BYOK) — your API keys, your data, your privacy.*

[![Next.js 16](https://img.shields.io/badge/Next.js-16.2.2-black?logo=nextdotjs)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009485?logo=fastapi)](https://fastapi.tiangolo.com)
[![PostgreSQL + pgvector](https://img.shields.io/badge/PostgreSQL-16%2Bpgvector-4169E1?logo=postgresql)](https://www.postgresql.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

Rezeptmeister is a full-stack recipe management app tailored for Swiss home cooks. It features AI-powered search, OCR recipe import, meal planning, offline mode, and a full cooking assistant — all powered by the API keys you provide. Keys are encrypted at rest and never sent to the browser.

All 18 implementation phases are complete with Playwright E2E, Vitest unit, and Pytest integration test coverage.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Roadmap](#roadmap)

---

## Quick Start

### Prerequisites

| Tool | Minimum Version |
|------|----------------|
| Docker & Docker Compose | Docker 24+ |
| Node.js & npm | Node 20+ |
| Python & uv | Python 3.12+ (backend dev only) |

### Setup (60 seconds)

```bash
# 1. Clone
git clone https://github.com/hwitzthum/rezeptmeister.git
cd rezeptmeister

# 2. Generate secrets
cp .env.example frontend/.env.local
# Edit frontend/.env.local — fill in the three required secrets:
#   NEXTAUTH_SECRET=$(openssl rand -base64 48)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)    # must be exactly 64 hex chars
#   INTERNAL_SECRET=$(openssl rand -hex 32)

# 3. Start PostgreSQL + pgvector + FastAPI backend
docker compose up -d
# Wait ~30 s for health checks to pass

# 4. Load Swiss test recipes
docker compose exec -T db psql -U rezeptmeister -d rezeptmeister < db/seed.sql

# 5. Install frontend deps and apply migrations
cd frontend
npm install
npx drizzle-kit migrate

# 6. Start frontend dev server
npm run dev  # http://localhost:3001
```

### Seed Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `harrywitzthum@gmail.com` | `05!Shakespeare_15` |
| Test user | `test@rezeptmeister.ch` | `test1234` |

> **Port note:** Port 3000 is reserved for open-webui (Ollama). Rezeptmeister runs on **3001** (frontend) and **8000** (FastAPI, available at `http://localhost:8000/docs`).

---

## Features

### Core Recipe Management

- **CRUD:** Create, edit, delete recipes with rich metadata (category, cuisine, difficulty, prep/cook time, source)
- **Ingredients:** Dynamic list with Swiss units — g, kg, ml, dl, l, EL, TL, KL, Msp., Prise, Stk., Bund, Pkg., Scheibe, Dose, Becher, Pfd.
- **Portions:** Live recalculation of ingredient amounts with AI hints for extreme scaling (spices, bake times)
- **Favorites:** One-click toggle with dedicated filter
- **Autocomplete:** Category, cuisine, and tag suggestions as you type

### Search & Discovery

| Mode | How it works |
|------|-------------|
| Full-text | PostgreSQL `tsvector` — German config, weighted A/B/C fields |
| Semantic | Gemini Embedding 2 (3072-dim) via pgvector cosine distance |
| Hybrid | Reciprocal Rank Fusion combining full-text + vector ranks |
| Cross-modal | Upload an image → find visually similar recipes |
| Ingredient match | Enter what's in your fridge → ranked recipe suggestions |
| Advanced filters | Category, cuisine, diet, difficulty, prep time, tags |

### Image Management

- Drag-and-drop upload, JPEG/PNG, max 10 MB
- Auto-generated 300×300 WebP thumbnails via sharp
- AI image generation from recipe title + ingredients (Gemini)
- Gallery view with batch assign / batch delete
- Async image embeddings for cross-modal search (never blocks HTTP)

### AI Features

All AI features require a user-provided Gemini API key configured in `/einstellungen`.

| Feature | Description |
|---------|-------------|
| OCR Import | Extract a recipe from a photo (Gemini Pro multimodal); supports multi-photo batches |
| Recipe Suggestions | 5 AI proposals based on ingredients, season, and time budget |
| Smart Scaling | KI hints when scaling to extreme portions |
| Image Generation | Auto-create recipe photos from title + ingredients |
| URL Import | Parse any recipe website (schema.org/Recipe or AI fallback); auto-converts US ↔ CH units |
| Web Search | Find and import recipes from across the web |
| Nutrition | AI-estimated kcal, protein, fat, carbs, fiber — with manual override |
| Embeddings | Async text + image embeddings (gemini-embedding-2-preview, 3072 dims) |

### Notes & Ratings

- Attach notes to any recipe (tip, variation, personal, general)
- Star ratings (1–5) with average displayed on recipe cards
- Filter recipe list by note type
- Edit and delete notes inline

### Meal Planning & Shopping

- **Meal planner:** Weekly calendar, 4 time slots per day (breakfast, lunch, dinner, snack), portion sizes, drag-and-drop reorder
- **Shopping list:** Auto-merge duplicate ingredients, aisle categorization
- **Plan → Shopping:** Generate a full shopping list from the week's plan in one click
- **Manual entries:** Add custom items to the shopping list

### Collections

- Create named cookbooks with title, description, and cover image
- Drag-and-drop recipe ordering within each collection
- Batch add/remove recipes
- Dedicated collection detail page with recipe grid

### Cooking Assistant

- Full-screen step-by-step mode with Wake Lock API (screen stays on)
- Swipe gestures to advance steps; minimum 18px font for readability
- Integrated per-step timers
- Ingredients overlay accessible mid-session

### Export & Sharing

- Print-optimized CSS with configurable options (include image, portions)
- PDF export for single recipes and full collections (`@react-pdf/renderer`)
- Shareable filtered-search URLs

### Unit Converter

Built-in Swiss-unit converter with ingredient-aware density (1 cup flour = 125 g, 1 cup sugar = 200 g). Accessible at `/werkzeuge`.

### Dashboard

- Personalized, time-aware welcome greeting
- Recent recipes carousel (last 5 edited)
- Favorites quick access
- AI daily suggestion (if API key is set)
- Shopping list summary and weekly plan preview widgets
- Quick actions: new recipe, image upload, URL import

### PWA & Offline Mode

- Service Worker with CacheFirst + NetworkFirst strategies
- Mark individual recipes for offline access (stored in IndexedDB)
- Offline recipe list and detail pages work without a network
- Installable as a PWA (app manifest, 192/384/512 icons, maskable)

### Dark Mode

- Auto-detects system preference (`next-themes`)
- Three-state toggle: Light / Dark / System
- Warm abgedunkelte palette for reduced eye strain

### Admin Panel

- User list with pending / approved / rejected filters and search
- Approve, reject, change role, delete users — all with confirmation dialogs
- Pagination for large user bases
- Batch re-embed all recipes when switching embedding models
- Available at `/admin` (role `admin` required)

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Browser                                         │
│  Next.js App (PWA) · Service Worker · IndexedDB  │
└───────────────────────┬──────────────────────────┘
                        │ HTTPS
                        ▼
┌──────────────────────────────────────────────────┐
│  Next.js 16 (App Router)              :3001      │
│  ├─ NextAuth.js JWT sessions                     │
│  ├─ Drizzle ORM → PostgreSQL (CRUD)              │
│  ├─ Zod validation + Rate limiting               │
│  └─ AI proxy routes (decrypt key, forward)       │
└───────┬──────────────────────────┬───────────────┘
        │ SQL (drizzle/postgres)   │ HTTP (private)
        ▼                          ▼
┌──────────────────┐   ┌──────────────────────────┐
│  PostgreSQL 16   │   │  FastAPI backend  :8000   │
│  + pgvector      │   │  ├─ Gemini embeddings     │
│  ├─ HNSW index   │   │  ├─ OCR (multimodal)      │
│  └─ VECTOR(3072) │   │  ├─ Recipe suggestions    │
└──────────────────┘   │  ├─ Image generation      │
                        │  ├─ URL / web import      │
                        │  └─ Nutrition estimates   │
                        └──────────────────────────┘
```

**Key rule:** Next.js API routes decrypt the user's API key server-side and inject it into each FastAPI request. The key is never sent to the browser and never stored in FastAPI.

### Database Schema (9 Tables)

| Table | Purpose |
|-------|---------|
| `users` | Registration, roles (`admin`/`user`), status (`pending`/`approved`/`rejected`) |
| `recipes` | Recipe metadata, source type, nutrition |
| `ingredients` | Recipe ingredients with amounts and Swiss units |
| `images` | Recipe photos, source type (`upload`/`ai_generated`/`ocr`), image embeddings |
| `notes` | User notes and star ratings on recipes |
| `shopping_list` | Shopping items, checked status, aisle categories |
| `meal_plans` | Weekly slots (breakfast/lunch/dinner/snack) |
| `collections` | User-created recipe collections / cookbooks |
| `api_keys` | AES-256-GCM encrypted user API keys |

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend framework** | Next.js App Router (TypeScript) | 16.2.2 |
| **UI runtime** | React | 19.2.4 |
| **Styling** | Tailwind CSS | v4 |
| **Icons** | Lucide React | 1.7.0 |
| **Server state** | TanStack React Query | 5.96+ |
| **ORM (frontend)** | Drizzle ORM + drizzle-kit | 0.45.2 |
| **Auth** | NextAuth.js v5 (JWT, Credential) | 5.0.0-beta.30 |
| **DB driver** | postgres (native) | 3.4.8 |
| **Drag-and-drop** | @dnd-kit | 6.3.1 |
| **PDF export** | @react-pdf/renderer | 4.3.3 |
| **Image processing** | sharp | 0.34.5 |
| **Offline storage** | idb (IndexedDB) | 8.0.3 |
| **Date utilities** | date-fns (Europe/Zurich) | 4.1.0 |
| **Backend framework** | FastAPI (async Python) | 0.115+ |
| **Python runtime** | uv | latest |
| **ORM (backend)** | SQLAlchemy 2 + Alembic (asyncpg) | 2.0.36+ |
| **Database** | PostgreSQL 16 + pgvector | pg16 |
| **AI models** | Google Gemini (Embedding 2, Flash, Pro) | latest |
| **E2E tests** | Playwright | 1.59.1 |
| **Unit tests** | Vitest (frontend), Pytest (backend) | 4.1.2 / 8.3.0+ |

---

## Local Development

### Running Everything

```bash
# Start PostgreSQL + FastAPI (Docker)
docker compose up -d

# Frontend dev server (hot reload)
cd frontend && npm run dev     # http://localhost:3001

# (Optional) Run FastAPI outside Docker for active backend development
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
# Note: set DATABASE_URL to localhost:5434 (host-mapped port)
```

### Key Commands

**Frontend**
```bash
cd frontend
npm run dev                   # Dev server on http://localhost:3001
npm run build                 # Production build (must pass before any merge)
npm run lint                  # ESLint
npm run test                  # Unit tests (Vitest)
npm run test:watch            # Vitest watch mode
npx drizzle-kit generate      # Generate migration from schema changes
npx drizzle-kit migrate       # Apply pending migrations
npx drizzle-kit studio        # Visual DB browser
npx playwright test           # E2E tests (port 3002)
npx playwright test --ui      # Interactive Playwright UI
npx playwright show-report    # View last test report
```

**Backend**
```bash
cd backend
uv sync                                              # Install dependencies
uv run uvicorn app.main:app --reload --port 8000    # Dev server
uv run pytest                                        # All tests
uv run pytest tests/test_embeddings.py              # Single file
uv run pytest -k "test_ocr"                         # By name
uv run alembic upgrade head                         # Apply migrations
uv run alembic revision --autogenerate -m "desc"    # Generate migration
```

**Docker**
```bash
docker compose up -d           # Start all services
docker compose logs backend    # FastAPI logs
docker compose logs db         # PostgreSQL logs
docker compose down            # Stop services
docker compose down -v         # Stop + remove volumes (wipes DB)
```

### Database Inspection

```bash
# Visual browser (Drizzle Studio)
cd frontend && npx drizzle-kit studio

# Direct psql (host port 5434 → container 5432)
psql postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister

# Via Docker exec
docker compose exec db psql -U rezeptmeister -d rezeptmeister
# Useful psql commands: \dt (tables), \d recipes (schema), SELECT * FROM users;

# View FastAPI OpenAPI docs
open http://localhost:8000/docs
```

---

## Environment Variables

### Why three separate files?

There are three `.env` locations, each for a different runtime. Merging them into one root file would not work cleanly — the three runtimes have different loading mechanisms, different path roots, and even different `DATABASE_URL` formats for the same database.

| File | Read by | Why it lives here |
|------|---------|-------------------|
| `frontend/.env.local` | Next.js (Node.js process) | Next.js's native convention. `.env.local` is auto-excluded from git by Next.js's default `.gitignore` — a security feature you get for free. |
| `backend/.env` | FastAPI / Python (`python-dotenv`) | Only relevant when running FastAPI locally outside Docker. In Docker, `docker-compose.yml` injects these values directly via `environment:` — this file is not mounted into the container. |
| `.env` (project root) | `docker-compose.yml` | Docker Compose reads the root `.env` automatically to interpolate `${VAR}` placeholders in `docker-compose.yml` (e.g. DB password, port mappings). Not read by Next.js or FastAPI. |

> **Production:** None of these files travel to production. Secrets are set via the deployment platform (Vercel dashboard, Railway secrets, Fly.io `flyctl secrets set`). See [Production Deployment](#production-deployment).

---

### `frontend/.env.local`

> Copy from `.env.example` and fill in the three generated secrets before first run.

| Variable | Description | How to generate / Example |
|----------|-------------|--------------------------|
| `DATABASE_URL` | PostgreSQL connection string for Drizzle ORM (postgres.js driver) | `postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister` — note port **5434** (host-mapped from Docker's 5432) |
| `NEXTAUTH_SECRET` | Signs and verifies JWT session tokens | `openssl rand -base64 48` |
| `NEXTAUTH_URL` | Canonical app URL — must match the browser origin exactly | `http://localhost:3001` |
| `BACKEND_URL` | Internal URL for Next.js → FastAPI proxy calls (server-side only, never reaches the browser) | `http://localhost:8000` |
| `UPLOAD_DIR` | Where uploaded images are stored, relative to `frontend/` | `./uploads` |
| `ENCRYPTION_KEY` | AES-256-GCM key used to encrypt user API keys at rest. **Must be exactly 64 hex characters (32 bytes).** | `openssl rand -hex 32` |
| `INTERNAL_SECRET` | Shared secret that Next.js sends to FastAPI on every AI request, so FastAPI can reject unauthenticated calls. Must match `backend/.env`. | `openssl rand -hex 32` |
| `GEMINI_TEST_KEY` | *(Optional)* Gemini API key used only during live E2E tests. Never used in the running app. | Gemini API key from Google AI Studio |
| `TEST_ADMIN_EMAIL` | *(Optional)* Admin email injected into Playwright tests | `test-admin@example.com` |
| `TEST_ADMIN_PASSWORD` | *(Optional)* Admin password injected into Playwright tests | A strong test password — never a real production credential |

---

### `backend/.env`

Used when running FastAPI locally outside Docker (`uv run uvicorn ...`). When FastAPI runs inside Docker, `docker-compose.yml` provides these variables directly and this file is ignored.

| Variable | Description | Local value | Docker value (set in compose) |
|----------|-------------|-------------|-------------------------------|
| `DATABASE_URL` | asyncpg connection string — note the `+asyncpg` driver prefix required by SQLAlchemy 2 async | `postgresql+asyncpg://rezeptmeister:localdev@localhost:5434/rezeptmeister` | `postgresql+asyncpg://rezeptmeister:localdev@db:5432/rezeptmeister` (uses Docker service name `db`) |
| `UPLOAD_DIR` | Image storage path from FastAPI's working directory | `../uploads` (one level up from `backend/`) | `/app/uploads` (inside the container) |
| `INTERNAL_SECRET` | Must match the value in `frontend/.env.local` exactly | *(same as frontend)* | *(injected by docker-compose)* |
| `DEBUG` | Enables `/docs`, `/redoc`, `/openapi.json` on the FastAPI server | `true` | `false` |
| `GEMINI_EMBEDDING_MODEL` | Which Gemini model to use for embeddings | `gemini-embedding-2-preview` | *(same)* |
| `GEMINI_OCR_MODEL` | Which Gemini model to use for OCR | `gemini-3.1-pro-preview` | *(same)* |

---

### `.env` (project root)

Read exclusively by `docker-compose.yml` for variable interpolation. Not read by Next.js or FastAPI.

| Variable | Used for |
|----------|----------|
| `DB_PASSWORD` | Interpolated into the `POSTGRES_PASSWORD` env var and the `DATABASE_URL` inside the compose file |

---

### Why `DATABASE_URL` appears in both runtimes with different formats

Both Next.js and FastAPI connect to the same PostgreSQL instance, but use different drivers that require different URL prefixes:

| Runtime | Driver | URL format |
|---------|--------|------------|
| Next.js (Drizzle) | `postgres` (postgres.js) | `postgresql://user:pass@host:port/db` |
| FastAPI (SQLAlchemy async) | `asyncpg` | `postgresql+asyncpg://user:pass@host:port/db` |

The host also differs: `localhost:5434` from the host machine vs. `db:5432` from inside the Docker network.

---

## Advanced Features

### BYOK API Key Security

Users provide their own Gemini API key. The app handles the full lifecycle:

1. User enters key at `/einstellungen`
2. Next.js API route encrypts it with `ENCRYPTION_KEY` (AES-256-GCM)
3. Encrypted value stored in `api_keys` table
4. On each AI request: Next.js decrypts + injects the key into the FastAPI request body
5. FastAPI uses the key, then discards it — never writes it to disk or logs

Frontend shows only the last 4 characters (`sk-...abc1`). The plaintext key never reaches the browser after initial entry.

### Rate Limiting

- **Default:** 100 requests / 15 min per IP (`express-rate-limit`)
- **Auth routes** (`/api/auth/*`): stricter limit to prevent brute force
- **AI routes** (`/api/ai/*`): stricter limit to prevent Gemini quota exhaustion
- Configuration: `frontend/src/lib/rate-limit.ts`

### Semantic Search Pipeline

```
User query
    │ Gemini Embedding 2 (task: search_query)
    ▼
3072-dim vector
    │ pgvector cosine distance (<=>)
    ▼
Vector search results ─┐
                        ├─ Reciprocal Rank Fusion ──▶ Hybrid results
Full-text (tsvector) ──┘
```

HNSW index on `recipes.embedding` for production-scale vector search.

### Offline Mode

- Service Worker intercepts fetch events (CacheFirst for assets, NetworkFirst for API)
- "Offline verfügbar" toggle on recipe detail → stores JSON + thumbnail in IndexedDB
- `/offline` and `/offline/rezept` pages work fully without a network connection
- Sync resumes automatically when connectivity is restored

### Admin Re-Embedding

When upgrading to a new embedding model:

1. Admin Dashboard → "Re-Embed All Recipes"
2. FastAPI re-processes recipes sequentially (rate-limit safe)
3. Progress visible in admin UI in real time
4. Endpoint chain: `POST /api/admin/re-embed` → `POST /admin/re-embed-all` (FastAPI)

### Swiss Units & Auto-Conversion

All units use Swiss standard. On import from US recipes:

| US | Swiss |
|----|-------|
| 1 cup flour | 125 g |
| 1 cup sugar | 200 g |
| 1 cup liquid | 2.4 dl |
| °F | °C |
| oz | g |
| lb | kg |

Conversion utilities: `frontend/src/lib/units/converter.ts`

---

## Testing

Rezeptmeister uses a **three-layer testing strategy**. A feature is not done until all applicable layers pass.

### Layer 1 — Unit Tests (Vitest)

Pure functions, React hooks, utilities.

```bash
cd frontend && npm run test
```

Examples: unit converter, cryptography helpers, timer parser, aisle categorizer, debounce hook.

### Layer 2 — Integration Tests (Pytest)

API endpoints against a real PostgreSQL instance (never SQLite).

```bash
cd backend && uv run pytest
```

Tests skip gracefully when the DB is unavailable (`pytest.mark.skipif` on connection check). Key files: `tests/test_embeddings.py`, `tests/test_ocr.py`.

### Layer 3 — E2E Tests (Playwright)

Full user journeys across all 18 phases.

```bash
cd frontend
npx playwright test                         # All phases
npx playwright test tests/phase-8.spec.ts  # Single phase
npx playwright test --ui                    # Interactive mode
npx playwright show-report                  # HTML report
```

> Tests run on port **3002** (separate from the dev server on 3001). Playwright config: `frontend/playwright.config.ts`.

### Phase Test Files

Each implementation phase has a corresponding test file (`frontend/tests/phase-{N}.spec.ts`). All 18 are implemented and passing.

### Example GitHub Actions CI

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_DB: rezeptmeister
          POSTGRES_USER: rezeptmeister
          POSTGRES_PASSWORD: localdev
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install uv
        run: pip install uv
      - name: Frontend unit tests
        working-directory: frontend
        run: npm ci && npm run test
      - name: Frontend build
        working-directory: frontend
        run: npm run build
      - name: Backend tests
        working-directory: backend
        run: uv sync && uv run pytest
      - name: E2E tests
        working-directory: frontend
        run: |
          npx playwright install --with-deps chromium
          npx playwright test
```

---

## Production Deployment

### Step 1 — Frontend (Vercel)

1. Connect the GitHub repo to Vercel
2. Set **Root Directory:** `frontend`, **Framework:** Next.js
3. Add environment variables in the Vercel dashboard:

```
DATABASE_URL        postgresql://...
NEXTAUTH_SECRET     <generated>
NEXTAUTH_URL        https://yourdomain.com
BACKEND_URL         https://api.yourdomain.com
ENCRYPTION_KEY      <64 hex chars>
INTERNAL_SECRET     <generated>
UPLOAD_DIR          /tmp/uploads   # or remove if using S3/R2
```

4. Every push to `main` auto-deploys. PRs get preview deployments.

### Step 2 — Backend (Railway or Fly.io)

**Railway:**
1. New project → Docker service → connect repo, select `backend/` directory
2. Set `DATABASE_URL` (asyncpg format) and `INTERNAL_SECRET`

**Fly.io:**
```bash
cd backend
flyctl launch   # generates fly.toml
flyctl secrets set DATABASE_URL="postgresql+asyncpg://..." INTERNAL_SECRET="..."
flyctl deploy
```

### Step 3 — Database (Supabase or Railway)

Supabase is recommended because pgvector is enabled by default.

```sql
-- If using a bare PostgreSQL instance, enable pgvector first:
CREATE EXTENSION IF NOT EXISTS vector;
```

Then run the schema:
```bash
# Via Alembic (from backend/)
uv run alembic upgrade head

# Or apply db/init.sql directly via psql
psql $DATABASE_URL < db/init.sql
```

### Step 4 — Image Storage (Production)

Replace local `uploads/` with S3 or Cloudflare R2. Update `next.config.ts`:

```typescript
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'your-bucket.s3.amazonaws.com' },
    // or: { protocol: 'https', hostname: 'your-account.r2.cloudflarestorage.com' }
  ],
},
```

### Step 5 — Security Checklist

- [ ] `HTTPS` enforced (Vercel auto-provisions SSL)
- [ ] `ENCRYPTION_KEY` is exactly 64 hex chars (32 bytes)
- [ ] `NEXTAUTH_SECRET` rotated from defaults
- [ ] Database reachable only from app servers (firewall)
- [ ] No secrets committed to git (`.env.local` in `.gitignore`)
- [ ] CORS in FastAPI configured to allow only the Next.js origin
- [ ] Daily automated database backups enabled (Supabase / Railway)
- [ ] Rate limits reviewed for production traffic levels

### Production Deployment Checklist

- [ ] `npm run test` passes
- [ ] `npm run build` completes with 0 TypeScript errors
- [ ] `npm run lint` is clean
- [ ] `uv run pytest` passes
- [ ] `npx playwright test` passes
- [ ] All environment variables set in hosting platform
- [ ] Database migrations applied (`alembic upgrade head`)
- [ ] Dark mode tested
- [ ] Mobile responsive tested
- [ ] Offline mode tested

---

## Troubleshooting

### "Port 3001 already in use"

```bash
lsof -i :3001
kill -9 <PID>
```

### "Database connection refused"

```bash
# Check containers
docker compose ps
docker compose logs db

# Test connection (host port is 5434, not 5432)
psql postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister -c "SELECT 1"
```

### "NextAuth login fails"

- Confirm `NEXTAUTH_SECRET` is non-empty
- Confirm `NEXTAUTH_URL` matches the current origin
- Clear cookies: DevTools → Application → Cookies → Delete All
- Verify user status is `approved`:
  ```sql
  SELECT email, status FROM users;
  ```

### "AI features unavailable"

- Set a Gemini API key at `/einstellungen`
- Verify the key is valid in Google AI Studio
- Check the `api_keys` table has a row for your user

### "Embedding service returns 401"

- Gemini key is missing or expired
- Confirm `INTERNAL_SECRET` matches between frontend and backend

### "Images not showing"

- Confirm `UPLOAD_DIR` exists and is writable
- List thumbnails: `ls uploads/thumbnails/`
- For S3/R2: verify public read bucket policy
- Hard-refresh browser: `Cmd+Shift+R`

### "E2E tests time out"

- Dev server must be running: `npm run dev` (port 3001)
- Docker services must be running: `docker compose up -d`
- Increase timeout in `playwright.config.ts`: `timeout: 30_000`

### "Rate limiting blocks requests in development"

Check and adjust limits in `frontend/src/lib/rate-limit.ts`. Headers `RateLimit-Remaining` and `RateLimit-Reset` in the response tell you the current state.

### Access FastAPI Swagger Docs

FastAPI is exposed on port 8000 by default:

```bash
open http://localhost:8000/docs      # Swagger UI
open http://localhost:8000/openapi.json
```

### View Alembic Migration History

```bash
docker compose exec backend uv run alembic history
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Follow the conventions:
   - All UI text in **German (Swiss "ss", not "ß")**
   - Swiss units throughout
   - TypeScript strict mode
   - Accessibility: WCAG 2.1 AA minimum (`aria-label`, `aria-expanded`)
   - Zod validation on every API route entry point
   - Rate limiting on every new API endpoint
4. Tests required: unit + E2E (and backend Pytest if touching FastAPI)
5. `npm run build` must pass with 0 errors before opening a PR
6. Open a pull request with a clear description of the change

---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Collaborative recipes (multi-user editing)
- [ ] Recipe versioning (track changes over time)
- [ ] Advanced nutrition tracking and targets
- [ ] Grocery delivery integration
- [ ] Social sharing and community ratings
- [ ] Voice-controlled cooking mode

---

## Acknowledgments

- **Next.js & React** — Modern web framework
- **FastAPI** — Fast, async Python backend
- **PostgreSQL & pgvector** — Reliable database with native vector search
- **Google Gemini** — AI embeddings, OCR, and content generation
- **Tailwind CSS** — Utility-first styling
- **Playwright** — Comprehensive E2E testing

Built for Swiss home cooks.  
*Last updated: 2026-04-06*
