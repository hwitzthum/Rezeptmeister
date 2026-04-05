"""
Gemeinsame Hilfsfunktionen für KI-Services.
"""

import mimetypes
import os

from google import genai


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


def get_gemini_client(api_key: str) -> genai.Client:
    """
    Gibt einen genai.Client für den gegebenen API-Key zurück.
    Kein process-weites Caching: BYOK-Schlüssel werden nicht als
    Klartext im Speicher gehalten.
    """
    return genai.Client(api_key=api_key)
