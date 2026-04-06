"""
Gemeinsame Hilfsfunktionen für KI-Services.
"""

import mimetypes
import os
import tempfile

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
    """
    filename = os.path.basename(file_path)
    allowed_root = os.path.realpath(os.path.join(upload_dir, "originals"))
    resolved = os.path.realpath(os.path.join(allowed_root, filename))
    if not resolved.startswith(allowed_root + os.sep):
        raise ValueError(f"Ungültiger Dateipfad: {file_path!r}")
    return resolved


async def resolve_image_path(file_path: str, upload_dir: str) -> str:
    """
    Resolves a DB-stored file_path to an actual file on disk.
    1. Tries local filesystem first (for dev).
    2. If not found, downloads from Supabase Storage to a temp file.
    Raises FileNotFoundError if the image cannot be resolved.
    """
    local_path = safe_image_path(file_path, upload_dir)
    if os.path.exists(local_path):
        return local_path

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
    tmp.write(resp.content)
    tmp.close()
    return tmp.name


def get_gemini_client(api_key: str) -> genai.Client:
    """
    Gibt einen genai.Client für den gegebenen API-Key zurück.
    Kein process-weites Caching: BYOK-Schlüssel werden nicht als
    Klartext im Speicher gehalten.
    """
    return genai.Client(api_key=api_key)
