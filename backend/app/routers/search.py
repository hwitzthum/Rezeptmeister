"""
Semantische Suche für Rezeptmeister.

POST /search/semantic  — reine Vektorsuche (text oder Cross-Modal mit Bild)
POST /search/hybrid    — Volltext + Vektor kombiniert via Reciprocal Rank Fusion (RRF, k=60)

Beide Endpunkte erhalten X-Gemini-API-Key aus dem Next.js-Proxy und user_id im Body.
Kein API-Key → 503. Keine Embeddings in DB → leere Liste (kein Fehler).
"""

import base64
import logging
import os
import tempfile
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import text

from app.database import AsyncSessionLocal
from app.services.embedding_service import embed_image, embed_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["Suche"])


# ── Schemas ────────────────────────────────────────────────────────────────────

class SemanticSearchRequest(BaseModel):
    query: str = ""
    limit: int = 10
    user_id: str
    image_base64: Optional[str] = None  # Cross-Modal: Base64-kodiertes Bild

    @field_validator("limit")
    @classmethod
    def clamp_limit(cls, v: int) -> int:
        return max(1, min(v, 50))

    @field_validator("image_base64")
    @classmethod
    def check_image_size(cls, v: Optional[str]) -> Optional[str]:
        # ~10 MB raw → ~13.4 MB base64
        if v is not None and len(v) > 14_000_000:
            raise ValueError("Bild zu gross (max. 10 MB).")
        return v


