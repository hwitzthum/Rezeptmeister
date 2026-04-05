"""
Embedding-Endpunkte für Rezeptmeister.
Alle Endpunkte sind fire-and-forget (204 No Content) und akzeptieren
X-Gemini-API-Key als Header. Fehlendes API-Key → stilles Überspringen (204).
Fehler in Background Tasks werden geloggt, nie nach oben propagiert.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Header
from pydantic import BaseModel
from sqlalchemy import update

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.image import Image
from app.models.recipe import Recipe
from app.services import _utils
from app.services.embedding_service import embed_image, embed_multimodal, embed_text

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/embed", tags=["Embeddings"])


# ── Request-Schemas ────────────────────────────────────────────────────────────

class TextEmbedRequest(BaseModel):
    recipe_id: UUID
    text: str


class ImageEmbedRequest(BaseModel):
    image_id: UUID


class MultimodalEmbedRequest(BaseModel):
    recipe_id: UUID
    text: str
    image_id: Optional[UUID] = None


# ── Background Tasks ───────────────────────────────────────────────────────────

async def _bg_embed_text(recipe_id: UUID, text: str, api_key: str) -> None:
    """Berechnet Text-Embedding und speichert es in recipes.embedding."""
    try:
        embedding = await embed_text(text, api_key, is_query=False)
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Recipe)
                .where(Recipe.id == recipe_id)
                .values(embedding=embedding)
            )
            await session.commit()
        logger.info(f"Text-Embedding für Rezept {recipe_id} gespeichert.")
    except Exception as e:
        logger.error(f"Text-Embedding-Fehler für Rezept {recipe_id}: {type(e).__name__}")


async def _bg_embed_image(image_id: UUID, api_key: str) -> None:
    """
    Lädt Bilddatei aus UPLOAD_DIR und speichert Embedding in images.embedding.
    DB session is closed before the Gemini call to avoid holding a connection
    across network I/O.
    """
    try:
        async with AsyncSessionLocal() as session:
            image = await session.get(Image, image_id)
            if not image:
                logger.warning(f"Bild {image_id} nicht in DB gefunden – Embedding übersprungen.")
                return
            file_path = image.file_path

        upload_dir = get_settings().upload_dir
        image_path = _utils.safe_image_path(file_path, upload_dir)
        embedding = await embed_image(image_path, api_key)

        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Image)
                .where(Image.id == image_id)
                .values(embedding=embedding)
            )
            await session.commit()
        logger.info(f"Bild-Embedding für Bild {image_id} gespeichert.")
    except ValueError as e:
        logger.error(f"Pfad-Traversal-Versuch für Bild {image_id}: {e}")
    except Exception as e:
        logger.error(f"Bild-Embedding-Fehler für Bild {image_id}: {type(e).__name__}")


async def _bg_embed_multimodal(
    recipe_id: UUID, text: str, image_id: UUID, api_key: str
) -> None:
    """
    Berechnet kombiniertes Text+Bild-Embedding und speichert es im Rezept.
    DB session is closed before the Gemini call to avoid holding a connection
    across network I/O.
    """
    try:
        file_path: str | None = None
        async with AsyncSessionLocal() as session:
            image = await session.get(Image, image_id)
            if image:
                file_path = image.file_path
            else:
                logger.warning(f"Bild {image_id} nicht gefunden – Fallback auf Text-only-Embedding.")

        if file_path is None:
            await _bg_embed_text(recipe_id, text, api_key)
            return

        upload_dir = get_settings().upload_dir
        image_path = _utils.safe_image_path(file_path, upload_dir)
        embedding = await embed_multimodal(text, image_path, api_key)

        async with AsyncSessionLocal() as session:
            await session.execute(
                update(Recipe)
                .where(Recipe.id == recipe_id)
                .values(embedding=embedding)
            )
            await session.commit()
        logger.info(f"Multimodales Embedding für Rezept {recipe_id} gespeichert.")
    except ValueError as e:
        logger.error(f"Pfad-Traversal-Versuch für Rezept {recipe_id}: {e}")
    except Exception as e:
        logger.error(f"Multimodales Embedding-Fehler für Rezept {recipe_id}: {type(e).__name__}")


# ── Endpunkte ──────────────────────────────────────────────────────────────────

@router.post("/text", status_code=204)
async def embed_text_endpoint(
    body: TextEmbedRequest,
    background_tasks: BackgroundTasks,
    x_gemini_api_key: Optional[str] = Header(None),
) -> None:
    """
    Fire-and-forget Text-Embedding für ein Rezept.
    Kein API-Key → 204 ohne Aktion (Rezept bleibt ohne Embedding).
    """
    if not x_gemini_api_key:
        return
    background_tasks.add_task(_bg_embed_text, body.recipe_id, body.text, x_gemini_api_key)


@router.post("/image", status_code=204)
async def embed_image_endpoint(
    body: ImageEmbedRequest,
    background_tasks: BackgroundTasks,
    x_gemini_api_key: Optional[str] = Header(None),
) -> None:
    """Fire-and-forget Bild-Embedding via gemini-embedding-2-preview."""
    if not x_gemini_api_key:
        return
    background_tasks.add_task(_bg_embed_image, body.image_id, x_gemini_api_key)


@router.post("/multimodal", status_code=204)
async def embed_multimodal_endpoint(
    body: MultimodalEmbedRequest,
    background_tasks: BackgroundTasks,
    x_gemini_api_key: Optional[str] = Header(None),
) -> None:
    """
    Fire-and-forget kombiniertes Text+Bild-Embedding.
    Falls image_id fehlt, wird Text-only-Embedding berechnet.
    """
    if not x_gemini_api_key:
        return
    if body.image_id:
        background_tasks.add_task(
            _bg_embed_multimodal, body.recipe_id, body.text, body.image_id, x_gemini_api_key
        )
    else:
        background_tasks.add_task(_bg_embed_text, body.recipe_id, body.text, x_gemini_api_key)
