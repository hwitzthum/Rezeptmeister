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

    def test_difficulty_schema_rejects_free_strings(self):
        """«Einfach»/«leicht» scheiterten bisher erst an der Zod-Validierung beim
        Speichern — das Schema selbst muss sie ablehnen, damit Gemini den
        Wertebereich einhält."""
        from pydantic import ValidationError
        from app.services.ocr_service import OcrResult

        basis = {"title": "Test", "instructions": "Kochen."}
        assert OcrResult(**basis, difficulty="einfach").difficulty == "einfach"
        assert OcrResult(**basis, difficulty=None).difficulty is None
        for ungueltig in ("Einfach", "leicht", "schwer"):
            with pytest.raises(ValidationError):
                OcrResult(**basis, difficulty=ungueltig)

    def test_jsonld_mapping_sets_difficulty_none(self):
        from app.services.url_import_service import _map_jsonld_to_recipe

        result = _map_jsonld_to_recipe({"name": "Rösti", "recipeIngredient": ["500 g Kartoffeln"]})
        assert result.difficulty is None


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

@pytest.mark.asyncio
async def test_leere_modellantwort_liefert_platzhalter(tmp_path):
    """
    Regression: Gibt das Modell trotz Prompt-Regel eine leere Rezeptliste
    zurueck, darf die Oberflaeche keine leere Vorschau zeigen. Der Platzhalter
    wird im Code erzwungen, nicht im Prompt erhofft.
    """
    bild = tmp_path / "seite.png"
    bild.write_bytes(b"\x89PNG\r\n\x1a\n")

    class _Antwort:
        text = '{"recipes": []}'

    from app.services.ocr_service import (
        NO_RECIPE_TITLE,
        extract_recipes_from_image,
    )

    with patch("app.services.ocr_service._utils.get_gemini_client") as client:
        client.return_value.aio.models.generate_content = AsyncMock(
            return_value=_Antwort()
        )
        result = await extract_recipes_from_image(str(bild), "key")

    assert len(result.recipes) == 1
    assert result.recipes[0].title == NO_RECIPE_TITLE
    assert result.recipes[0].ingredients == []


# ── Gesperrte oder unbrauchbare Modellantworten ───────────────────────────────

def _blocked_response(finish_reason, text=None):
    """Antwort ohne verwertbaren Text, wie Gemini sie bei einer Sperre liefert."""
    from types import SimpleNamespace

    response = MagicMock()
    response.text = text
    response.candidates = [SimpleNamespace(finish_reason=finish_reason)]
    return response


def _client_returning(response):
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(return_value=response)
    return client


class TestBlockedModelResponses:
    """
    Regression (Prod, 2026-09-04): Geminis Rezitationsfilter sperrte die
    Antwort auf abfotografierte Kochbuchseiten (finish_reason=RECITATION,
    text=None). model_validate_json(None) warf eine pydantic-ValidationError —
    eine ValueError-Unterklasse —, die der Router als 400 «Ungültiger
    Dateipfad» und der Proxy als «Ungültige Anfrage» meldete.
    """

    @pytest.mark.asyncio
    async def test_recitation_multipage_raises_ocr_error(self, tmp_path, minimal_jpeg):
        from google.genai import types
        from app.services.ocr_service import OcrError, extract_recipes_from_images

        page_two = tmp_path / "seite-2.jpg"
        page_two.write_bytes(minimal_jpeg.read_bytes())
        client = _client_returning(_blocked_response(types.FinishReason.RECITATION))

        with patch("app.services._utils.get_gemini_client", return_value=client):
            with pytest.raises(OcrError) as excinfo:
                await extract_recipes_from_images([str(minimal_jpeg), str(page_two)], "fake-key")

        assert excinfo.value.code == "recitation"
        assert "Urheberrechtsfilter" in excinfo.value.message
        # Niemals als ValueError nach aussen — sonst wird daraus ein 400.
        assert not isinstance(excinfo.value, ValueError)

    @pytest.mark.asyncio
    async def test_recitation_single_page_raises_ocr_error(self, minimal_jpeg):
        from google.genai import types
        from app.services.ocr_service import OcrError, extract_recipes_from_image

        client = _client_returning(_blocked_response(types.FinishReason.RECITATION))
        with patch("app.services._utils.get_gemini_client", return_value=client):
            with pytest.raises(OcrError) as excinfo:
                await extract_recipes_from_image(str(minimal_jpeg), "fake-key")
        assert excinfo.value.code == "recitation"

    @pytest.mark.asyncio
    async def test_max_tokens_raises_truncated(self, minimal_jpeg):
        from google.genai import types
        from app.services.ocr_service import OcrError, extract_recipes_from_images

        client = _client_returning(_blocked_response(types.FinishReason.MAX_TOKENS))
        with patch("app.services._utils.get_gemini_client", return_value=client):
            with pytest.raises(OcrError) as excinfo:
                await extract_recipes_from_images([str(minimal_jpeg)], "fake-key")
        assert excinfo.value.code == "truncated"
        assert "weniger Seiten" in excinfo.value.message

    @pytest.mark.asyncio
    async def test_no_candidates_raises_empty(self, minimal_jpeg):
        from app.services.ocr_service import OcrError, extract_recipes_from_images

        response = MagicMock()
        response.text = None
        response.candidates = []
        with patch("app.services._utils.get_gemini_client", return_value=_client_returning(response)):
            with pytest.raises(OcrError) as excinfo:
                await extract_recipes_from_images([str(minimal_jpeg)], "fake-key")
        assert excinfo.value.code == "empty"

    @pytest.mark.asyncio
    async def test_schema_violation_raises_invalid_output(self, tmp_path, minimal_jpeg):
        """Kaputtes JSON darf ebenfalls nicht als ValueError (→ 400) entweichen."""
        from app.services.ocr_service import OcrError, extract_recipes_from_images

        page_two = tmp_path / "seite-2.jpg"
        page_two.write_bytes(minimal_jpeg.read_bytes())
        response = MagicMock()
        response.text = '{"title": "Rösti", "ingredients": "keine Liste"'
        with patch("app.services._utils.get_gemini_client", return_value=_client_returning(response)):
            with pytest.raises(OcrError) as excinfo:
                await extract_recipes_from_images([str(minimal_jpeg), str(page_two)], "fake-key")
        assert excinfo.value.code == "invalid_output"


class TestOwnWordsRule:
    """Die Umformulierungsregel ist die eigentliche Abhilfe gegen den Rezitationsfilter."""

    def test_both_prompts_demand_own_words(self):
        from app.services.ocr_service import _OCR_MULTIPAGE_PROMPT, _OCR_PROMPT, _OWN_WORDS_RULE

        assert "EIGENEN WORTEN" in _OWN_WORDS_RULE
        assert _OWN_WORDS_RULE in _OCR_PROMPT
        assert _OWN_WORDS_RULE in _OCR_MULTIPAGE_PROMPT.format(page_count=3)
        # Der fachliche Inhalt bleibt ausdrücklich vollständig — kein Freibrief zum Kürzen.
        assert "vollständig erhalten" in _OWN_WORDS_RULE
