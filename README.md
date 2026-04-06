# Rezeptmeister 🍳

**AI-powered recipe management for the Swiss market**  
*Bring Your Own Key (BYOK) — your API keys, your data, your privacy.*

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/hwitzthum/rezeptmeister)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.2.2-black)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009485)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2Bpgvector-blue)](https://www.postgresql.org)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Quick Start (60 seconds)](#quick-start-60-seconds)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Local Development](#local-development)
- [Advanced Features](#advanced-features)
- [Developer Guide](#developer-guide)
- [Testing Strategy](#testing-strategy)
- [Production Deployment](#production-deployment)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Overview

Rezeptmeister is a full-stack, BYOK recipe management application designed for Swiss home cooks. It combines Next.js 16 frontend, FastAPI AI backend, and PostgreSQL with pgvector for semantic search. All 18 implementation phases are complete with comprehensive E2E testing.

**Key Philosophy:** Users bring their own API keys (Gemini, OpenAI, Claude). The app handles encryption, storage, and server-side decryption — keys never touch the browser.

---

## Quick Start (60 seconds)

### Prerequisites
- Docker & Docker Compose
- Node.js ≥ 20 & npm
- Python ≥ 3.12 & uv (only needed for standalone backend development)
- Git

### Setup

```bash
# 1. Clone and navigate
git clone https://github.com/hwitzthum/rezeptmeister.git
cd rezeptmeister

# 2. Create env file from template and generate secrets
cp .env.example frontend/.env.local
# Edit frontend/.env.local — fill in the three required secrets:
#   NEXTAUTH_SECRET=$(openssl rand -base64 48)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
#   INTERNAL_SECRET=$(openssl rand -hex 32)

# 3. Start database (PostgreSQL + pgvector) & FastAPI backend
docker compose up -d
# Wait ~30s for healthchecks to pass

# 4. Load seed data (Swiss test recipes + users)
docker compose exec -T db psql -U rezeptmeister -d rezeptmeister < db/seed.sql

# 5. Setup & start frontend
cd frontend
npm install
npx drizzle-kit migrate   # Apply DB migrations (tables created by init.sql, migrations add any delta)
npm run dev                # Dev server → http://localhost:3001
```

### Login (seed accounts)

| Account | Email | Password |
|---------|-------|----------|
| Admin | `harrywitzthum@gmail.com` | `05!Shakespeare_15` |
| Test user | `test@rezeptmeister.ch` | `test1234` |

**Done!** Your app is running at `http://localhost:3001`.

> **Note:** Port 3000 is reserved for open-webui (Ollama). Rezeptmeister runs on port 3001. The FastAPI backend runs inside Docker and is not exposed on the host by default. To access FastAPI Swagger docs directly, temporarily add `ports: ["8000:8000"]` to the `backend` service in `docker-compose.yml`, then visit `http://localhost:8000/docs`.

---

## Features

### Core Recipe Management (Phases 1–5)
- **CRUD:** Create, edit, delete recipes with rich metadata
- **Ingredients:** Dynamic list with Swiss units (g, kg, ml, dl, EL, TL, etc.)
- **Portions:** Live recalculation of ingredient amounts
- **Favorites:** Toggle and quick access
- **Metadata:** Category, cuisine, difficulty, prep time, nutrition

### Search & Discovery (Phases 5–7)
- **Full-Text Search:** PostgreSQL `tsvector` (German config, weighted A/B/C)
- **Semantic Search:** Natural language via Gemini Embeddings (3072-dim)
- **Hybrid Search:** Combined full-text + vector (Reciprocal Rank Fusion)
- **Cross-Modal Search:** Upload image → find similar recipes
- **Advanced Filters:** Category, cuisine, diet, difficulty, prep time, ingredients
- **"What can I cook?":** Input available ingredients → ranked recipe matches

### Image Management (Phase 4)
- **Upload:** Drag-and-drop, max 10 MB, JPEG/PNG, automatic validation
- **Thumbnails:** Auto-generated 300×300 WebP via sharp
- **Gallery:** Batch assignment, batch deletion
- **AI Generation:** Auto-generate recipe photos (Gemini)
- **Batch Operations:** Assign/delete multiple images at once

### AI Features (Phase 8)
- **OCR / Recipe Import:** Extract recipe from photo (Gemini Pro multimodal)
- **Recipe Suggestions:** 5 AI proposals based on ingredients, season, time budget
- **Smart Scaling:** KI hints for extreme portions (spices, bake times)
- **Image Generation:** Auto-create recipe photos from title + ingredients
- **URL Import:** Parse websites (schema.org/Recipe or KI), auto-convert US↔CH units
- **Web Search:** Find & import recipes from across the web
- **Nutrition:** AI estimates (kcal, protein, fat, carbs, fiber) with manual override
- **Embeddings:** Async text & image embeddings (gemini-embedding-2-preview)

### Meal Planning & Shopping (Phases 10–11)
- **Shopping Lists:** Auto-merge duplicates, aisle categorization
- **Meal Planner:** Weekly calendar, 4 slots/day, portion sizes, drag-and-drop
- **Plan → Shopping:** Generate shopping list from week plan
- **Manual Entries:** Add custom items to shopping list

### Collections & Organization (Phase 12)
- **Cookbooks:** Create custom collections with titles, descriptions, cover images
- **Drag-and-Drop:** Reorder recipes within collections
- **Batch Ops:** Add/remove multiple recipes at once

### Cooking Assistant (Phase 13)
- **Cooking Mode:** Full-screen step-by-step navigation (Wake Lock API)
- **Gestures:** Swipe to advance, large fonts (min. 18px)
- **Timer:** Integrated timer for step durations
- **Ingredients Overlay:** Quick access while cooking

### Export & Sharing (Phase 13)
- **Print:** Print CSS with options (image, portions)
- **PDF Export:** Single recipes and entire collections (@react-pdf/renderer)
- **Shareable URLs:** Share filtered searches

### Tools (Phase 14)
- **Unit Converter:** Swiss units, ingredient-aware (1 cup flour = 125g, 1 cup sugar = 200g)

### Dashboard (Phase 15)
- **Welcome Greeting:** Personalized, time-aware
- **Recent Recipes:** Last 5 edited (carousel)
- **Favorites:** Quick access
- **Daily Suggestion:** AI recipe proposal (if key configured)
- **Widgets:** Shopping list summary, weekly plan preview
- **Quick Actions:** New recipe, upload image, import URL

### PWA & Offline (Phase 17)
- **Service Worker:** CacheFirst + NetworkFirst strategies
- **Offline Recipes:** Mark recipes for offline access (IndexedDB)
- **Offline Pages:** View recipes & list without network
- **Installable:** App manifest, PWA icons (192/384/512), maskable

### Dark Mode (Phase 18)
- **Auto-Detect:** Respects system preference via `next-themes`
- **3-State Toggle:** Light, Dark, System
- **Warm Palette:** Abgedunkelte warm tones for reduced eye strain

### Admin Features (Phase 2 & 18)
- **User Management:** Approve/reject/delete users
- **Role Management:** Admin, user roles
- **Re-Embedding:** Batch re-embed all recipes (for model updates)

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router, TypeScript) | 16.2.2 |
| **UI Framework** | React | 19.2.4 |
| **Styling** | Tailwind CSS | v4 |
| **Icons** | Lucide React | 1.7.0 |
| **State/Data** | TanStack React Query | 5.96+ |
| **ORM (Frontend)** | Drizzle ORM + drizzle-kit | 0.45.2 |
| **Auth** | NextAuth.js v5 (Credential Provider, JWT) | 5.0.0-beta.30 |
| **DB Client** | postgres (native driver) | 3.4.8 |
| **Backend** | FastAPI (Python, async) | 0.115+ |
| **Python Runtime** | uv (package manager) | latest |
| **ORM (Backend)** | SQLAlchemy + Alembic (asyncpg) | 2.0.36+ |
| **Database** | PostgreSQL 16 + pgvector | pg16 |
| **Vector Search** | pgvector + HNSW | 3072-dim |
| **AI Models** | Google Gemini (Embedding 2, Flash, Pro) | latest |
| **Image Processing** | sharp | 0.34.5 |
| **PDF Export** | @react-pdf/renderer | 4.3.3 |
| **Drag-and-Drop** | @dnd-kit | 6.3.1 |
| **Offline Storage** | IndexedDB (idb) | 8.0.3 |
| **Date Utilities** | date-fns | 4.1.0 |
| **E2E Testing** | Playwright | 1.59.1 |
| **Unit Testing** | Vitest (Frontend), Pytest (Backend) | 4.1.2, 8.3.0+ |

---

## Local Development

### Full Setup

```bash
# 1. Clone repository
git clone https://github.com/hwitzthum/rezeptmeister.git
cd rezeptmeister

# 2. Create env file from template
cp .env.example frontend/.env.local
# Edit frontend/.env.local and generate the three required secrets:
#   NEXTAUTH_SECRET=$(openssl rand -base64 48)
#   ENCRYPTION_KEY=$(openssl rand -hex 32)
#   INTERNAL_SECRET=$(openssl rand -hex 32)
# All other defaults work for local dev.

# 3. Start Docker services
docker compose up -d
# PostgreSQL (port 5434) + FastAPI backend start with healthchecks (~30s)

# 4. Initialize database
# db/init.sql runs automatically on first Docker start (creates tables + indexes)
# Load seed data (9 Swiss test recipes + 2 test users):
docker compose exec -T db psql -U rezeptmeister -d rezeptmeister < db/seed.sql

# 5. Setup frontend
cd frontend
npm install
npx drizzle-kit migrate     # Apply any pending Drizzle migrations
npm run dev                 # Dev server → http://localhost:3000

# 6. (Optional) Run backend outside Docker for active development
cd ../backend
uv sync                     # Install Python dependencies
uv run uvicorn app.main:app --reload --port 8000  # Dev server → http://localhost:8000
# Note: when running backend outside Docker, it connects to DB at localhost:5434
```

### Environment Variables

**Frontend (`frontend/.env.local`)**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection (host port 5434) | `postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister` |
| `NEXTAUTH_SECRET` | JWT signing key (48+ chars) | `openssl rand -base64 48` |
| `NEXTAUTH_URL` | App base URL | `http://localhost:3001` |
| `BACKEND_URL` | FastAPI backend URL | `http://localhost:8000` |
| `UPLOAD_DIR` | Image upload directory | `./uploads` |
| `ENCRYPTION_KEY` | AES-256 key for API keys (64 hex chars) | `openssl rand -hex 32` |
| `INTERNAL_SECRET` | Shared secret for Next.js → FastAPI auth | `openssl rand -hex 32` |

**Backend (via docker-compose or `backend/.env`)**

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection (asyncpg, Docker-internal port 5432) | `postgresql+asyncpg://rezeptmeister:localdev@db:5432/rezeptmeister` |
| `UPLOAD_DIR` | Image storage path | `/app/uploads` |
| `INTERNAL_SECRET` | Must match the frontend value | (same as frontend) |

### Key Commands

**Frontend**
```bash
cd frontend
npm run dev              # Dev server (hot reload)
npm run build           # Production build (required before deploy)
npm run lint            # ESLint
npm run test            # Unit tests (Vitest)
npm run test:watch      # Watch mode
npx playwright test     # E2E tests (runs on port 3002)
npx playwright test --ui # Interactive UI mode
```

**Backend**
```bash
cd backend
uv sync                                    # Install deps
uv run uvicorn app.main:app --reload       # Dev server
uv run pytest                              # All tests
uv run pytest tests/test_embeddings.py     # Single file
uv run pytest -k "test_ocr"                # By name
uv run alembic upgrade head                # Apply DB migrations
uv run alembic revision --autogenerate -m "description"  # Generate migration
```

**Docker**
```bash
docker compose up -d                # Start all services
docker compose logs backend         # View FastAPI logs
docker compose logs db              # View PostgreSQL logs
docker compose down                 # Stop all services
docker compose down -v              # Stop + remove volumes
```

### Debugging

**Frontend Debugging**
- Open DevTools (F12) → Sources
- Set breakpoints, use Chrome DevTools Recorder
- Check Network tab for API calls (Rate Limiting warnings visible here)

**Backend Debugging**
```bash
# View Alembic migration history
docker compose exec backend uv run alembic history

# Check FastAPI docs (requires port 8000 exposed — see Quick Start note)
curl http://localhost:8000/docs  # Swagger UI
curl http://localhost:8000/openapi.json

# Or access via Docker without exposing the port:
docker compose exec backend curl http://localhost:8000/docs
```

**Database Inspection**
```bash
# Use Drizzle Studio (visual DB browser)
cd frontend
npx drizzle-kit studio

# Direct psql access via Docker
docker compose exec db psql -U rezeptmeister -d rezeptmeister
# Inside psql: \dt (list tables), \d recipes (describe table), etc.

# Or from the host (port 5434 is mapped from Docker):
psql postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister
```

---

## Advanced Features

### BYOK API Key Management
Users bring their own keys (Gemini, OpenAI, Claude). The app handles:
- **Encryption:** AES-256-GCM at rest in PostgreSQL
- **Decryption:** Server-side only (in Next.js API routes)
- **Masking:** Frontend shows only last 4 chars (sk-...abc1)
- **Per-User:** Each user's key is independent; app never stores master keys

**How it works:**
1. User enters API key in `/einstellungen`
2. Next.js encrypts with `ENCRYPTION_KEY` from env
3. Encrypted value stored in DB
4. When calling AI features, Next.js decrypts & injects into FastAPI request
5. FastAPI uses key, then forgets it (never stored)

### Offline Mode
- **Service Worker:** Intercepts requests, serves cached recipes
- **IndexedDB:** Stores marked-for-offline recipes as JSON blobs
- **Offline Pages:** `/offline` for list view, `/offline/rezept` for detail
- **Sync:** When back online, app fetches latest data

**Marking Recipes:**
- Click recipe detail → "Offline verfügbar" toggle
- App caches recipe JSON + thumbnail image
- Available even if network drops mid-session

### Semantic Search Pipeline
1. **Query Embedding:** User text → Gemini Embedding 2 (3072-dim)
2. **Database Search:** pgvector cosine distance (`<=>` operator)
3. **Hybrid:** RRF combines full-text rank + vector rank
4. **Cross-Modal:** Image → embedding → search recipes

**Performance:** HNSW index on `recipes.embedding` (production-optimized).

### Image Embedding Workflow
1. User uploads image → validation (MIME type, 10MB max)
2. Sharp generates 300×300 WebP thumbnail
3. Both stored locally (`uploads/originals/`, `uploads/thumbnails/`)
4. Background task: FastAPI creates image embedding (async, never blocks HTTP)
5. Image embedding indexed in DB for cross-modal search

### Rate Limiting
- **Default:** 100 requests / 15 minutes per IP (express-rate-limit)
- **Auth Routes:** Stricter (prevent brute force)
- **AI Routes:** Stricter (prevent API quota exhaustion)
- **Configurable:** Edit `frontend/src/lib/rate-limit.ts`

### Admin Re-Embedding
Deployed a new embedding model? Re-embed all recipes:
1. Admin Dashboard → "Re-Embed All Recipes"
2. FastAPI processes sequentially (prevents rate limit)
3. Progress visible in admin UI
4. Endpoint: `POST /api/admin/re-embed` → `POST /admin/re-embed-all` (FastAPI)

---

## Developer Guide

### Adding a New Feature

1. **Plan:** Update `tasks/todo.md` with checklist
2. **Branch:** Create feature branch (`git checkout -b feat/feature-name`)
3. **Backend** (if API needed):
   - Add SQLAlchemy model in `backend/app/models/`
   - Create Alembic migration: `uv run alembic revision --autogenerate`
   - Add FastAPI router in `backend/app/routers/`
   - Write tests in `backend/tests/`
4. **Frontend:**
   - Add Drizzle schema in `frontend/src/lib/db/schema.ts` (if DB table)
   - Create Next.js API route in `frontend/src/app/api/`
   - Create page/component in `frontend/src/app/`
   - Add E2E test in `frontend/tests/`
5. **Test:** 
   - Unit tests (Vitest): `npm run test`
   - Backend tests: `uv run pytest`
   - E2E tests: `npx playwright test`
6. **Build:** `npm run build` (must pass with 0 TypeScript errors)
7. **PR:** Push and create pull request

### Code Conventions

**Database**
- **Drizzle:** Source of truth for schema (frontend)
- **Alembic:** Keeps sync with Drizzle (backend)
- **Vector Columns:** Use `customType('vector', ...)` in Drizzle, `VECTOR(3072)` in SQL
- **Timestamps:** `created_at`, `updated_at` (auto-managed via DB triggers or ORM hooks)

**API Routes (Next.js)**
```typescript
// Input validation with Zod
const schema = z.object({
  title: z.string().min(1).max(200),
  // ...
});

export async function POST(req: Request) {
  const body = await req.json();
  const data = schema.parse(body); // Throws if invalid
  // ... handle request
  return NextResponse.json({ success: true });
}
```

**FastAPI Routes**
```python
@router.post("/embed/text")
async def embed_text(request: EmbedTextRequest) -> EmbedResponse:
    # Pydantic validates request automatically
    # Return typed response
    return EmbedResponse(embeddings=embeddings, usage={"input_tokens": 100})
```

**Components**
- Use `next/image` for all recipe images (optimization)
- ARIA labels for accessibility (`aria-label`, `aria-expanded`)
- Dark mode support (Tailwind `dark:` prefix)
- Mobile-first (responsive by default)

**Swiss Context**
- Units: Use `lib/units/` converters
- Language: All UI text in German (Swiss "ss" not "ß")
- Timezone: Use `date-fns` with `Europe/Zurich`

### Testing Best Practices

**E2E Tests (Playwright)**
```typescript
test('recipe creation flow', async ({ page, context }) => {
  await page.goto('/rezepte/neu');
  // Fill form, submit, verify
  await page.getByLabel('Titel').fill('Pasta Carbonara');
  // Assertions
  await expect(page).toHaveTitle('Rezeptmeister');
});
```

**Backend Tests (Pytest)**
```python
@pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="Database not available"
)
async def test_embedding_endpoint(client):
    response = await client.post("/embed/text", json={"text": "pasta"})
    assert response.status_code == 200
    assert len(response.json()["embeddings"]) == 3072
```

**Unit Tests (Vitest)**
```typescript
describe('Unit Converter', () => {
  it('converts cups to dl correctly', () => {
    expect(convertCupsToDl(1, 'flour')).toBe(1.25);
  });
});
```

### Deployment Checklist

- [ ] All tests pass: `npm run test`, `uv run pytest`, `npx playwright test`
- [ ] No TypeScript errors: `npm run build`
- [ ] No ESLint warnings: `npm run lint`
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Rate limiting configured
- [ ] API keys not leaked in code
- [ ] Dark mode tested
- [ ] Mobile responsive tested
- [ ] Offline mode tested (if relevant)

---

## Testing Strategy

Rezeptmeister uses a **3-layer testing approach** for completeness:

### 1. Unit Tests (Vitest)
- Pure functions: converters, formatters, utilities
- React hooks: `useDebounce`, `useOnlineStatus`
- Run with: `npm run test`

### 2. Integration Tests (Pytest on Backend)
- API endpoints against real PostgreSQL
- Embedding service integration
- OCR pipeline
- Run with: `uv run pytest`

### 3. E2E Tests (Playwright)
- Full user journeys: register → login → create → search → export
- Each phase has dedicated test file: `tests/phase-X.spec.ts`
- Run on port 3002 (port 3000 = open-webui, port 3001 = Rezeptmeister)
- Run with: `npx playwright test`

### Test Execution

```bash
# All layers
cd frontend && npm run test && npm run build
cd ../backend && uv run pytest
npx playwright test

# Watch mode for development
npm run test:watch

# Individual test file
npx playwright test tests/phase-8.spec.ts

# Interactive UI mode
npx playwright test --ui
```

### CI/CD Integration

Example GitHub Actions workflow:
```yaml
name: Tests
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
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - uses: actions/setup-python@v4
        with:
          python-version: 3.12
      - run: npm install
      - run: npm run test
      - run: npm run build
      - run: uv sync && uv run pytest
      - run: npx playwright test
```

---

## Production Deployment

### Architecture Overview

```
┌─────────────────────────────────┐
│  Browser (Client)               │
│  Next.js App (PWA)              │
│  Service Worker + IndexedDB     │
└──────────────┬──────────────────┘
               │ HTTPS
               ▼
┌─────────────────────────────────┐
│  CDN (Vercel Edge Network)      │
│  - Static assets                │
│  - API route forwarding         │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Next.js Production (Vercel)    │
│  - API routes (encrypted keys)  │
│  - NextAuth.js (JWT sessions)   │
│  - Proxy to FastAPI             │
└──────────────┬──────────────────┘
               │ HTTP (private)
               ▼
┌─────────────────────────────────┐
│  FastAPI (Railway/Fly.io)       │
│  - Embeddings                   │
│  - OCR                          │
│  - AI features                  │
│  - Semantic search              │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  PostgreSQL (Supabase/Railway)  │
│  - pgvector extension           │
│  - HNSW indexes                 │
│  - Encrypted user data          │
└─────────────────────────────────┘
```

### Step 1: Frontend Deployment (Vercel)

1. **Connect GitHub repo to Vercel:**
   - Log in at https://vercel.com
   - Import project → select `rezeptmeister` repo
   - Root Directory: `frontend`
   - Framework: Next.js

2. **Configure Build:**
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm ci`

3. **Environment Variables:**
   Set in Vercel dashboard or `vercel.json`:
   ```json
   {
     "env": {
       "DATABASE_URL": "@database_url",
       "NEXTAUTH_SECRET": "@nextauth_secret",
       "NEXTAUTH_URL": "https://yourdomain.com",
       "BACKEND_URL": "https://api.yourdomain.com",
       "ENCRYPTION_KEY": "@encryption_key",
       "UPLOAD_DIR": "/tmp/uploads"
     }
   }
   ```

4. **Custom Domain:**
   - Vercel → Project Settings → Domains
   - Add domain, update DNS records
   - SSL auto-provisioned

5. **Deploy:**
   - Every push to `main` auto-deploys
   - Preview deployments for PRs

### Step 2: Backend Deployment (Railway or Fly.io)

**Option A: Railway**

1. Create Railway account at https://railway.app
2. Create new project → Add service → Docker
3. Connect GitHub repo
4. Select `backend/` directory
5. Set environment variables:
   ```
   DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
   UPLOAD_DIR=/app/uploads
   ```
6. Deploy!

**Option B: Fly.io**

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `flyctl auth login`
3. Create app: `flyctl launch` (in `backend/` directory)
4. Configure `fly.toml`:
   ```toml
   [build]
   dockerfile = "Dockerfile"
   
   [env]
   DATABASE_URL = "postgresql+asyncpg://user:pass@host/db"
   UPLOAD_DIR = "/app/uploads"
   
   [[services]]
   internal_port = 8000
   protocol = "tcp"
   ```
5. Deploy: `flyctl deploy`

### Step 3: Database Setup (Supabase or Railway)

**Supabase (Recommended for pgvector)**

1. Create account at https://supabase.io
2. Create new project (PostgreSQL 15+)
3. Enable pgvector extension:
   - SQL Editor → New Query
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

4. Run schema migrations:
   - Use `db/init.sql` in SQL Editor
   - Run Alembic: 
   ```bash
   uv run alembic upgrade head
   ```

5. Get connection string:
   - Project Settings → Database → Connection String
   - Use `postgresql://` URL (not `postgresql+asyncpg://`)

**Railway PostgreSQL**

1. Railway account → New Project
2. Add Database → PostgreSQL
3. Get connection string from Variables tab
4. Install pgvector extension:
   ```bash
   docker run --rm -it postgres:16 psql -h host -U user -d db -c "CREATE EXTENSION IF NOT EXISTS vector;"
   ```
5. Run migrations

### Step 4: Image Storage (Optional S3/R2)

For production, use cloud storage instead of local filesystem:

**AWS S3**
```typescript
// next.config.ts
export default {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'your-bucket.s3.amazonaws.com',
      },
    ],
  },
};
```

**Cloudflare R2** (cheaper alternative)
```typescript
remotePatterns: [
  {
    protocol: 'https',
    hostname: 'your-account.r2.cloudflarestorage.com',
  },
];
```

### Step 5: Monitoring & Logging

**Frontend (Vercel)**
- Vercel Analytics auto-enabled
- Web Vitals dashboard
- Error tracking via Sentry (optional):
```bash
npm install @sentry/nextjs
```

**Backend (Railway/Fly.io)**
- Logs visible in dashboard
- Set up log drains to external service (Datadog, LogRocket)

**Database (Supabase/Railway)**
- Query performance monitoring built-in
- Backup automated daily

### Scaling Considerations

**Vertical Scaling**
- Vercel: Auto-scales (serverless)
- Railway: Upgrade machine size in dashboard
- Supabase: Increase row count, compute add-ons

**Horizontal Scaling**
- FastAPI: Use load balancer in front of multiple instances
- PostgreSQL: Connection pooling via PgBouncer (Supabase included)
- Frontend: Vercel handles automatically

**Performance Optimization**
- Enable Vercel Edge Caching
- Image optimization via Next.js Image component
- Vector search: HNSW index on `recipes.embedding`
- Rate limiting: Adjust per-IP quotas as needed

### Security Checklist

- [ ] HTTPS enforced (Vercel auto)
- [ ] ENCRYPTION_KEY stored securely (Vercel Secrets)
- [ ] Database password strong (40+ chars, no special chars causing connection string issues)
- [ ] Firewall: Database only accessible from app servers
- [ ] Backups: Daily automated (Supabase/Railway)
- [ ] Secrets: Never committed to git (use `.env.local`, `.gitignore`)
- [ ] API Key encryption verified: `ENCRYPTION_KEY` must be 32 bytes (64 hex chars)
- [ ] NextAuth secret rotated periodically
- [ ] CORS configured (FastAPI accepts requests only from Next.js)

### Troubleshooting Deployment

**Connection Error: "could not connect to server"**
- Check DATABASE_URL in environment variables
- Verify firewall allows app server IP
- Test connection locally: `psql $DATABASE_URL`

**Image Not Serving**
- Check UPLOAD_DIR permissions (must be writable)
- For S3/R2: Verify bucket public read policy
- Clear Vercel cache: Project Settings → Caches → Clear

**API Timeout**
- Check FastAPI logs: `railway logs` or Fly dashboard
- Increase timeout in Next.js route: `export const maxDuration = 60;`
- Scale FastAPI instances if load high

**Embedding Generation Slow**
- Check Gemini API quota (rate limits)
- Process embeddings in background (already implemented)
- Consider caching embeddings per recipe

---

## Architecture

### Frontend Stack
- **Framework:** Next.js 16 App Router (React 19)
- **Database Client:** Drizzle ORM (type-safe SQL)
- **Auth:** NextAuth.js v5 (JWT sessions, Credential provider)
- **API Communication:** TanStack React Query (caching, sync)
- **Styling:** Tailwind CSS v4 (utility-first)
- **State:** React Context + Query hooks (no Redux needed)

### Backend Stack
- **Framework:** FastAPI (async, automatic OpenAPI docs)
- **ORM:** SQLAlchemy 2.0 (async, Alembic migrations)
- **Database Driver:** asyncpg (fast, async PostgreSQL)
- **AI:** Google Gemini SDK (embeddings, OCR, generation)
- **Vector Search:** pgvector + HNSW (semantic search)
- **Rate Limiting:** slowapi

### Database Schema (9 Tables)
- **users** — Registration, roles, status (pending/approved/rejected)
- **recipes** — Recipe metadata, source type, nutrition
- **ingredients** — Recipe ingredients with units and amounts
- **images** — Recipe photos, source type (upload/ai_generated/ocr), embeddings
- **notes** — User notes on recipes (tips, variations, ratings)
- **shopping_list** — Shopping items, checked status, categories
- **meal_plans** — Weekly meal plan slots (breakfast, lunch, dinner, snack)
- **collections** — User-created cookbooks
- **api_keys** — Encrypted user API keys for AI services

### Data Flow Diagram

```
┌─────────────────────┐
│ User Interaction    │
│ (React Component)   │
└──────────┬──────────┘
           │ TanStack Query
           ▼
┌─────────────────────┐
│ Next.js API Route   │
│ - Zod validation    │
│ - Rate limiting     │
│ - Auth check        │
└──────────┬──────────┘
           │ SQL (Drizzle)
           ├──────────────────────────┐
           │                          │
           ▼                          ▼
┌──────────────────┐      ┌──────────────────────┐
│ PostgreSQL CRUD  │      │ FastAPI Proxy Route  │
│ (Direct DB ops)  │      │ - Decrypt API key    │
└──────────────────┘      │ - Forward headers    │
                          │ - Return response    │
                          └──────────┬───────────┘
                                     │ HTTP
                                     ▼
                          ┌──────────────────────┐
                          │ FastAPI Backend      │
                          │ - Embeddings (Gemini)│
                          │ - OCR (Gemini Pro)   │
                          │ - Suggestions        │
                          │ - Web search         │
                          └──────────┬───────────┘
                                     │ SQLAlchemy
                                     ▼
                          ┌──────────────────────┐
                          │ PostgreSQL (via      │
                          │ asyncpg driver)      │
                          │ - Vector search      │
                          │ - Embeddings storage │
                          └──────────────────────┘
```

---

## Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository
2. **Create a feature branch:** `git checkout -b feat/your-feature`
3. **Commit changes:** `git commit -am 'Add feature'`
4. **Push:** `git push origin feat/your-feature`
5. **Create Pull Request** with description

### Code Standards
- TypeScript strict mode enabled
- Prettier formatting (auto via ESLint)
- Tests required for features (Unit + E2E)
- German UI text (Swiss "ss" not "ß")
- Accessibility (WCAG 2.1 AA minimum)

### Development Workflow
- Always branch off `main`
- Keep commits atomic and descriptive
- Ensure all tests pass before PR
- Request review from maintainers
- Squash commits before merge (if requested)

---

## Troubleshooting

### Common Issues

**"Port 3001 already in use"**
```bash
# Find process on port 3001
lsof -i :3001
# Kill it
kill -9 <PID>
# Or use different port
npm run dev -- -p 3001
```

**"Database connection refused"**
```bash
# Check Docker is running
docker ps

# Check PostgreSQL container
docker compose logs db

# Verify connection string (host port is 5434, not 5432)
echo $DATABASE_URL
# Should be: postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister

# Test connection directly
psql postgresql://rezeptmeister:localdev@localhost:5434/rezeptmeister -c "SELECT 1"
```

**"NextAuth login fails"**
- Verify `NEXTAUTH_SECRET` is set (not empty)
- Check `NEXTAUTH_URL` matches current origin
- Clear cookies: DevTools → Application → Cookies → Delete
- Verify user status is `'approved'` in database:
```sql
SELECT id, email, status FROM users;
```

**"Embedding service returns 401"**
- Verify Gemini API key set in settings (`/einstellungen`)
- Check key isn't expired
- Try regenerating key in Google AI Studio

**"Images not showing"**
- Check `UPLOAD_DIR` exists and is writable
- Verify image thumbnails generated: `ls uploads/thumbnails/`
- For S3: Check bucket policy allows public read
- Clear browser cache (Cmd+Shift+R)

**"E2E tests timeout"**
- Ensure frontend running on port 3001: `npm run dev`
- Ensure backend running: `docker compose up -d`
- Increase timeout in `playwright.config.ts`:
```typescript
use: { timeout: 30000 }, // 30 seconds
```

**"Rate limiting blocks requests"**
- Check headers: `RateLimit-Remaining`, `RateLimit-Reset`
- Adjust limits in `frontend/src/lib/rate-limit.ts`
- For testing, disable rate limiting temporarily:
```typescript
const rateLimit = process.env.NODE_ENV === 'development' ? false : true;
```

### Getting Help

- **Documentation:** Check `CLAUDE.md` in repo
- **Issues:** GitHub Issues (detailed error logs appreciated)
- **Discussions:** GitHub Discussions for questions
- **Email:** Maintainers happy to help (see CLAUDE.md)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Roadmap

- [ ] Mobile app (React Native)
- [ ] Collaborative recipes (multi-user editing)
- [ ] Recipe versioning (track changes)
- [ ] Advanced nutrition tracking
- [ ] Grocery delivery integration
- [ ] Social sharing / recipe ratings
- [ ] Multi-language support (beyond German/Swiss)
- [ ] Voice-controlled cooking mode

---

## Acknowledgments

Built with:
- **Next.js & React** — Modern web framework
- **FastAPI** — Fast, async Python backend
- **PostgreSQL & pgvector** — Reliable database with vector search
- **Google Gemini** — AI embeddings and content generation
- **Tailwind CSS** — Beautiful, responsive styling
- **Playwright** — Comprehensive E2E testing

Special thanks to the Swiss recipe community for inspiration!

---

**Made with ❤️ for Swiss home cooks.**  
*Last Updated: 2026-04-06*