class HybridSearchRequest(BaseModel):
    query: str
    limit: int = 10
    user_id: str
    kategorie: Optional[str] = None
    kueche: Optional[str] = None
    schwierigkeit: Optional[str] = None

    @field_validator("query")
    @classmethod
    def require_query(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Suchanfrage darf nicht leer sein.")
        return v

    @field_validator("limit")
    @classmethod
    def clamp_limit(cls, v: int) -> int:
        return max(1, min(v, 50))


class RecipeSearchResult(BaseModel):
    id: str
    title: str
    description: Optional[str]
    category: Optional[str]
    cuisine: Optional[str]
    difficulty: Optional[str]
    prep_time_minutes: Optional[int]
    cook_time_minutes: Optional[int]
    total_time_minutes: Optional[int]
    servings: int
    is_favorite: bool
    thumbnail_url: Optional[str]
    score: float


# ── Helpers ────────────────────────────────────────────────────────────────────

def _vec_str(vector: list[float]) -> str:
    """Formatiert einen Float-Vektor für PostgreSQL: '[x,y,z]'."""
    return "[" + ",".join(str(x) for x in vector) + "]"


def _row_to_result(row) -> RecipeSearchResult:
    return RecipeSearchResult(
        id=str(row.id),
        title=row.title,
        description=row.description,
        category=row.category,
        cuisine=row.cuisine,
        difficulty=row.difficulty,
        prep_time_minutes=row.prep_time_minutes,
        cook_time_minutes=row.cook_time_minutes,
        total_time_minutes=row.total_time_minutes,
        servings=row.servings,
        is_favorite=row.is_favorite,
        thumbnail_url=row.thumbnail_path,
        score=float(row.score),
    )


# ── Endpunkte ──────────────────────────────────────────────────────────────────

@router.post("/semantic", response_model=list[RecipeSearchResult])
async def semantic_search(
    body: SemanticSearchRequest,
    x_gemini_api_key: Optional[str] = Header(None),
) -> list[RecipeSearchResult]:
    """
    Semantische Vektorsuche via cosine similarity (HNSW-Index via halfvec cast).
    Optionales image_base64 für Cross-Modal-Suche (Bild → ähnliche Rezepte).
    """
    if not x_gemini_api_key:
        raise HTTPException(503, detail="Kein API-Schlüssel hinterlegt.")

    if not body.query.strip() and not body.image_base64:
        raise HTTPException(400, detail="query oder image_base64 muss angegeben werden.")

    # Short-circuit: skip Gemini API call if user has no embedded recipes
    async with AsyncSessionLocal() as session:
        has_embeddings = await session.execute(
            text("SELECT 1 FROM recipes WHERE user_id = CAST(:uid AS uuid) AND embedding IS NOT NULL LIMIT 1"),
            {"uid": body.user_id},
        )
        if has_embeddings.fetchone() is None:
            return []

    try:
        if body.image_base64:
            image_bytes = base64.b64decode(body.image_base64)
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                tmp.write(image_bytes)
                tmp_path = tmp.name
            try:
                query_vector = await embed_image(tmp_path, x_gemini_api_key)
            finally:
                os.unlink(tmp_path)
        else:
            query_vector = await embed_text(body.query, x_gemini_api_key, is_query=True)
    except Exception as e:
        logger.error(f"Semantic-Query-Embedding-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(502, detail="Embedding-Berechnung fehlgeschlagen.")

    vec = _vec_str(query_vector)

    # HNSW-Vektorsuche – halfvec-Cast muss zur Indexdefinition passen.
    # :vec wird über eine qvec-CTE genau einmal materialisiert, damit asyncpg
    # keinen Fehler bei doppelt verwendeten Named-Parameters wirft.
    sql = text("""
        WITH qvec AS (
            SELECT (:vec)::halfvec(3072) AS v
        )
        SELECT
            r.id,
            r.title,
            r.description,
            r.category,
            r.cuisine,
            r.difficulty,
            r.prep_time_minutes,
            r.cook_time_minutes,
            r.total_time_minutes,
            r.servings,
            r.is_favorite,
            i.file_path                                                   AS thumbnail_path,
            1.0 - ((r.embedding::halfvec(3072)) <=> qvec.v)              AS score
        FROM recipes r
        CROSS JOIN qvec
        LEFT JOIN images i ON i.recipe_id = r.id AND i.is_primary = true
        WHERE r.user_id = CAST(:uid AS uuid)
          AND r.embedding IS NOT NULL
        ORDER BY (r.embedding::halfvec(3072)) <=> qvec.v
        LIMIT :lim
    """)

    async with AsyncSessionLocal() as session:
        result = await session.execute(sql, {"vec": vec, "uid": body.user_id, "lim": body.limit})
        rows = result.fetchall()

    return [_row_to_result(row) for row in rows]


@router.post("/hybrid", response_model=list[RecipeSearchResult])
async def hybrid_search(
    body: HybridSearchRequest,
    x_gemini_api_key: Optional[str] = Header(None),
) -> list[RecipeSearchResult]:
    """
    Hybridsuche: Volltext (PostgreSQL FTS tsvector) + Vektor (cosine similarity)
    kombiniert via Reciprocal Rank Fusion (RRF, k=60).

    RRF-Score pro Rezept = 1/(60+vrank) + 1/(60+frank)
    Rezepte, die nur in einer der beiden Listen vorkommen, erhalten 0 für die fehlende.
    """
    if not x_gemini_api_key:
        raise HTTPException(503, detail="Kein API-Schlüssel hinterlegt.")

    # Short-circuit: skip Gemini API call if user has no embedded recipes
    async with AsyncSessionLocal() as session:
        has_embeddings = await session.execute(
            text("SELECT 1 FROM recipes WHERE user_id = CAST(:uid AS uuid) AND embedding IS NOT NULL LIMIT 1"),
            {"uid": body.user_id},
        )
        if has_embeddings.fetchone() is None:
            return []

    try:
        query_vector = await embed_text(body.query, x_gemini_api_key, is_query=True)
    except Exception as e:
        logger.error(f"Hybrid-Query-Embedding-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(502, detail="Embedding-Berechnung fehlgeschlagen.")

    vec = _vec_str(query_vector)

    # :vec wird über eine qvec-CTE einmal materialisiert – verhindert asyncpg-Fehler
    # bei doppelt verwendeten Named-Parameters in vector_ranked und ORDER BY.
    sql = text("""
        WITH qvec AS (
            SELECT (:vec)::halfvec(3072) AS v
        ),
        vector_ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    ORDER BY (embedding::halfvec(3072)) <=> (SELECT v FROM qvec)
                ) AS vrank
            FROM recipes
            WHERE user_id = CAST(:uid AS uuid)
              AND embedding IS NOT NULL
            LIMIT 60
        ),
        fts_ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    ORDER BY ts_rank(fts_vector, websearch_to_tsquery('german', :query)) DESC
                ) AS frank
            FROM recipes
            WHERE user_id = CAST(:uid AS uuid)
              AND fts_vector @@ websearch_to_tsquery('german', :query)
            LIMIT 60
        ),
        combined AS (
            SELECT
                COALESCE(v.id, f.id)                                         AS recipe_id,
                COALESCE(1.0 / (60.0 + v.vrank), 0.0)
                    + COALESCE(1.0 / (60.0 + f.frank), 0.0)                  AS rrf_score
            FROM vector_ranked v
            FULL OUTER JOIN fts_ranked f ON v.id = f.id
        )
        SELECT
            r.id,
            r.title,
            r.description,
            r.category,
            r.cuisine,
            r.difficulty,
            r.prep_time_minutes,
            r.cook_time_minutes,
            r.total_time_minutes,
            r.servings,
            r.is_favorite,
            img.file_path   AS thumbnail_path,
            c.rrf_score     AS score
        FROM combined c
        JOIN recipes r ON c.recipe_id = r.id
        LEFT JOIN images img ON img.recipe_id = r.id AND img.is_primary = true
        ORDER BY c.rrf_score DESC
        LIMIT :lim
    """)

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            sql,
            {
                "vec": vec,
                "query": body.query,
                "uid": body.user_id,
                "lim": body.limit,
            },
        )
        rows = result.fetchall()

    return [_row_to_result(row) for row in rows]
