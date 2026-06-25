"""
Gemeinsame Hilfsfunktionen für KI-Services.
"""

import mimetypes
import os
import tempfile
from contextlib import asynccontextmanager
from typing import AsyncIterator

import httpx
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
    public_url = (
        f"{settings.supabase_url}/storage/v1/object/public/"
        f"{settings.supabase_storage_bucket}/originals/{filename}"
    )

    async with httpx.AsyncClient() as client:
        resp = await client.get(public_url, timeout=30.0)
        if resp.status_code != 200:
            raise FileNotFoundError(f"Image not found in Supabase Storage: {public_url}")

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
