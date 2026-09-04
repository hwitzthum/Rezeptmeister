"""
Gemeinsame Hilfsfunktionen für KI-Services.
"""

import mimetypes
import os
import tempfile
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
from fastapi import HTTPException
from google import genai

from app.config import get_settings


def detect_mime(image_path: str) -> str:
    """Bestimmt den MIME-Typ anhand der Dateiendung."""
    mime, _ = mimetypes.guess_type(image_path)
    return mime or "image/jpeg"


def safe_image_path(file_path: str, upload_dir: str) -> str:
    """
    Leitet den absoluten Dateisystempfad aus einem DB-gespeicherten file_path ab
    und stellt sicher, dass er innerhalb von upload_dir/originals bleibt.
    Wirft ValueError bei Path-Traversal-Versuchen.

    Security notes:
    - os.path.basename strips any directory components from file_path, preventing
      directory traversal (e.g. "../../etc/passwd" → "passwd").
    - os.path.realpath resolves symlinks so a symlink pointing outside the root
      is detected and rejected.
    - The startswith check uses os.sep as a separator to prevent false positives
      where allowed_root is a prefix of a sibling directory name (e.g.
      /uploads/originals vs /uploads/originals2).
    """
    filename = os.path.basename(file_path)
    if not filename or filename in (".", ".."):
        raise ValueError(f"Ungültiger Dateiname: {file_path!r}")
    allowed_root = os.path.realpath(os.path.join(upload_dir, "originals"))
    resolved = os.path.realpath(os.path.join(allowed_root, filename))
    # Ensure resolved path is strictly inside allowed_root (not equal to it)
    if not resolved.startswith(allowed_root + os.sep):
        raise ValueError(f"Ungültiger Dateipfad (Path-Traversal erkannt): {file_path!r}")
    return resolved


@asynccontextmanager
async def resolved_image_path(file_path: str, upload_dir: str) -> AsyncIterator[str]:
    """
    Async context manager that yields an on-disk path to the image.

    1. Tries the local filesystem first (for dev) and yields it unchanged.
    2. If not found, downloads from Supabase Storage to a temp file, yields
       that path, and deletes the temp file on exit.

    Local files are never deleted — only the temp files this function creates.
    Raises FileNotFoundError if the image cannot be resolved.
    """
    local_path = safe_image_path(file_path, upload_dir)
    if os.path.exists(local_path):
        yield local_path
        return

    # Download from Supabase Storage
    settings = get_settings()
    if not settings.supabase_url:
        raise FileNotFoundError(f"Image not on disk and SUPABASE_URL not set: {file_path}")

    filename = os.path.basename(file_path)
    # Use the authenticated Storage REST API object endpoint (Bearer service-role
    # key) — the SAME auth pattern already used for uploads in
    # app/routers/ai.py — rather than the unauthenticated "/object/public/"
    # path. The Next.js side deliberately serves images through 1-hour
    # signed URLs scoped to the owning user (see
    # frontend/src/app/api/uploads/[...path]/route.ts), which only provides
    # real confidentiality if the underlying bucket is private. Fetching via
    # the public-object URL here only succeeds against a *public* bucket —
    # which would let anyone who learns an object path (e.g. from a signed
    # URL visible in their own browser's network tab, a referrer header, or
    # a cache) fetch the image forever, unauthenticated, completely
    # bypassing the ownership check and the 1-hour expiry the signed-URL
    # design relies on. The authenticated endpoint works identically against
    # a private bucket and never depends on the bucket's public-read ACL.
    object_url = (
        f"{settings.supabase_url}/storage/v1/object/"
        f"{settings.supabase_storage_bucket}/originals/{filename}"
    )
    headers = {"Authorization": f"Bearer {settings.supabase_service_role_key}"}

    async with httpx.AsyncClient() as client:
        resp = await client.get(object_url, headers=headers, timeout=30.0)
        if resp.status_code != 200:
            raise FileNotFoundError(f"Image not found in Supabase Storage: {object_url}")

    ext = os.path.splitext(filename)[1] or ".jpg"
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        tmp.write(resp.content)
        tmp.close()
        yield tmp.name
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def get_gemini_client(api_key: str) -> genai.Client:
    """
    Gibt einen genai.Client für den gegebenen API-Key zurück.
    Kein process-weites Caching: BYOK-Schlüssel werden nicht als
    Klartext im Speicher gehalten.
    """
    return genai.Client(api_key=api_key)


def map_gemini_error(exc: Exception, fallback: str = "KI-Dienst momentan nicht verfügbar.") -> HTTPException:
    """
    Übersetzt Gemini-Fehler in HTTP-Antworten, die der Nutzerin etwas sagen.

    Bisher wurde alles auf 502 «nicht verfügbar» abgebildet — ein erschöpftes
    Kontingent und ein ungültiger Schlüssel sahen gleich aus. Das `detail`-
    Objekt mit `message` reicht der Next.js-Proxy als kuratierte Meldung durch;
    rohe Fehlertexte bleiben im Log.
    """
    from google.genai import errors as genai_errors

    if isinstance(exc, genai_errors.ClientError):
        code = getattr(exc, "code", None)
        if code == 429:
            return HTTPException(
                status_code=429,
                detail={"code": "quota", "message": "Kontingent des KI-Schlüssels erschöpft — bitte später erneut versuchen."},
            )
        if code in (400, 401, 403):
            return HTTPException(
                status_code=400,
                detail={"code": "invalid_key", "message": "KI-Schlüssel ungültig oder ohne Berechtigung — bitte in den Einstellungen prüfen."},
            )
    return HTTPException(status_code=502, detail=fallback)
