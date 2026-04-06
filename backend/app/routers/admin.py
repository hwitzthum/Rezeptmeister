"""
Admin-Endpunkte fuer Rezeptmeister.
Re-Embedding pro Benutzer mit Background-Processing und Fortschrittsverfolgung.
"""

import asyncio
import logging
import uuid as uuid_mod
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.dependencies import require_internal_token
from app.models.recipe import Recipe
from app.services.embedding_service import embed_text

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
    dependencies=[Depends(require_internal_token)],
)

# ── In-Memory Job Store ──────────────────────────────────────────────────────

_jobs: dict[str, dict[str, Any]] = {}


def _schedule_job_cleanup(job_id: str, delay_seconds: int = 600) -> None:
    """Raeumt Job-Daten nach Ablauf der Frist auf."""
    loop = asyncio.get_running_loop()
    loop.call_later(delay_seconds, lambda: _jobs.pop(job_id, None))


# ── Schemas ──────────────────────────────────────────────────────────────────

class ReEmbedUserRequest(BaseModel):
    user_id: UUID


class ReEmbedStartResponse(BaseModel):
    job_id: str


class ReEmbedDetail(BaseModel):
    recipe_id: str
    title: str
    status: str  # "ok" | "error"
    error: Optional[str] = None


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # "running" | "done" | "error"
    total: int
    completed: int
    errors: int
    details: list[ReEmbedDetail]


# ── Background Task ─────────────────────────────────────────────────────────

def _build_embedding_text(recipe: Recipe) -> str:
    """Baut den Text fuer das Embedding aus den Rezeptfeldern zusammen."""
    parts = [recipe.title]
    if recipe.description:
        parts.append(recipe.description)
    if recipe.instructions:
        parts.append(recipe.instructions)
    if recipe.cuisine:
        parts.append(f"Kueche: {recipe.cuisine}")
    if recipe.category:
        parts.append(f"Kategorie: {recipe.category}")
    if recipe.tags:
        parts.append(f"Tags: {', '.join(recipe.tags)}")
    return "\n".join(parts)


async def _run_re_embed(job_id: str, user_id: UUID, api_key: str) -> None:
    """
    Berechnet Embeddings fuer alle Rezepte eines Benutzers.
    Schreibt alle erfolgreichen Embeddings in einer einzigen Transaktion (atomar).
    """
    try:
        # Rezepte des Benutzers laden
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Recipe).where(Recipe.user_id == user_id)
            )
            recipes = result.scalars().all()

        total = len(recipes)
        _jobs[job_id]["total"] = total

        if total == 0:
            _jobs[job_id]["status"] = "done"
            _schedule_job_cleanup(job_id)
            return

        # Embeddings sequenziell berechnen (Rate-Limit-Schutz)
        successful: list[tuple[UUID, list[float]]] = []
        details: list[ReEmbedDetail] = []

        for recipe in recipes:
            text = _build_embedding_text(recipe)
            try:
                embedding = await embed_text(text, api_key, is_query=False)
                successful.append((recipe.id, embedding))
                details.append(ReEmbedDetail(
                    recipe_id=str(recipe.id),
                    title=recipe.title,
                    status="ok",
                ))
                logger.info(
                    f"Embedding berechnet fuer Rezept '{recipe.title}' ({recipe.id})"
                )
            except Exception as e:
                details.append(ReEmbedDetail(
                    recipe_id=str(recipe.id),
                    title=recipe.title,
                    status="error",
                    error=str(e),
                ))
                logger.error(
                    f"Embedding-Fehler fuer Rezept '{recipe.title}' ({recipe.id}): {e}"
                )

            # Fortschritt aktualisieren
            completed_count = len([d for d in details if d.status == "ok"])
            error_count = len([d for d in details if d.status == "error"])
            _jobs[job_id].update({
                "completed": completed_count,
                "errors": error_count,
                "details": details.copy(),
            })

            # 100ms Pause zwischen Aufrufen fuer Rate-Limit-Schutz
            await asyncio.sleep(0.1)

        # Atomarer Commit: alle erfolgreichen Embeddings in einer Transaktion
        if successful:
            async with AsyncSessionLocal() as session:
                for recipe_id, embedding in successful:
                    await session.execute(
                        update(Recipe)
                        .where(Recipe.id == recipe_id)
                        .values(embedding=embedding)
                    )
                await session.commit()
            logger.info(
                f"Re-Embedding fuer Benutzer {user_id} abgeschlossen: "
                f"{len(successful)}/{total} in DB geschrieben."
            )

        _jobs[job_id]["status"] = "done"

    except Exception as e:
        logger.error(f"Re-Embedding-Job {job_id} fehlgeschlagen: {e}")
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["details"].append(ReEmbedDetail(
            recipe_id="",
            title="Job-Fehler",
            status="error",
            error=str(e),
        ))

    _schedule_job_cleanup(job_id)


# ── Endpunkte ────────────────────────────────────────────────────────────────

@router.post("/re-embed-user", response_model=ReEmbedStartResponse, status_code=202)
async def re_embed_user(
    body: ReEmbedUserRequest,
    x_gemini_api_key: Optional[str] = Header(None),
) -> ReEmbedStartResponse:
    """
    Startet Re-Embedding fuer alle Rezepte eines bestimmten Benutzers.
    Laeuft im Hintergrund; Fortschritt ueber GET /admin/re-embed-status/{job_id}.
    """
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="X-Gemini-API-Key Header fehlt.")

    job_id = str(uuid_mod.uuid4())
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "total": 0,
        "completed": 0,
        "errors": 0,
        "details": [],
    }

    asyncio.create_task(_run_re_embed(job_id, body.user_id, x_gemini_api_key))

    return ReEmbedStartResponse(job_id=job_id)


@router.get("/re-embed-status/{job_id}", response_model=JobStatusResponse)
async def re_embed_status(job_id: str) -> JobStatusResponse:
    """Gibt den aktuellen Fortschritt eines Re-Embedding-Jobs zurueck."""
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden.")
    return JobStatusResponse(**job)
