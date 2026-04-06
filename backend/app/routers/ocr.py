"""
OCR-Endpunkt für Rezeptmeister.
Empfängt image_id + user_id, validiert die Eigentumsrechte in der DB und
ruft den OCR-Service auf. Der API-Schlüssel kommt vom Next.js-Proxy als Header.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.image import Image
from app.services import _utils
from app.services.ocr_service import OcrResults, extract_recipes_from_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ocr", tags=["OCR"])


class OcrExtractRequest(BaseModel):
    image_id: UUID
    user_id: UUID


@router.post("/extract", response_model=OcrResults)
async def ocr_extract(
    body: OcrExtractRequest,
    x_gemini_api_key: str | None = Header(None),
) -> OcrResults:
    """
    Extrahiert strukturierte Rezeptdaten aus einem bereits hochgeladenen Bild.
    - image_id muss dem user_id gehören (wird in der DB geprüft).
    - API-Schlüssel wird als X-Gemini-API-Key Header übergeben.
    """
    if not x_gemini_api_key:
        raise HTTPException(
            status_code=400,
            detail="Kein KI-Schlüssel angegeben. Bitte Gemini API-Schlüssel in den Einstellungen hinterlegen.",
        )

    async with AsyncSessionLocal() as session:
        image = await session.get(Image, body.image_id)

    if not image:
        raise HTTPException(status_code=404, detail="Bild nicht gefunden.")

    if str(image.user_id) != str(body.user_id):
        raise HTTPException(status_code=403, detail="Nicht autorisiert.")

    try:
        image_path = await _utils.resolve_image_path(image.file_path, get_settings().upload_dir)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ungültiger Dateipfad.")
    except FileNotFoundError:
        raise HTTPException(
            status_code=422,
            detail="Bilddatei nicht gefunden. Das Bild wurde möglicherweise gelöscht.",
        )

    try:
        result = await extract_recipes_from_image(image_path, x_gemini_api_key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=422,
            detail="Bilddatei nicht gefunden. Das Bild wurde möglicherweise gelöscht.",
        )
    except Exception as e:
        logger.error(f"OCR-Fehler für Bild {body.image_id}: {type(e).__name__}")
        raise HTTPException(status_code=502, detail="KI-Dienst momentan nicht verfügbar.")
    return result
