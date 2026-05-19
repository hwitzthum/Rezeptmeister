"""
Web-Suche-Endpunkt für Rezeptmeister.
POST /search/web  – Sucht Schweizer Rezepte via Gemini Google Search-Tool.

Hinweis: Gemini unterstützt response_mime_type='application/json' NICHT zusammen
mit Tools. Daher wird die Antwort aus der Grounding-Metadata extrahiert.
"""

import logging
import re
from urllib.parse import urlparse

from fastapi import APIRouter, Header, HTTPException
from google.genai import types
from pydantic import BaseModel, field_validator

from app.config import get_settings
from app.services._utils import get_gemini_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["WebSearch"])
settings = get_settings()


class WebSearchRequest(BaseModel):
    query: str

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Suchanfrage darf nicht leer sein.")
        if len(v) > 200:
            raise ValueError("Suchanfrage darf maximal 200 Zeichen lang sein.")
        return v


class WebSearchResult(BaseModel):
    title: str
    url: str
    description: str
    source_domain: str = ""


class WebSearchResponse(BaseModel):
    results: list[WebSearchResult]


@router.post("/web")
async def search_web(
    body: WebSearchRequest,
    x_gemini_api_key: str | None = Header(None),
):
    """
    Sucht Schweizer Rezepte via Gemini Google Search.
    Extrahiert Ergebnisse aus Grounding-Metadata.
    """
    if not x_gemini_api_key:
        raise HTTPException(status_code=503, detail="Kein API-Schlüssel hinterlegt.")

    client = get_gemini_client(x_gemini_api_key)
    prompt = (
        f"Suche nach Schweizer Rezepten für: {body.query}. "
        "Nenne 5 konkrete Rezepte mit Titel und Quelle."
    )

    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_flash_model,
            contents=prompt,
            # NOTE: response_mime_type und response_schema sind mit Tools inkompatibel.
            # Ergebnisse werden aus grounding_metadata extrahiert.
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
    except Exception as e:
        logger.error(f"Web-Suche-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="Web-Suche momentan nicht verfügbar.")

    def _safe_web_url(url: str) -> str | None:
        """Validates that a URL from search results uses http/https only.
        Rejects javascript:, data:, and other dangerous schemes to prevent
        XSS via open-redirect or rendered anchor tags in the frontend."""
        try:
            parsed = urlparse(url)
            if parsed.scheme not in ("http", "https"):
                return None
            if not parsed.netloc:
                return None
            return url
        except Exception:
            return None

    results: list[WebSearchResult] = []

    # Ergebnisse aus Grounding-Metadata extrahieren
    try:
        candidate = response.candidates[0]
        meta = getattr(candidate, "grounding_metadata", None)
        if meta:
            chunks = getattr(meta, "grounding_chunks", []) or []
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if web and getattr(web, "uri", None):
                    raw_url = web.uri
                    safe_url = _safe_web_url(raw_url)
                    if not safe_url:
                        logger.warning(f"Unsichere URL aus Grounding-Metadata verworfen: {raw_url!r}")
                        continue
                    title = getattr(web, "title", "") or safe_url
                    domain = ""
                    try:
                        domain = urlparse(safe_url).netloc
                    except Exception:
                        pass
                    results.append(WebSearchResult(
                        title=title,
                        url=safe_url,
                        description="",
                        source_domain=domain,
                    ))
    except Exception as e:
        logger.warning(f"Grounding-Metadata-Extraktion fehlgeschlagen: {e}")

    # Fallback: Antworttext nach https-URLs durchsuchen (http only via regex already)
    if not results:
        try:
            text = response.text or ""
            urls = re.findall(r'https://[^\s\)\]"]+', text)
            for raw_url in urls[:5]:
                safe_url = _safe_web_url(raw_url)
                if not safe_url:
                    continue
                domain = ""
                try:
                    domain = urlparse(safe_url).netloc
                except Exception:
                    pass
                results.append(WebSearchResult(
                    title=domain,
                    url=safe_url,
                    description="",
                    source_domain=domain,
                ))
        except Exception as e:
            logger.warning(f"URL-Extraktion aus Text fehlgeschlagen: {e}")

    if not results:
        raise HTTPException(status_code=502, detail="Keine Suchergebnisse gefunden.")

    return WebSearchResponse(results=results[:5])
