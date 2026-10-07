"""
Tests für POST /ai/generate-image — Modellaufruf und Auswahl des Bild-Parts.

Der Gemini-Aufruf ist gemockt. Jede Antwort enthält nur ein Denk-Bild, also
endet die Route nach drei Versuchen mit 502, bevor Speicher oder Datenbank
berührt werden — diese Tests brauchen keine Datenbank.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import TEST_INTERNAL_SECRET


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


def _client_mit_denkbild():
    part = MagicMock()
    part.inline_data.data = b"entwurf"
    part.thought = True
    part.text = None
    response = MagicMock()
    response.candidates[0].content.parts = [part]
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(return_value=response)
    return client


@pytest.mark.asyncio
async def test_denkbild_wird_nicht_gespeichert_und_denkstufe_minimal(app):
    from app.config import get_settings

    gemini = _client_mit_denkbild()
    with patch("app.routers.ai.get_gemini_client", return_value=gemini):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            res = await c.post(
                "/ai/generate-image",
                json={
                    "recipe_id": str(uuid.uuid4()),
                    "title": "Zürcher Geschnetzeltes",
                    "ingredients": ["Kalbfleisch", "Rahm"],
                    "user_id": str(uuid.uuid4()),
                },
                headers={
                    "X-Gemini-Api-Key": "test-key",
                    "X-Internal-Token": TEST_INTERNAL_SECRET,
                },
            )

    assert res.status_code == 502
    calls = gemini.aio.models.generate_content.call_args_list
    assert len(calls) == 3
    kwargs = calls[0].kwargs
    assert kwargs["model"] == get_settings().gemini_image_gen_model == "gemini-nano-banana-2.1"
    config = kwargs["config"]
    assert config.thinking_config.thinking_level.value.lower() == "minimal"
    assert config.temperature is None
