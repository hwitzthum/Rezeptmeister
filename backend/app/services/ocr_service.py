"""
OCR-Service für Rezeptmeister.
Extrahiert strukturierte Rezeptdaten aus Bildern via Gemini multimodal.
Gibt Inhalte immer auf Deutsch (Schweizer Standard) aus und konvertiert
automatisch in Schweizer Masseinheiten.
"""

import logging
from typing import Literal, Optional

from google.genai import types
from pydantic import BaseModel, Field, ValidationError

from app.config import get_settings
from app.services import _utils

logger = logging.getLogger(__name__)


class OcrError(Exception):
    """
    Fachlicher OCR-Fehler mit einer für die Nutzerin bestimmten Meldung.

    Wird geworfen, wenn das Modell keine verwertbare Antwort liefert (etwa
    weil Geminis Rezitationsfilter die Ausgabe sperrt). Der Router reicht
    `message` als kuratierte Meldung durch; `code` bleibt für Log und Tests.
    """

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


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
    # Literal statt str: Geminis Structured Output erzwingt damit den
    # Wertebereich selbst. Freie Strings («Einfach», «leicht») scheiterten
    # sonst erst beim Speichern an der Zod-Validierung von POST /api/recipes.
    difficulty: Optional[Literal["einfach", "mittel", "anspruchsvoll"]] = Field(
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

# Warum «eigene Worte»: Kochbuchseiten stehen meist auch im Netz. Verlangt der
# Prompt eine Abschrift, erkennt Geminis Rezitationsfilter den bekannten
# Wortlaut und sperrt die gesamte Antwort (finish_reason=RECITATION, kein
# Text) — reproduziert am 2026-09-04 mit den Prod-Bildern einer Nutzerin,
# bei denen schon EINE Seite gesperrt wurde. Eine Umformulierung der
# Anleitung passiert den Filter; Zutaten, Mengen, Zeiten und Temperaturen
# bleiben als Fakten vollständig erhalten.
_OWN_WORDS_RULE = """EIGENE FORMULIERUNG (verbindlich): Schreibe Beschreibung und Zubereitungsanleitung
   vollständig in EIGENEN WORTEN. Übernimm keine ganzen Sätze aus der Vorlage: Formuliere jeden
   Schritt als knappe, sachliche Anweisung um (Handlung, Zutat, Menge, Temperatur, Dauer), ohne
   Wortlaut, Satzstellung oder Stil des Originals zu wiederholen. Der fachliche Inhalt — alle
   Zutaten, Mengen, Schritte, Zeiten und Temperaturen — bleibt dabei vollständig erhalten."""

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
8. """ + _OWN_WORDS_RULE + """

Extrahiere jetzt ALLE Rezepte aus dem Bild. Falls nur ein Rezept vorhanden ist, gib trotzdem eine Liste mit einem Eintrag zurück:"""


_OCR_MULTIPAGE_PROMPT = """Du bist ein Kochbuch-Digitalisierungs-Assistent für die Schweiz.

Die folgenden {page_count} Bilder sind AUFEINANDERFOLGENDE SEITEN EINES EINZIGEN REZEPTS,
in der Reihenfolge Seite 1 bis Seite {page_count}. Sie zeigen NICHT mehrere verschiedene Rezepte.
Führe den Inhalt ALLER Seiten zu GENAU EINEM vollständigen Rezept zusammen.

ZUSAMMENFÜHRUNG (verbindlich):
1. VOLLSTÄNDIGKEIT: Übernimm ALLE Zutaten von ALLEN Seiten und ALLE Zubereitungsschritte von
   ALLEN Seiten. Lasse keine einzige Zutat und keinen einzigen Schritt weg, egal wie lang das
   Rezept dadurch wird. Kürze nicht, fasse nicht zusammen, überspringe nichts.
2. FORTGESETZTE LISTEN: Eine Zutatenliste, die auf Seite N endet und auf Seite N+1 weitergeht,
   ist EINE Liste — hänge die Fortsetzung an, statt eine zweite Liste zu beginnen.
3. DURCHGEHENDE NUMMERIERUNG: Nummeriere die Zubereitungsschritte über alle Seiten hinweg
   fortlaufend von 1 an. Beginne auf einer Folgeseite NICHT wieder bei 1.
4. KEINE DUPLIKATE: Erscheint dieselbe Zutat oder derselbe Schritt auf zwei Seiten (z.B. durch
   eine wiederholte Zutatenspalte oder eine Wiederholung des Titels), übernimm sie GENAU EINMAL.
5. SEITENRAUSCHEN IGNORIEREN: Kopfzeilen, Fusszeilen, Seitenzahlen, Kapitelnamen, Buchtitel,
   Randnotizen und Werbung gehören NICHT ins Rezept.
6. KOPFDATEN: Titel, Portionen, Vorbereitungs- und Kochzeit stehen meist auf der ersten Seite.
   Fehlt eine Angabe dort, suche sie auf den Folgeseiten. Nur wenn sie auf KEINER Seite steht,
   gib null zurück.
7. TEILREZEPTE: Gehören Bestandteile wie Teig, Füllung, Sauce oder Glasur zum selben Gericht,
   bleiben sie Teil DIESES einen Rezepts. Kennzeichne sie in den Zutaten über notes
   (z.B. "für die Füllung") und in der Anleitung über Zwischenüberschriften.

REGELN FÜR DEN INHALT:
8. SPRACHE: Alle Texte MÜSSEN auf Deutsch (Schweizer Standard, "ss" statt "ß") sein.
   Nicht-deutschsprachige Inhalte übersetze ins Deutsche.
9. MASSEINHEITEN: Verwende ausschliesslich Schweizer Masseinheiten:
   g, kg, ml, dl, l, EL (Esslöffel), TL (Teelöffel), KL (Kaffeelöffel),
   Msp. (Messerspitze), Prise, Stk. (Stück), Bund, Pkg. (Packung),
   Scheibe, Dose, Becher, Pfd. (Pfund)
   Umrechnungen: 1 Cup ≈ 2.4 dl, 1 oz ≈ 28 g, 1 lb ≈ 454 g, °F → °C ((°F-32)×5/9)
10. SCHWIERIGKEIT: Wähle einfach, mittel oder anspruchsvoll.
11. ZUTATEN: Trenne Menge, Einheit und Name klar. Falls keine Mengenangabe, lasse amount=null.
12. ANLEITUNG: Schreibe die vollständige Anleitung als nummerierte Schritte, ein Schritt pro Zeile.
13. FALLS auf KEINER Seite ein Rezept erkennbar ist: Gib title="Kein Rezept erkannt" und leere
    ingredients zurück.
14. """ + _OWN_WORDS_RULE + """

Gib jetzt GENAU EIN zusammengeführtes Rezept zurück, das ALLE Zutaten und ALLE Schritte
aus ALLEN {page_count} Seiten enthält:"""


def _parse_response(response, schema, context: str):
    """
    Validiert die Modellantwort gegen `schema` oder wirft einen OcrError mit
    einer ehrlichen Meldung.

    Ohne diese Prüfung lief eine gesperrte Antwort (finish_reason=RECITATION,
    `response.text` ist None) in `model_validate_json(None)` und damit in eine
    pydantic-ValidationError — eine ValueError-Unterklasse, die der Router als
    400 «Ungültiger Dateipfad» und der Proxy als «Ungültige Anfrage» meldete.
    Eine Modell-Sperre ist kein Client-Fehler und darf auch nicht so aussehen.
    """
    text = response.text
    if text:
        try:
            return schema.model_validate_json(text)
        except ValidationError as e:
            # Nur Fehlerarten loggen, nie den Inhalt — der ist Rezepttext der Nutzerin.
            kinds = sorted({err.get("type", "?") for err in e.errors()})
            logger.warning(f"OCR-Antwort verletzt Schema ({context}): {kinds}")
            raise OcrError(
                "Der KI-Dienst hat eine unbrauchbare Antwort geliefert. Bitte erneut versuchen.",
                code="invalid_output",
            ) from e

    candidates = getattr(response, "candidates", None) or []
    finish_reason = getattr(candidates[0], "finish_reason", None) if candidates else None
    logger.warning(f"OCR ohne verwertbare Antwort ({context}, finish_reason={finish_reason})")
    if finish_reason == types.FinishReason.RECITATION:
        raise OcrError(
            "Der KI-Dienst hat die Texterkennung blockiert (Urheberrechtsfilter). "
            "Bitte erneut versuchen oder die Seiten einzeln scannen.",
            code="recitation",
        )
    if finish_reason == types.FinishReason.MAX_TOKENS:
        raise OcrError(
            "Die Antwort des KI-Dienstes war unvollständig. "
            "Bitte weniger Seiten auf einmal scannen.",
            code="truncated",
        )
    raise OcrError(
        "Der KI-Dienst konnte die Seiten nicht auswerten. Bitte erneut versuchen.",
        code="empty",
    )


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

        result = _parse_response(response, OcrResult, "einseitig")
        result.source_type = "image_ocr"  # immer von uns gesetzt, nicht vom Modell
        return result

    except OcrError:
        raise
    except Exception as e:
        logger.error(f"OCR-Fehler für {image_path}: {type(e).__name__}")
        raise


#: Titel, mit dem der Prompt (Regel 6 bzw. 13) eine Seite ohne Rezept markiert.
NO_RECIPE_TITLE = "Kein Rezept erkannt"


def _ensure_non_empty(result: OcrResults) -> OcrResults:
    """
    Stellt sicher, dass immer mindestens ein Rezept zurueckkommt.

    Der Prompt verlangt fuer eine Seite ohne Rezept ausdruecklich einen
    Platzhalter mit `title="Kein Rezept erkannt"`. Das Modell haelt sich nicht
    zuverlaessig daran und liefert stattdessen gelegentlich eine leere Liste
    (beobachtet bei sehr kleinen/unlesbaren Bildern). Die Oberflaeche zeigt dann
    eine leere Vorschau ohne jeden Hinweis — ein stiller Fehlschlag.

    Die Zusage gehoert deshalb in den Code und nicht in die Prompt-Formulierung.
    """
    if result.recipes:
        return result
    return OcrResults(
        recipes=[
            OcrResult(
                title=NO_RECIPE_TITLE,
                instructions="",
                source_type="image_ocr",
            )
        ]
    )


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

        result = _parse_response(response, OcrResults, "einseitig, mehrere Rezepte")
        for recipe in result.recipes:
            recipe.source_type = "image_ocr"
        return _ensure_non_empty(result)

    except OcrError:
        raise
    except Exception as e:
        logger.error(f"OCR-Fehler (multi) für {image_path}: {type(e).__name__}")
        raise


async def extract_recipes_from_images(image_paths: list[str], api_key: str) -> OcrResults:
    """
    Extrahiert EIN Rezept aus mehreren aufeinanderfolgenden Seitenbildern.

    Alle Bilder gehen in EINEN einzigen Gemini-Aufruf (Reihenfolge der Liste =
    Seitenreihenfolge), damit das Modell Zutatenlisten und Schritte über die
    Seitengrenze hinweg zusammenführen kann. Das Antwortschema ist bewusst
    OcrResult (Einzahl) statt OcrResults: so ist strukturell garantiert, dass
    genau ein zusammengeführtes Rezept herauskommt, statt sich auf die
    Prompt-Formulierung zu verlassen.

    Bei genau einem Bild wird an extract_recipes_from_image delegiert — dort
    gilt weiterhin die Mehrfach-Rezept-Semantik des Galerie-Wegs (eine Seite
    kann mehrere eigenständige Rezepte enthalten).
    """
    if not image_paths:
        raise ValueError("Keine Bilder angegeben.")
    if len(image_paths) == 1:
        return await extract_recipes_from_image(image_paths[0], api_key)

    parts: list[types.Part] = []
    for image_path in image_paths:
        try:
            with open(image_path, "rb") as f:
                image_bytes = f.read()
        except FileNotFoundError:
            raise FileNotFoundError(f"Bilddatei nicht gefunden: {image_path}") from None
        parts.append(
            types.Part.from_bytes(data=image_bytes, mime_type=_utils.detect_mime(image_path))
        )

    ocr_model = get_settings().gemini_ocr_model
    client = _utils.get_gemini_client(api_key)
    prompt = _OCR_MULTIPAGE_PROMPT.format(page_count=len(image_paths))

    try:
        response = await client.aio.models.generate_content(
            model=ocr_model,
            contents=[*parts, types.Part(text=prompt)],
            # max_output_tokens bleibt bewusst ungesetzt: der Modell-Standard
            # (Gemini Pro: 64k Ausgabe-Token) liegt weit über dem Bedarf eines
            # mehrseitigen Rezepts (~2–4k Token). Ein expliziter Wert würde die
            # Obergrenze nur senken und lange Rezepte abschneiden.
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=OcrResult,
                temperature=0.1,
            ),
        )

        recipe = _parse_response(response, OcrResult, f"mehrseitig, {len(image_paths)} Seiten")
        recipe.source_type = "image_ocr"
        return OcrResults(recipes=[recipe])

    except OcrError:
        raise
    except Exception as e:
        logger.error(
            f"OCR-Fehler (mehrseitig, {len(image_paths)} Seiten): {type(e).__name__}"
        )
        raise
