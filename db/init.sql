-- Rezeptmeister – Initiales Datenbankschema
-- PostgreSQL 16 + pgvector

-- pgvector Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Enum-Typen
CREATE TYPE user_role AS ENUM ('admin', 'user');
CREATE TYPE user_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE recipe_difficulty AS ENUM ('einfach', 'mittel', 'anspruchsvoll');
CREATE TYPE recipe_source_type AS ENUM ('manual', 'image_ocr', 'url_import', 'ai_generated', 'web_search');
CREATE TYPE image_source_type AS ENUM ('upload', 'ai_generated', 'web_import');
CREATE TYPE note_type AS ENUM ('tipp', 'variation', 'erinnerung', 'bewertung', 'allgemein');
CREATE TYPE meal_type AS ENUM ('fruehstueck', 'mittagessen', 'abendessen', 'snack');

-- -------------------------------------------------------
-- users
-- -------------------------------------------------------
CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email             VARCHAR(255) UNIQUE NOT NULL,
    name              VARCHAR(255),
    password_hash     TEXT,
    role              user_role NOT NULL DEFAULT 'user',
    status            user_status NOT NULL DEFAULT 'pending',
    api_key_encrypted TEXT,
    api_provider      VARCHAR(50),
    preferred_servings INTEGER DEFAULT 4,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- images (vor recipes wegen FK)
-- -------------------------------------------------------
CREATE TABLE images (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id        UUID,  -- FK wird nach recipes gesetzt
    file_path        TEXT NOT NULL,
    file_name        VARCHAR(255),
    mime_type        VARCHAR(50) NOT NULL,
    file_size_bytes  BIGINT,
    width            INTEGER,
    height           INTEGER,
    source_type      image_source_type NOT NULL DEFAULT 'upload',
    alt_text         TEXT,
    extracted_text   TEXT,
    embedding        VECTOR(3072),
    is_primary       BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- recipes
-- -------------------------------------------------------
CREATE TABLE recipes (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title             VARCHAR(500) NOT NULL,
    description       TEXT,
    instructions      TEXT NOT NULL,
    servings          INTEGER NOT NULL,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    total_time_minutes INTEGER,
    difficulty        recipe_difficulty,
    source_type       recipe_source_type NOT NULL DEFAULT 'manual',
    source_url        TEXT,
    source_image_id   UUID REFERENCES images(id) ON DELETE SET NULL,
    cuisine           VARCHAR(100),
    category          VARCHAR(100),
    tags              TEXT[] DEFAULT '{}',
    is_favorite       BOOLEAN NOT NULL DEFAULT false,
    embedding         VECTOR(3072),
    nutrition_info    JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jetzt recipe_id FK in images setzen
ALTER TABLE images
    ADD CONSTRAINT images_recipe_id_fkey
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- ingredients
-- -------------------------------------------------------
CREATE TABLE ingredients (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    amount      DECIMAL(10,3),
    unit        VARCHAR(50),
    group_name  VARCHAR(255),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_optional BOOLEAN NOT NULL DEFAULT false
);

-- -------------------------------------------------------
-- recipe_notes
-- -------------------------------------------------------
CREATE TABLE recipe_notes (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id  UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    note_type  note_type NOT NULL DEFAULT 'allgemein',
    rating     INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- shopping_list_items
-- -------------------------------------------------------
CREATE TABLE shopping_list_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id       UUID REFERENCES recipes(id) ON DELETE SET NULL,
    ingredient_name VARCHAR(255) NOT NULL,
    amount          DECIMAL(10,3),
    unit            VARCHAR(50),
    is_checked      BOOLEAN NOT NULL DEFAULT false,
    aisle_category  VARCHAR(100),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- meal_plans
-- -------------------------------------------------------
CREATE TABLE meal_plans (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date             DATE NOT NULL,
    meal_type        meal_type NOT NULL,
    recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    servings_override INTEGER,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- collections
-- -------------------------------------------------------
CREATE TABLE collections (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    cover_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- collection_recipes (Verknüpfungstabelle)
-- -------------------------------------------------------
CREATE TABLE collection_recipes (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    recipe_id     UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collection_id, recipe_id)
);

-- -------------------------------------------------------
-- Indizes
-- -------------------------------------------------------

-- Vektor-Indizes (halfvec-Cast umgeht das HNSW-Limit von 2000 Dimensionen)
CREATE INDEX idx_recipes_embedding_hnsw ON recipes USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX idx_images_embedding_hnsw  ON images  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);

-- B-Tree Indizes
CREATE INDEX idx_recipes_user_id    ON recipes (user_id);
CREATE INDEX idx_recipes_category   ON recipes (category);
CREATE INDEX idx_recipes_is_favorite ON recipes (user_id, is_favorite);
CREATE INDEX idx_ingredients_recipe_id ON ingredients (recipe_id);
CREATE INDEX idx_ingredients_name_lower ON ingredients (LOWER(TRIM(name)));
CREATE INDEX idx_images_recipe_id   ON images (recipe_id);
CREATE INDEX idx_images_user_id     ON images (user_id);
CREATE INDEX idx_recipe_notes_recipe_user ON recipe_notes (recipe_id, user_id);
CREATE INDEX idx_meal_plans_user_date ON meal_plans (user_id, date);
CREATE INDEX idx_shopping_list_user_checked ON shopping_list_items (user_id, is_checked);
CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_status ON users (status);

-- GIN-Index für Tags-Array
CREATE INDEX idx_recipes_tags ON recipes USING GIN (tags);

-- Volltext-Index (Deutsch)
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS fts_vector TSVECTOR
    GENERATED ALWAYS AS (
        setweight(to_tsvector('german', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('german', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('german', coalesce(instructions, '')), 'C')
    ) STORED;

CREATE INDEX idx_recipes_fts ON recipes USING GIN (fts_vector);

-- -------------------------------------------------------
-- updated_at Trigger
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_recipe_notes_updated_at
    BEFORE UPDATE ON recipe_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
