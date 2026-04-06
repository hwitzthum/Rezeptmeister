"""
KI-Endpunkte für Rezeptmeister.

POST /ai/suggest          – 5 Rezeptvorschläge basierend auf Zutaten/Präferenzen
POST /ai/generate-recipe  – Vollständiges Rezept aus Vorschlag generieren
POST /ai/generate-image   – KI-Bild für ein Rezept generieren und speichern
POST /ai/scale-recipe     – Rezept auf Portionsgrösse skalieren (mit Gemini-Hinweisen)
POST /ai/nutrition        – Nährwertberechnung pro Portion
"""

import io
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from google.genai import types
from PIL import Image as PilImage
from pydantic import BaseModel
from sqlalchemy import select, update, not_, exists

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.image import Image
from app.routers.embed import _bg_embed_image
from app.services._utils import get_gemini_client
from app.services.ai_service import generate_structured
from app.services.ocr_service import OcrResult

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI"])
settings = get_settings()


# ── /ai/suggest ────────────────────────────────────────────────────────────────

class SuggestRequest(BaseModel):
    ingredients: list[str] = []
    cuisine: str = ""
    time_budget_minutes: int = 60
    dietary: list[str] = []
    season: str = ""


class RecipeSuggestion(BaseModel):
    id: int
    title: str
    description: str
    time_estimate_minutes: int
    difficulty: str


class SuggestResponse(BaseModel):
    suggestions: list[RecipeSuggestion]


