"""
Bild-Embedding Endpunkt – Phase 4 Stub.
Die eigentliche Gemini-Einbettung folgt in Phase 6.

Sicherheitshinweis: Nur image_id wird entgegengenommen.
Der Backend-Dienst leitet den Dateipfad aus seiner eigenen UPLOAD_DIR-Umgebungsvariable ab,
um Client-seitige Path-Traversal-Angriffe zu verhindern.
"""

import os
from fastapi import APIRouter
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(prefix="/embed", tags=["Embeddings"])

settings = get_settings()


class ImageEmbedRequest(BaseModel):
    image_id: str


@router.post("/image", status_code=204)
async def embed_image(body: ImageEmbedRequest):
    """
    Empfängt Bild-Upload-Benachrichtigung von Next.js (fire-and-forget).
    Phase 4: Stub – gibt 204 zurück ohne Aktion.
    Phase 6: Gemini-Multimodal-Embedding wird hier eingefügt.
    """
    # Backend leitet Pfad aus eigenem UPLOAD_DIR ab – nicht vom Client
    upload_dir = settings.upload_dir
    # In Phase 6: Dateinamen aus DB laden, Embedding berechnen und speichern
    # image_path = os.path.join(upload_dir, "originals", f"{body.image_id}.*")
    # embedding = await gemini_service.embed_image(image_path)
    # ...

    _ = upload_dir  # used in Phase 6

    # TODO Phase 6: Gemini-Embedding berechnen und in images.embedding speichern
    return  # 204 No Content
