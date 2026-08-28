"""
OCR-Endpunkt für Rezeptmeister.
Empfängt image_ids + user_id, validiert die Eigentumsrechte in der DB und
ruft den OCR-Service auf. Der API-Schlüssel kommt vom Next.js-Proxy als Header.

Mehrere Bilder gelten als aufeinanderfolgende Seiten EINES Rezepts und werden
zu genau einem Rezept zusammengeführt.
"""

import logging
from contextlib import AsyncExitStack
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.image import Image
from app.services import _utils
from app.services.ocr_service import OcrResults, extract_recipes_from_images

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr", tags=["OCR"])

MAX_OCR_PAGES = 10


class OcrExtractRequest(BaseModel):
    user_id: UUID
    # image_id bleibt für Bestandscode (Galerie-Weg) zulässig.
    image_id: UUID | None = None
    image_ids: list[UUID] | None = None

    @property
    def pages(self) -> list[UUID]:
        """Seiten in Reihenfolge — image_ids hat Vorrang vor image_id."""
        if self.image_ids:
            return self.image_ids
        return [self.image_id] if self.image_id else []

    @model_validator(mode="after")
    def check_pages(self) -> "OcrExtractRequest":
        count = len(self.pages)
        if count == 0:
            raise ValueError("Kein Bild angegeben. Bitte mindestens ein Bild übermitteln.")
        if count > MAX_OCR_PAGES:
            raise ValueError(
                f"Zu viele Seiten: maximal {MAX_OCR_PAGES} Bilder pro Rezept."
            )
        return self


@router.post("/extract", response_model=OcrResults)
async def ocr_extract(
    body: OcrExtractRequest,
    x_gemini_api_key: str | None = Header(None),
) -> OcrResults:
    """
    Extrahiert strukturierte Rezeptdaten aus bereits hochgeladenen Bildern.
    - Jedes Bild muss dem user_id gehören (wird in der DB geprüft).
    - Mehrere Bilder = aufeinanderfolgende Seiten eines Rezepts, Reihenfolge
      der Liste = Seitenreihenfolge.
    - API-Schlüssel wird als X-Gemini-API-Key Header übergeben.
    """
    if not x_gemini_api_key:
        raise HTTPException(
            status_code=400,
            detail="Kein KI-Schlüssel angegeben. Bitte Gemini API-Schlüssel in den Einstellungen hinterlegen.",
        )

    page_ids = body.pages

    async with AsyncSessionLocal() as session:
        rows = await session.execute(select(Image).where(Image.id.in_(page_ids)))
        by_id = {str(image.id): image for image in rows.scalars()}

    # Reihenfolge der Anfrage beibehalten und jede Seite einzeln prüfen.
    images: list[Image] = []
    for page_id in page_ids:
        image = by_id.get(str(page_id))
        if not image:
            raise HTTPException(status_code=404, detail="Bild nicht gefunden.")
        if str(image.user_id) != str(body.user_id):
            raise HTTPException(status_code=403, detail="Nicht autorisiert.")
        images.append(image)

    upload_dir = get_settings().upload_dir

    try:
        # AsyncExitStack hält alle Seitenpfade gleichzeitig offen und gibt
        # temporär materialisierte Dateien (Supabase-Download) danach wieder frei.
        async with AsyncExitStack() as stack:
            image_paths = [
                await stack.enter_async_context(
                    _utils.resolved_image_path(image.file_path, upload_dir)
                )
                for image in images
            ]
            result = await extract_recipes_from_images(image_paths, x_gemini_api_key)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ungültiger Dateipfad.")
    except FileNotFoundError:
        raise HTTPException(
            status_code=422,
            detail="Bilddatei nicht gefunden. Das Bild wurde möglicherweise gelöscht.",
        )
    except httpx.HTTPError as e:
        logger.error(
            f"Bildabruf fehlgeschlagen für {len(images)} Bild(er): {type(e).__name__}"
        )
        raise HTTPException(status_code=502, detail="Bild konnte nicht geladen werden.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR-Fehler für {len(images)} Bild(er): {type(e).__name__}")
        raise HTTPException(status_code=502, detail="KI-Dienst momentan nicht verfügbar.")
    return result
