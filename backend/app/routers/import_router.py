"""
URL-Import-Endpunkt für Rezeptmeister.
POST /import/url  – Fetcht eine Rezept-URL, extrahiert strukturierte Daten und gibt OcrResult zurück.
"""

import logging

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.services.url_import_service import fetch_and_parse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Import"])
settings = get_settings()


class ImportUrlRequest(BaseModel):
    url: str


@router.post("/url")
async def import_url(
    body: ImportUrlRequest,
    x_gemini_api_key: str | None = Header(None),
):
    """
    Importiert ein Rezept von einer externen URL.
    Versucht zunächst JSON-LD-Parsing; Fallback auf Gemini-Textextraktion.
    """
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="Kein KI-Schlüssel angegeben.")
    if not (body.url.startswith("https://") or body.url.startswith("http://")):
        raise HTTPException(status_code=400, detail="Ungültige URL.")

    try:
        result = await fetch_and_parse(body.url, x_gemini_api_key, settings.gemini_flash_model)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"URL-Import-Fehler für {body.url!r}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="Import fehlgeschlagen.")