@router.post("/suggest")
async def suggest_recipes(
    body: SuggestRequest,
    x_gemini_api_key: Optional[str] = Header(None),
):
    """Schlägt 5 passende Schweizer Rezepte basierend auf Zutaten und Präferenzen vor."""
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="Kein KI-Schlüssel angegeben.")

    parts = ["Du bist ein Schweizer Kochbuch-Assistent. Schlage genau 5 Rezepte vor."]
    if body.ingredients:
        parts.append(f"Verfügbare Zutaten: {', '.join(body.ingredients)}")
    if body.cuisine:
        parts.append(f"Küche/Stil: {body.cuisine}")
    if body.time_budget_minutes:
        parts.append(f"Maximale Gesamtzeit: {body.time_budget_minutes} Minuten")
    if body.dietary:
        parts.append(f"Ernährungsweise: {', '.join(body.dietary)}")
    if body.season:
        parts.append(f"Saison: {body.season}")
    parts.append(
        "Antworte auf Deutsch (Schweizer Standard, 'ss' statt 'ss'). "
        "Jedes Rezept braucht: id (1–5), title, description (1–2 Sätze), "
        "time_estimate_minutes (ganzzahlig), difficulty ('einfach', 'mittel' oder 'anspruchsvoll')."
    )
    prompt = "\n".join(parts)

    try:
        result: SuggestResponse = await generate_structured(
            prompt, SuggestResponse, x_gemini_api_key, settings.gemini_flash_model, temperature=0.8
        )
    except Exception as e:
        logger.error(f"Suggest-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="KI-Dienst momentan nicht verfügbar.")

    return {"suggestions": result.suggestions, "tokens_used": 0}


# ── /ai/generate-recipe ────────────────────────────────────────────────────────

class GenerateRecipeRequest(BaseModel):
    suggestion_title: str
    suggestion_description: str
    servings: int = 4
    cuisine: str = ""
    dietary: list[str] = []


@router.post("/generate-recipe", response_model=OcrResult)
async def generate_recipe(
    body: GenerateRecipeRequest,
    x_gemini_api_key: Optional[str] = Header(None),
) -> OcrResult:
    """Generiert ein vollständiges Rezept aus einem Vorschlags-Titel und -Beschreibung."""
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="Kein KI-Schlüssel angegeben.")

    parts = [
        "Du bist ein Schweizer Kochbuch-Autor. Erstelle ein vollständiges Rezept auf Deutsch.",
        f"Titel: {body.suggestion_title}",
        f"Beschreibung: {body.suggestion_description}",
        f"Portionen: {body.servings}",
    ]
    if body.cuisine:
        parts.append(f"Küche: {body.cuisine}")
    if body.dietary:
        parts.append(f"Ernährungsweise: {', '.join(body.dietary)}")
    parts.append(
        "WICHTIG: Verwende ausschliesslich Schweizer Masseinheiten: "
        "g, kg, ml, dl, l, EL (Esslöffel), TL (Teelöffel), KL (Kaffeelöffel), "
        "Msp. (Messerspitze), Prise, Stk. (Stück), Bund, Pkg. (Packung). "
        "Kein 'ß' – immer 'ss'. Difficulty: einfach, mittel oder anspruchsvoll."
    )
    prompt = "\n".join(parts)

    try:
        result: OcrResult = await generate_structured(
            prompt, OcrResult, x_gemini_api_key, settings.gemini_flash_model, temperature=0.7
        )
    except Exception as e:
        logger.error(f"Generate-Recipe-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="KI-Dienst momentan nicht verfügbar.")

    result.source_type = "ai_generated"
    return result


# ── /ai/generate-image ─────────────────────────────────────────────────────────

class GenerateImageRequest(BaseModel):
    recipe_id: str
    title: str
    ingredients: list[str] = []
    category: str = ""
    user_id: str


@router.post("/generate-image")
async def generate_image(
    body: GenerateImageRequest,
    background_tasks: BackgroundTasks,
    x_gemini_api_key: Optional[str] = Header(None),
):
    """
    Generiert ein KI-Bild für ein Rezept, speichert Original + Thumbnail
    und legt einen Image-DB-Eintrag an. Startet Bild-Embedding als Background Task.
    """
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="Kein KI-Schlüssel angegeben.")

    # Prompt aufbauen
    ingredients_hint = ""
    if body.ingredients:
        ingredients_hint = f"Zutaten: {', '.join(body.ingredients[:8])}. "
    category_hint = f"Kategorie: {body.category}. " if body.category else ""
    prompt = (
        f"Ein ansprechendes, professionelles Lebensmittelfoto des Schweizer Gerichts '{body.title}'. "
        f"{ingredients_hint}{category_hint}"
        "Natürliches Licht, rustikaler Holztisch, frische Zutaten im Hintergrund. "
        "Hochwertige Food-Fotografie, kein Text im Bild."
    )

    # Gemini Image Generation aufrufen
    client = get_gemini_client(x_gemini_api_key)
    try:
        response = await client.aio.models.generate_content(
            model=settings.gemini_image_gen_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )
    except Exception as e:
        logger.error(f"Bildgenerierungs-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="KI-Bildgenerierung fehlgeschlagen.")

    # Bild-Part aus Antwort extrahieren
    image_bytes: Optional[bytes] = None
    mime_type: str = "image/webp"
    if response.candidates:
        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                image_bytes = part.inline_data.data
                mime_type = part.inline_data.mime_type or "image/webp"
                break

    if not image_bytes:
        raise HTTPException(status_code=502, detail="Kein Bild in der KI-Antwort enthalten.")

    # Verzeichnisse sicherstellen (absoluter Pfad, unabhängig vom Arbeitsverzeichnis)
    upload_dir = Path(settings.upload_dir).resolve()
    originals_dir = upload_dir / "originals"
    thumbnails_dir = upload_dir / "thumbnails"
    originals_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    # Dateinamen erzeugen
    file_stem = f"ai_{uuid.uuid4().hex}"
    original_filename = f"{file_stem}.webp"
    thumbnail_filename = f"{file_stem}.webp"
    original_path = originals_dir / original_filename
    thumbnail_path = thumbnails_dir / thumbnail_filename

    # Mit Pillow speichern: Original als WebP, Thumbnail 300×300
    try:
        img = PilImage.open(io.BytesIO(image_bytes)).convert("RGB")
        img.save(str(original_path), format="WEBP", quality=90)
        file_size = len(image_bytes)
        width, height = img.size

        thumb = img.copy()
        thumb.thumbnail(settings.thumbnail_size, PilImage.LANCZOS)
        # Quadratisches Thumbnail mit weissem Hintergrund (300×300)
        thumb_square = PilImage.new("RGB", settings.thumbnail_size, (255, 255, 255))
        offset = (
            (settings.thumbnail_size[0] - thumb.width) // 2,
            (settings.thumbnail_size[1] - thumb.height) // 2,
        )
        thumb_square.paste(thumb, offset)
        thumb_square.save(str(thumbnail_path), format="WEBP", quality=85)
    except Exception as e:
        logger.error(f"Bild-Speichern-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail="Bild konnte nicht gespeichert werden.")

    # DB-Eintrag anlegen
    try:
        recipe_uuid = uuid.UUID(body.recipe_id)
        user_uuid = uuid.UUID(body.user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ungültige recipe_id oder user_id.")

    image_id = uuid.uuid4()
    # API-relativer Pfad (konsistent mit dem Upload-Endpunkt: /api/uploads/originals/...)
    db_file_path = f"/api/uploads/originals/{original_filename}"

    # Bild atomisch einfügen und is_primary setzen, wenn noch kein Primary-Image existiert
    async with AsyncSessionLocal() as session:
        async with session.begin():
            new_image = Image(
                id=image_id,
                user_id=user_uuid,
                recipe_id=recipe_uuid,
                file_path=db_file_path,
                file_name=original_filename,
                mime_type="image/webp",
                file_size_bytes=file_size,
                width=width,
                height=height,
                source_type="ai_generated",
                alt_text=f"KI-generiertes Bild für {body.title}",
                is_primary=False,
            )
            session.add(new_image)
            await session.flush()

            # Atomar zum Primary machen, wenn kein anderes Primary existiert;
            # RETURNING liefert den gesetzten Wert ohne extra SELECT.
            result = await session.execute(
                update(Image)
                .where(
                    Image.id == image_id,
                    not_(
                        exists(
                            select(Image.id).where(
                                Image.recipe_id == recipe_uuid,
                                Image.is_primary == True,  # noqa: E712
                                Image.id != image_id,
                            )
                        )
                    ),
                )
                .values(is_primary=True)
                .returning(Image.is_primary)
            )
            row = result.one_or_none()
            is_primary_val = row[0] if row else False

    # Bild-Embedding als Background Task starten
    background_tasks.add_task(_bg_embed_image, image_id, x_gemini_api_key)

    return {
        "image_id": str(image_id),
        "thumbnail_url": f"/api/uploads/thumbnails/{thumbnail_filename}",
        "original_url": f"/api/uploads/originals/{original_filename}",
        "width": width,
        "height": height,
        "is_primary": is_primary_val,
    }


# ── /ai/scale-recipe ───────────────────────────────────────────────────────────

class IngredientItem(BaseModel):
    name: str
    amount: Optional[float] = None
    unit: str = ""


class ScaleRecipeRequest(BaseModel):
    ingredients: list[IngredientItem]
    instructions: str
    original_servings: int
    target_servings: int


class ScaledIngredient(BaseModel):
    name: str
    amount: Optional[float]
    unit: str


class ScaleHints(BaseModel):
    hints: list[str]


class ScaleResponse(BaseModel):
    scaled_ingredients: list[ScaledIngredient]
    hints: list[str]
    factor: float


def _format_amount(amount: float) -> float:
    """Rundet Mengen auf 1 Dezimalstelle, entfernt unnötige Nullen."""
    rounded = round(amount, 1)
    # Wenn es eine ganze Zahl ist, als int zurückgeben (aber als float typisiert)
    return float(int(rounded)) if rounded == int(rounded) else rounded


def _simplify_unit(amount: float, unit: str) -> tuple[float, str]:
    """Vereinfacht Einheiten: ≥1000ml→l, ≥1000g→kg."""
    unit_lower = unit.lower().strip()
    if unit_lower == "ml" and amount >= 1000:
        return round(amount / 1000, 2), "l"
    if unit_lower == "g" and amount >= 1000:
        return round(amount / 1000, 2), "kg"
    return amount, unit


@router.post("/scale-recipe", response_model=ScaleResponse)
async def scale_recipe(
    body: ScaleRecipeRequest,
    x_gemini_api_key: Optional[str] = Header(None),
) -> ScaleResponse:
    """Skaliert ein Rezept auf eine neue Portionsgrösse. Bei extremer Skalierung KI-Hinweise."""
    if body.original_servings <= 0 or body.target_servings <= 0:
        raise HTTPException(status_code=400, detail="Portionsgrössen müssen grösser als 0 sein.")

    factor = body.target_servings / body.original_servings

    scaled: list[ScaledIngredient] = []
    for ing in body.ingredients:
        if ing.amount is not None:
            new_amount = ing.amount * factor
            new_amount, new_unit = _simplify_unit(new_amount, ing.unit)
            scaled.append(
                ScaledIngredient(
                    name=ing.name,
                    amount=_format_amount(new_amount),
                    unit=new_unit,
                )
            )
        else:
            scaled.append(ScaledIngredient(name=ing.name, amount=None, unit=ing.unit))

    # Gemini-Hinweise nur bei extremer Skalierung
    hints: list[str] = []
    if (factor < 0.5 or factor > 2.0) and x_gemini_api_key:
        prompt = (
            f"Ein Rezept wird auf Faktor {factor:.2f} skaliert "
            f"(von {body.original_servings} auf {body.target_servings} Portionen). "
            "Gib 2–4 kurze, praktische Hinweise auf Deutsch (Schweizer Standard) für diese Skalierung. "
            "Denke an Backzeiten, Konsistenz, Gewürze und Technik."
        )
        try:
            hints_result: ScaleHints = await generate_structured(
                prompt, ScaleHints, x_gemini_api_key, settings.gemini_flash_model, temperature=0.5
            )
            hints = hints_result.hints
        except Exception as e:
            logger.warning(f"Scale-Hinweise-Fehler: {type(e).__name__}: {e}")
            # Hinweise sind optional – kein Fehler werfen

    return ScaleResponse(scaled_ingredients=scaled, hints=hints, factor=round(factor, 4))


# ── /ai/nutrition ──────────────────────────────────────────────────────────────

class NutritionRequest(BaseModel):
    ingredients: list[IngredientItem]
    servings: int = 4


class NutritionPerServing(BaseModel):
    kcal: int
    protein_g: float
    fat_g: float
    carbs_g: float
    fiber_g: float
    confidence: str = "ca."


class NutritionResponse(BaseModel):
    per_serving: NutritionPerServing
    label: str


@router.post("/nutrition", response_model=NutritionResponse)
async def calculate_nutrition(
    body: NutritionRequest,
    x_gemini_api_key: Optional[str] = Header(None),
) -> NutritionResponse:
    """Schätzt Nährwerte pro Portion basierend auf der Zutatenliste."""
    if not x_gemini_api_key:
        raise HTTPException(status_code=400, detail="Kein KI-Schlüssel angegeben.")
    if body.servings <= 0:
        raise HTTPException(status_code=400, detail="Portionsgrösse muss grösser als 0 sein.")

    ingredient_lines = []
    for ing in body.ingredients:
        amount_str = f"{ing.amount} {ing.unit}".strip() if ing.amount else ""
        ingredient_lines.append(f"- {amount_str} {ing.name}".strip())

    prompt = (
        f"Berechne die Nährwerte pro Portion für folgendes Rezept ({body.servings} Portionen).\n"
        "Zutaten:\n"
        + "\n".join(ingredient_lines)
        + "\n\nGib die Nährwerte pro Portion an: kcal (Ganzzahl), "
        "protein_g, fat_g, carbs_g, fiber_g (je eine Dezimalstelle). "
        "confidence immer 'ca.' (Schätzung). Alle Werte auf Deutsch."
    )

    try:
        per_serving: NutritionPerServing = await generate_structured(
            prompt,
            NutritionPerServing,
            x_gemini_api_key,
            settings.gemini_flash_model,
            temperature=0.2,
        )
    except Exception as e:
        logger.error(f"Nutrition-Fehler: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail="KI-Dienst momentan nicht verfügbar.")

    label = f"ca. {per_serving.kcal} kcal"
    return NutritionResponse(per_serving=per_serving, label=label)
