"""
Tests für den OCR-Service.
Mock-basiert – kein echter Gemini-API-Aufruf erforderlich.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_ocr_mock_client(ocr_json: dict):
    """Erstellt einen Mock-Client der ein strukturiertes OCR-Ergebnis zurückgibt."""
    mock_response = MagicMock()
    mock_response.text = json.dumps(ocr_json)
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client


SAMPLE_OCR_RESPONSE = {
    "title": "Zürcher Geschnetzeltes",
    "description": "Klassisches Schweizer Gericht mit Kalbfleisch.",
    "servings": 4,
    "prep_time_minutes": 15,
    "cook_time_minutes": 20,
    "difficulty": "mittel",
    "ingredients": [
        {"amount": 600, "unit": "g", "name": "Kalbfleisch", "notes": "in Streifen"},
        {"amount": 2, "unit": "EL", "name": "Butter", "notes": None},
        {"amount": 2, "unit": "dl", "name": "Rahm", "notes": None},
    ],
    "instructions": "1. Fleisch in Butter anbraten. 2. Rahm dazugeben. 3. Servieren.",
    "tags": ["Schweizer Küche", "Klassiker"],
    "source_type": "image_ocr",
}


class TestExtractRecipeFromImage:
    @pytest.mark.asyncio
    async def test_raises_on_missing_file(self):
        from app.services.ocr_service import extract_recipe_from_image
        with pytest.raises(FileNotFoundError):
            await extract_recipe_from_image("/nonexistent/image.jpg", "fake-key")

    @pytest.mark.asyncio
    async def test_returns_ocr_result(self, minimal_jpeg):
        mock_client = _make_ocr_mock_client(SAMPLE_OCR_RESPONSE)
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            from app.services.ocr_service import extract_recipe_from_image
            result = await extract_recipe_from_image(str(minimal_jpeg), "fake-key")

        assert result.title == "Zürcher Geschnetzeltes"
        assert result.servings == 4
        assert len(result.ingredients) == 3
        assert result.ingredients[0].name == "Kalbfleisch"
        assert result.ingredients[0].unit == "g"
        assert result.source_type == "image_ocr"

    @pytest.mark.asyncio
    async def test_prompt_includes_swiss_units(self, minimal_jpeg):
        """Prompt muss Schweizer Masseinheiten erwähnen."""
        mock_client = _make_ocr_mock_client(SAMPLE_OCR_RESPONSE)
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            from app.services.ocr_service import extract_recipe_from_image, _OCR_PROMPT
            await extract_recipe_from_image(str(minimal_jpeg), "fake-key")

        assert "EL" in _OCR_PROMPT
        assert "TL" in _OCR_PROMPT
        assert "dl" in _OCR_PROMPT

    @pytest.mark.asyncio
    async def test_prompt_instructs_german_translation(self):
        """Prompt muss zur deutschen Übersetzung auffordern."""
        from app.services.ocr_service import _OCR_PROMPT
        assert "Deutsch" in _OCR_PROMPT or "deutsch" in _OCR_PROMPT

    @pytest.mark.asyncio
    async def test_difficulty_is_valid_value(self, minimal_jpeg):
        mock_client = _make_ocr_mock_client(SAMPLE_OCR_RESPONSE)
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            from app.services.ocr_service import extract_recipe_from_image
            result = await extract_recipe_from_image(str(minimal_jpeg), "fake-key")

        assert result.difficulty in ("einfach", "mittel", "anspruchsvoll", None)


class TestExtractRecipesFromImages:
    """Mehrseitiges OCR: alle Seiten in EINEN Gemini-Aufruf, EIN Rezept zurück."""

    @pytest.mark.asyncio
    async def test_raises_on_empty_list(self):
        from app.services.ocr_service import extract_recipes_from_images
        with pytest.raises(ValueError):
            await extract_recipes_from_images([], "fake-key")

    @pytest.mark.asyncio
    async def test_raises_on_missing_file(self, minimal_jpeg):
        from app.services.ocr_service import extract_recipes_from_images
        with pytest.raises(FileNotFoundError):
            await extract_recipes_from_images(
                [str(minimal_jpeg), "/nonexistent/seite-2.jpg"], "fake-key"
            )

    @pytest.mark.asyncio
    async def test_two_pages_produce_exactly_one_recipe(self, tmp_path, minimal_jpeg):
        page_two = tmp_path / "seite-2.jpg"
        page_two.write_bytes(minimal_jpeg.read_bytes())

        mock_client = _make_ocr_mock_client(SAMPLE_OCR_RESPONSE)
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            from app.services.ocr_service import extract_recipes_from_images
            result = await extract_recipes_from_images(
                [str(minimal_jpeg), str(page_two)], "fake-key"
            )

        assert len(result.recipes) == 1
        assert result.recipes[0].title == "Zürcher Geschnetzeltes"
        assert result.recipes[0].source_type == "image_ocr"

        # Ein einziger Aufruf mit beiden Bildern in Reihenfolge.
        mock_client.aio.models.generate_content.assert_awaited_once()
        kwargs = mock_client.aio.models.generate_content.await_args.kwargs
        contents = kwargs["contents"]
        image_parts = [p for p in contents if getattr(p, "inline_data", None) is not None]
        assert len(image_parts) == 2
        # Antwortschema ist die Einzahl-Form: strukturell genau ein Rezept.
        from app.services.ocr_service import OcrResult
        assert kwargs["config"].response_schema is OcrResult
        # max_output_tokens bleibt ungesetzt (Modell-Standard, ~64k).
        assert getattr(kwargs["config"], "max_output_tokens", None) is None

    @pytest.mark.asyncio
    async def test_single_path_delegates_to_multi_recipe_variant(self, minimal_jpeg):
        """Ein Bild = Galerie-Semantik: mehrere eigenständige Rezepte bleiben getrennt."""
        mock_client = _make_ocr_mock_client(
            {"recipes": [SAMPLE_OCR_RESPONSE, {**SAMPLE_OCR_RESPONSE, "title": "Rösti"}]}
        )
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            from app.services.ocr_service import extract_recipes_from_images
            result = await extract_recipes_from_images([str(minimal_jpeg)], "fake-key")

        assert len(result.recipes) == 2
        assert result.recipes[1].title == "Rösti"

    @pytest.mark.asyncio
    async def test_multipage_prompt_demands_completeness(self):
        from app.services.ocr_service import _OCR_MULTIPAGE_PROMPT
        prompt = _OCR_MULTIPAGE_PROMPT.format(page_count=2)
        assert "AUFEINANDERFOLGENDE SEITEN" in prompt
        assert "GENAU EINEM" in prompt or "GENAU EIN" in prompt
        assert "ALLE Zutaten" in prompt and "ALLE Schritte" in prompt
        assert "KEINE DUPLIKATE" in prompt
        assert "Seitenzahlen" in prompt
        # Schweizer Masseinheiten und Sprache auch im Mehrseiten-Prompt.
        assert "dl" in prompt and "EL" in prompt
        assert "ss" in prompt
        # Keine permissiven Mengenangaben.
        assert "3-5" not in prompt and "3–5" not in prompt
