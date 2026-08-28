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
    max_output_tokens: int | None = None,
    thinking_level: str | None = None,
) -> Any:
    """
    Generiert strukturierte JSON-Ausgabe mit Gemini response_schema.
    Wirft ValueError wenn keine geparste Antwort zurückkommt.

    `max_output_tokens` anheben, wenn das Antwortschema umfangreich ist:
    abgeschnittenes JSON lässt sich nicht parsen und landet als ValueError.

    `thinking_level` steuert, wie ausführlich das Modell vor der Antwort
    nachdenkt. Die Denk-Token zählen gegen `max_output_tokens` — bei "high"
    kann das Budget aufgebraucht sein, bevor überhaupt JSON entsteht (gemessen:
    51 s und eine leere Antwort). Für Aufgaben, die Sorgfalt statt tiefer
    Herleitung brauchen, ist "low" schneller *und* verlässlicher.
    """
    client = get_gemini_client(api_key)
    config_kwargs: dict[str, Any] = {
        "response_mime_type": "application/json",
        "response_schema": response_schema,
        "temperature": temperature,
    }
    if max_output_tokens is not None:
        config_kwargs["max_output_tokens"] = max_output_tokens
    if thinking_level is not None:
        config_kwargs["thinking_config"] = types.ThinkingConfig(
            thinking_level=thinking_level
        )
    response = await client.aio.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(**config_kwargs),
    )
    if response.parsed is None:
        raise ValueError("Gemini hat keine strukturierte Antwort zurückgegeben.")
    return response.parsed
