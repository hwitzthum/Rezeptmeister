"""
Integrationstests für die Embedding-API-Routen.
Testet das HTTP-Verhalten ohne echte Gemini-API-Aufrufe.
app.database und pgvector werden via conftest.py gemockt wenn sie fehlen.

Hinweis zum Patching:
  BackgroundTasks.add_task wird gepatcht (nicht der Funktionsname im Modul),
  da add_task eine Referenz auf das Funktionsobjekt hält — ein Patch auf den
  Modulnamen würde die bereits gebundene Referenz nicht ersetzen.
"""

import uuid
import pytest

from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def app():
    from app.main import app as fastapi_app
    return fastapi_app


class TestEmbedTextEndpoint:
    @pytest.mark.asyncio
    async def test_returns_204_with_api_key(self, app):
        """Gibt 204 zurück wenn API-Key vorhanden (Background Task wird registriert)."""
        recipe_id = str(uuid.uuid4())

        with patch("fastapi.BackgroundTasks.add_task") as mock_add:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(
                    "/embed/text",
                    json={"recipe_id": recipe_id, "text": "Schnitzel mit Pommes"},
                    headers={
                        "X-Gemini-API-Key": "fake-key",
                        "X-Internal-Token": "test-secret",
                    },
                )
        assert res.status_code == 204
        mock_add.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_204_without_api_key(self, app):
        """Gibt 204 ohne Aktion zurück wenn kein API-Key (kein Fehler, kein Task)."""
        recipe_id = str(uuid.uuid4())

        with patch("fastapi.BackgroundTasks.add_task") as mock_add:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(
                    "/embed/text",
                    json={"recipe_id": recipe_id, "text": "test"},
                    headers={"X-Internal-Token": "test-secret"},
                )
        assert res.status_code == 204
        mock_add.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_422_on_invalid_uuid(self, app):
        """Gibt 422 zurück bei ungültiger recipe_id."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/embed/text",
                json={"recipe_id": "not-a-uuid", "text": "test"},
                headers={"X-Internal-Token": "test-secret", "X-Gemini-API-Key": "fake-key"},
            )
        assert res.status_code == 422


class TestEmbedImageEndpoint:
    @pytest.mark.asyncio
    async def test_returns_204_with_api_key(self, app):
        image_id = str(uuid.uuid4())

        with patch("fastapi.BackgroundTasks.add_task") as mock_add:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(
                    "/embed/image",
                    json={"image_id": image_id},
                    headers={
                        "X-Gemini-API-Key": "fake-key",
                        "X-Internal-Token": "test-secret",
                    },
                )
        assert res.status_code == 204
        mock_add.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_204_without_api_key(self, app):
        image_id = str(uuid.uuid4())

        with patch("fastapi.BackgroundTasks.add_task") as mock_add:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(
                    "/embed/image",
                    json={"image_id": image_id},
                    headers={"X-Internal-Token": "test-secret"},
                )
        assert res.status_code == 204
        mock_add.assert_not_called()


class TestEmbedMultimodalEndpoint:
    @pytest.mark.asyncio
    async def test_returns_204_with_image(self, app):
        recipe_id = str(uuid.uuid4())
        image_id = str(uuid.uuid4())

        with patch("fastapi.BackgroundTasks.add_task") as mock_add:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(
                    "/embed/multimodal",
                    json={"recipe_id": recipe_id, "text": "Lasagne", "image_id": image_id},
                    headers={
                        "X-Gemini-API-Key": "fake-key",
                        "X-Internal-Token": "test-secret",
                    },
                )
        assert res.status_code == 204
        mock_add.assert_called_once()

    @pytest.mark.asyncio
    async def test_returns_204_without_image_falls_back_to_text(self, app):
        recipe_id = str(uuid.uuid4())

        with patch("fastapi.BackgroundTasks.add_task") as mock_add:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                res = await client.post(
                    "/embed/multimodal",
                    json={"recipe_id": recipe_id, "text": "Lasagne"},
                    headers={
                        "X-Gemini-API-Key": "fake-key",
                        "X-Internal-Token": "test-secret",
                    },
                )
        assert res.status_code == 204
        mock_add.assert_called_once()
