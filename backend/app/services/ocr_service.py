"""
OCR-Service für Rezeptmeister.
Extrahiert strukturierte Rezeptdaten aus Bildern via Gemini multimodal.
Gibt Inhalte immer auf Deutsch (Schweizer Standard) aus und konvertiert
automatisch in Schweizer Masseinheiten.
"""

import logging
from typing import Optional

from google.genai import types
from pydantic import BaseModel, Field

from app.config import get_settings
from app.services import _utils

logger = logging.getLogger(__name__)


# ── Ausgabe-Schemas ────────────────────────────────────────────────────────────

class OcrIngredient(BaseModel):
    amount: Optional[float] = Field(None, description="Menge (numerisch)")
    unit: Optional[str] = Field(
        None,
        description="Masseinheit auf Schweizer Standard: g, kg, ml, dl, l, EL, TL, KL, Msp., Prise, Stk., Bund, Pkg., Scheibe, Dose, Becher, Pfd.",
    )
    name: str = Field(..., description="Name der Zutat auf Deutsch")
    notes: Optional[str] = Field(None, description="Optionale Zusatzinfos (z.B. 'fein gehackt')")


class OcrResult(BaseModel):
    title: str = Field(..., description="Rezepttitel auf Deutsch")
    description: Optional[str] = Field(None, description="Kurze Beschreibung auf Deutsch (1-2 Sätze)")
    servings: Optional[int] = Field(None, description="Anzahl Portionen")
    prep_time_minutes: Optional[int] = Field(None, description="Vorbereitungszeit in Minuten")
    cook_time_minutes: Optional[int] = Field(None, description="Koch-/Backzeit in Minuten")
    difficulty: Optional[str] = Field(
        None,
        description="Schwierigkeitsgrad: einfach, mittel oder anspruchsvoll",
    )
    ingredients: list[OcrIngredient] = Field(default_factory=list, description="Liste aller Zutaten")
    instructions: str = Field(..., description="Zubereitungsanleitung auf Deutsch")
    tags: list[str] = Field(default_factory=list, description="Passende Tags auf Deutsch (z.B. 'Vegetarisch', 'Schnell')")
    image_url: Optional[str] = Field(None, description="Optionale Bild-URL aus JSON-LD")
    source_type: str = Field(default="image_ocr")


class OcrResults(BaseModel):
    recipes: list[OcrResult] = Field(..., description="Liste aller erkannten Rezepte im Bild")


# ── Service-Funktion ───────────────────────────────────────────────────────────

_OCR_PROMPT = """Du bist ein Kochbuch-Digitalisierungs-Assistent für die Schweiz.

Analysiere das Bild und extrahiere alle Rezeptinformationen als strukturierten JSON-Output.

REGELN:
1. SPRACHE: Alle Texte MÜSSEN auf Deutsch (Schweizer Standard, "ss" statt "ß") sein.
   Nicht-deutschsprachige Inhalte übersetze ins Deutsche.
2. MASSEINHEITEN: Verwende ausschliesslich Schweizer Masseinheiten:
   g, kg, ml, dl, l, EL (Esslöffel), TL (Teelöffel), KL (Kaffeelöffel),
   Msp. (Messerspitze), Prise, Stk. (Stück), Bund, Pkg. (Packung),
   Scheibe, Dose, Becher, Pfd. (Pfund)
   Umrechnungen: 1 Cup ≈ 2.4 dl, 1 oz ≈ 28 g, 1 lb ≈ 454 g, °F → °C ((°F-32)×5/9)
3. SCHWIERIGKEIT: Wähle einfach, mittel oder anspruchsvoll.
4. ZUTATEN: Trenne Menge, Einheit und Name klar. Falls keine Mengenangabe, lasse amount=null.
5. ANLEITUNG: Schreibe die Anleitung als fortlaufenden Text oder nummerierte Schritte.
6. FALLS kein Rezept erkennbar: Gib title="Kein Rezept erkannt" und leere ingredients zurück.
7. MEHRERE REZEPTE: Falls das Bild mehrere Rezepte enthält, extrahiere JEDES Rezept als separaten Eintrag in der Liste. Jedes Rezept erhält eigenen Titel, Zutaten und Anleitung.

Extrahiere jetzt ALLE Rezepte aus dem Bild. Falls nur ein Rezept vorhanden ist, gib trotzdem eine Liste mit einem Eintrag zurück:"""


async def extract_recipe_from_image(image_path: str, api_key: str) -> OcrResult:
    """
    Extrahiert strukturierte Rezeptdaten aus einem Bild via Gemini multimodal OCR.
    Gibt immer ein OcrResult zurück (auch bei nicht erkennbaren Inhalten).
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"Bilddatei nicht gefunden: {image_path}") from None

    ocr_model = get_settings().gemini_ocr_model
    mime = _utils.detect_mime(image_path)
    client = _utils.get_gemini_client(api_key)

    try:
        response = await client.aio.models.generate_content(
            model=ocr_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                types.Part(text=_OCR_PROMPT),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OcrResult,
                temperature=0.1,  # Niedrige Temperatur für konsistente Extraktion
            ),
        )

        text = response.text
        result = OcrResult.model_validate_json(text)
        result.source_type = "image_ocr"  # immer von uns gesetzt, nicht vom Modell
        return result

    except Exception as e:
        logger.error(f"OCR-Fehler für {image_path}: {type(e).__name__}")
        raise


async def extract_recipes_from_image(image_path: str, api_key: str) -> OcrResults:
    """
    Extrahiert ALLE Rezepte aus einem Bild via Gemini multimodal OCR.
    Gibt OcrResults mit einer Liste von Rezepten zurück.
    """
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"Bilddatei nicht gefunden: {image_path}") from None

    ocr_model = get_settings().gemini_ocr_model
    mime = _utils.detect_mime(image_path)
    client = _utils.get_gemini_client(api_key)

    try:
        response = await client.aio.models.generate_content(
            model=ocr_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime),
                types.Part(text=_OCR_PROMPT),
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OcrResults,
                temperature=0.1,
            ),
        )

        text = response.text
        result = OcrResults.model_validate_json(text)
        for recipe in result.recipes:
            recipe.source_type = "image_ocr"
        return result

    except Exception as e:
        logger.error(f"OCR-Fehler (multi) für {image_path}: {type(e).__name__}")
        raise
