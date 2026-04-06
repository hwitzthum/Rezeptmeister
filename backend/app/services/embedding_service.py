"""
Embedding-Service für Rezeptmeister.
Verwendet gemini-embedding-2-preview für Text, Bild und multimodale Embeddings
in einem einheitlichen semantischen Raum (erforderlich für Phase 7 Cross-Modal-Suche).

task_type wird von diesem Modell nicht unterstützt – stattdessen Inhaltspräfixe:
  - Dokument (Indexierung): "search_document: {text}"
  - Anfrage (Suche):        "search_query: {text}"
"""

import logging

from google.genai import types

from app.config import get_settings
from app.services import _utils

logger = logging.getLogger(__name__)


async def embed_text(text: str, api_key: str, is_query: bool = False) -> list[float]:
    """
    Erstellt ein Text-Embedding.
    is_query=True für Suchanfragen, is_query=False für zu indexierende Dokumente.
    """
    model = get_settings().gemini_embedding_model
    prefix = "search_query: " if is_query else "search_document: "
    client = _utils.get_gemini_client(api_key)
    result = await client.aio.models.embed_content(
        model=model,
        contents=f"{prefix}{text}",
    )
    return list(result.embeddings[0].values)


async def embed_image(image_path: str, api_key: str) -> list[float]:
    """
    Erstellt ein natives Bild-Embedding (kein describe-then-embed).
    Liegt im gleichen semantischen Raum wie Text-Embeddings.
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"Bilddatei nicht gefunden: {image_path}") from None

    model = get_settings().gemini_embedding_model
    mime = _utils.detect_mime(image_path)
    client = _utils.get_gemini_client(api_key)
    result = await client.aio.models.embed_content(
        model=model,
        contents=[types.Part.from_bytes(data=image_bytes, mime_type=mime)],
    )
    return list(result.embeddings[0].values)


async def embed_multimodal(text: str, image_path: str, api_key: str) -> list[float]:
    """
    Erstellt ein kombiniertes Text+Bild-Embedding in einem einzigen API-Aufruf.
    Ideal für Rezepte mit zugehörigem Bild (höchste semantische Qualität).
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"Bilddatei nicht gefunden: {image_path}") from None

    model = get_settings().gemini_embedding_model
    mime = _utils.detect_mime(image_path)
    client = _utils.get_gemini_client(api_key)
    result = await client.aio.models.embed_content(
        model=model,
        contents=[
            types.Content(
                parts=[
                    types.Part(text=f"search_document: {text}"),
                    types.Part.from_bytes(data=image_bytes, mime_type=mime),
                ]
            )
        ],
    )
    return list(result.embeddings[0].values)


async def batch_embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """
    Erstellt Embeddings fuer mehrere Texte mit begrenzter Parallelitaet.
    Maximal 3 gleichzeitige API-Aufrufe (Rate-Limit-Schutz).
    """
    import asyncio

    model = get_settings().gemini_embedding_model
    client = _utils.get_gemini_client(api_key)
    semaphore = asyncio.Semaphore(3)

    async def _embed_one(text: str) -> list[float]:
        async with semaphore:
            result = await client.aio.models.embed_content(
                model=model,
                contents=f"search_document: {text}",
            )
            return list(result.embeddings[0].values)

    return await asyncio.gather(*[_embed_one(t) for t in texts])
