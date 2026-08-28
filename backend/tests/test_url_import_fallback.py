"""
Tests für den Gemini-Fallback im URL-Import.

Hintergrund: Seiten hinter Bot-Management (Cloudflare & Co.) antworten
Rechenzentrums-IPs pauschal mit 403 — unabhängig von den gesendeten Headern.
Der direkte Abruf scheiterte deshalb hart und der Import brach mit einer
generischen Fehlermeldung ab. Diese Tests sichern den Ausweichpfad über
Geminis `url_context`-Tool sowie die kuratierten Fehlermeldungen ab.
"""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from google.genai import types

from app.services.ocr_service import OcrIngredient, OcrResult
from app.services.url_import_service import UrlImportError, fetch_and_parse

_URL = "https://www.beispiel.ch/rezepte/muffins"


def _forbidden_response() -> httpx.Response:
    return httpx.Response(
        403, request=httpx.Request("GET", _URL), text="<html>blocked</html>"
    )


def _gemini_response(text: str, status) -> object:
    """Minimale Nachbildung der genai-Antwort mit url_context_metadata."""

    class _Candidate:
        url_context_metadata = types.UrlContextMetadata(
            url_metadata=[
                types.UrlMetadata(retrieved_url=_URL, url_retrieval_status=status)
            ]
        )

    class _Response:
        candidates = [_Candidate()]

    _Response.text = text
    return _Response()


def _recipe() -> OcrResult:
    return OcrResult(
        title="Cottage-Cheese-Ei-Muffins",
        ingredients=[OcrIngredient(amount=200.0, unit="g", name="Hüttenkäse")],
        instructions="1. Alles verrühren.\n2. Backen.",
        source_type="image_ocr",
    )


@pytest.mark.asyncio
class TestBlockedPageFallback:
    async def test_403_faellt_auf_gemini_url_context_zurueck(self):
        """Ein 403 beendet den Import nicht mehr, sondern führt über Gemini weiter."""
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(
                    side_effect=httpx.HTTPStatusError(
                        "403 Forbidden",
                        request=httpx.Request("GET", _URL),
                        response=_forbidden_response(),
                    )
                ),
            ),
            patch(
                "app.services.url_import_service.get_gemini_client"
            ) as mock_client,
            patch(
                "app.services.url_import_service.generate_structured",
                AsyncMock(return_value=_recipe()),
            ) as mock_structured,
        ):
            mock_client.return_value.aio.models.generate_content = AsyncMock(
                return_value=_gemini_response(
                    "Cottage-Cheese-Ei-Muffins\n200 g Hüttenkäse\n1. Alles verrühren.",
                    types.UrlRetrievalStatus.URL_RETRIEVAL_STATUS_SUCCESS,
                )
            )
            result = await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        assert result.title == "Cottage-Cheese-Ei-Muffins"
        assert result.source_type == "web_import"
        # Der von Gemini geholte Seitentext muss in die Extraktion eingeflossen sein.
        assert "Hüttenkäse" in mock_structured.await_args.args[0]

    async def test_404_verbraucht_keinen_ki_aufruf(self):
        """Eine nicht existierende Seite bricht sofort ab, statt Tokens zu verbrennen."""
        not_found = httpx.Response(404, request=httpx.Request("GET", _URL))
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(
                    side_effect=httpx.HTTPStatusError(
                        "404", request=httpx.Request("GET", _URL), response=not_found
                    )
                ),
            ),
            patch(
                "app.services.url_import_service.get_gemini_client"
            ) as mock_client,
        ):
            with pytest.raises(UrlImportError) as exc:
                await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        assert exc.value.code == "not_found"
        mock_client.assert_not_called()

    async def test_paywall_liefert_eigene_meldung(self):
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(side_effect=httpx.ConnectTimeout("timeout")),
            ),
            patch(
                "app.services.url_import_service.get_gemini_client"
            ) as mock_client,
        ):
            mock_client.return_value.aio.models.generate_content = AsyncMock(
                return_value=_gemini_response(
                    "", types.UrlRetrievalStatus.URL_RETRIEVAL_STATUS_PAYWALL
                )
            )
            with pytest.raises(UrlImportError) as exc:
                await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        assert exc.value.code == "paywall"
        assert "Bezahlschranke" in exc.value.message

    async def test_gemini_abrufstatus_fehler_wird_nicht_halluziniert(self):
        """Schlägt auch Gemini fehl, darf keine Fehlerseite als Rezept durchgehen."""
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(side_effect=httpx.ConnectError("blocked")),
            ),
            patch(
                "app.services.url_import_service.get_gemini_client"
            ) as mock_client,
            patch(
                "app.services.url_import_service.generate_structured",
                AsyncMock(return_value=_recipe()),
            ) as mock_structured,
        ):
            mock_client.return_value.aio.models.generate_content = AsyncMock(
                return_value=_gemini_response(
                    "Sorry, you have been blocked",
                    types.UrlRetrievalStatus.URL_RETRIEVAL_STATUS_ERROR,
                )
            )
            with pytest.raises(UrlImportError) as exc:
                await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        assert exc.value.code == "blocked"
        mock_structured.assert_not_awaited()


@pytest.mark.asyncio
class TestDirectPath:
    async def test_jsonld_bleibt_der_bevorzugte_pfad(self):
        """Ist die Seite direkt erreichbar, wird kein KI-Aufruf verbraucht."""
        html = """
        <html><head><script type="application/ld+json">
        {"@type":"Recipe","name":"Zürcher Geschnetzeltes",
         "recipeIngredient":["400 g Kalbfleisch","2 dl Rahm"],
         "recipeInstructions":["Fleisch anbraten.","Rahm zugeben."],
         "recipeYield":"4"}
        </script></head><body></body></html>
        """
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(return_value=html),
            ),
            patch(
                "app.services.url_import_service.generate_structured",
                AsyncMock(),
            ) as mock_structured,
        ):
            result = await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        assert result.title == "Zürcher Geschnetzeltes"
        assert result.servings == 4
        assert len(result.ingredients) == 2
        mock_structured.assert_not_awaited()

    async def test_kein_jsonld_nutzt_seitentext(self):
        """Direkt erreichbar, aber ohne JSON-LD → Textextraktion, kein url_context."""
        html = "<html><body><h1>Rösti</h1><p>500 g Kartoffeln</p></body></html>"
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(return_value=html),
            ),
            patch(
                "app.services.url_import_service.get_gemini_client"
            ) as mock_client,
            patch(
                "app.services.url_import_service.generate_structured",
                AsyncMock(return_value=_recipe()),
            ) as mock_structured,
        ):
            await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        mock_client.assert_not_called()
        assert "Kartoffeln" in mock_structured.await_args.args[0]

    async def test_unsichere_bild_url_der_ki_wird_verworfen(self):
        recipe = _recipe()
        recipe.image_url = "javascript:alert(1)"
        with (
            patch(
                "app.services.url_import_service._is_safe_url",
                AsyncMock(return_value=True),
            ),
            patch(
                "app.services.url_import_service._fetch_page_html",
                AsyncMock(return_value="<html><body>Rösti</body></html>"),
            ),
            patch(
                "app.services.url_import_service.generate_structured",
                AsyncMock(return_value=recipe),
            ),
        ):
            result = await fetch_and_parse(_URL, "key", "gemini-3.6-flash")

        assert result.image_url is None
