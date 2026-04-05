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
