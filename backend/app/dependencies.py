"""
Gemeinsame FastAPI-Dependencies fuer Rezeptmeister.
"""

from fastapi import Header, HTTPException

from app.config import get_settings


async def require_internal_token(
    x_internal_token: str | None = Header(None),
) -> None:
    """
    Fail-closed Authentifizierung fuer interne Endpunkte.
    Gibt 503 zurueck wenn INTERNAL_SECRET nicht konfiguriert ist,
    401 wenn der Token fehlt oder falsch ist.
    """
    secret = get_settings().internal_secret
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Admin-Endpunkt nicht konfiguriert (INTERNAL_SECRET fehlt).",
        )
    if x_internal_token != secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
