"""
Hilfsfunktionen für strukturierte KI-Textgenerierung via Gemini.
"""

from typing import Any, Type

from google.genai import types

from app.services._utils import get_gemini_client


async def generate_structured(
    prompt: str,
    response_schema: Type,
    api_key: str,
    model: str,
    temperature: float = 0.7,
) -> Any:
    """
    Generiert strukturierte JSON-Ausgabe mit Gemini response_schema.
    Wirft ValueError wenn keine geparste Antwort zurückkommt.
    """
    client = get_gemini_client(api_key)
    response = await client.aio.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
            temperature=temperature,
        ),
    )
    if response.parsed is None:
        raise ValueError("Gemini hat keine strukturierte Antwort zurückgegeben.")
    return response.parsed
