"""
Tests für den Embedding-Service.
Mock-basiert – kein echter Gemini-API-Aufruf erforderlich.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_mock_client(values: list[float] | None = None):
    """Erstellt einen Mock-genai-Client der ein Embedding zurückgibt."""
    if values is None:
        values = [0.1] * 3072
    mock_embedding = MagicMock()
    mock_embedding.values = values
    mock_result = MagicMock()
    mock_result.embeddings = [mock_embedding]
    mock_client = MagicMock()
    mock_client.aio.models.embed_content = AsyncMock(return_value=mock_result)
    return mock_client


# Patch via Modul-Referenz — da die Services _utils.get_gemini_client() aufrufen,
# muss auf das Attribut im _utils-Modul gepatcht werden.
_PATCH = "app.services._utils.get_gemini_client"


class TestEmbedText:
    @pytest.mark.asyncio
    async def test_returns_list_of_floats(self):
        mock_client = _make_mock_client()
        with patch(_PATCH, return_value=mock_client):
            from app.services.embedding_service import embed_text
            result = await embed_text("Schnitzel mit Pommes", "fake-api-key")

        assert isinstance(result, list)
        assert len(result) == 3072
        assert all(isinstance(v, float) for v in result)

    @pytest.mark.asyncio
    async def test_document_prefix_added(self):
        mock_client = _make_mock_client()
        with patch(_PATCH, return_value=mock_client):
            from app.services.embedding_service import embed_text
            await embed_text("Schnitzel", "key", is_query=False)

        call_kwargs = mock_client.aio.models.embed_content.call_args
        assert "search_document: Schnitzel" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_query_prefix_added(self):
        mock_client = _make_mock_client()
        with patch(_PATCH, return_value=mock_client):
            from app.services.embedding_service import embed_text
            await embed_text("vegetarische Rezepte", "key", is_query=True)

        call_kwargs = mock_client.aio.models.embed_content.call_args
        assert "search_query: vegetarische Rezepte" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_uses_correct_model(self):
        mock_client = _make_mock_client()
        with patch(_PATCH, return_value=mock_client):
            from app.services.embedding_service import embed_text
            from app.config import get_settings
            await embed_text("test", "key")

        call_kwargs = mock_client.aio.models.embed_content.call_args
        assert get_settings().gemini_embedding_model in str(call_kwargs)


class TestEmbedImage:
    @pytest.mark.asyncio
    async def test_raises_on_missing_file(self):
        from app.services.embedding_service import embed_image
        with pytest.raises(FileNotFoundError):
            await embed_image("/nonexistent/path/image.jpg", "fake-key")

    @pytest.mark.asyncio
    async def test_calls_embed_with_image_bytes(self, minimal_jpeg):
        mock_client = _make_mock_client()
        with patch(_PATCH, return_value=mock_client):
            from app.services.embedding_service import embed_image
            result = await embed_image(str(minimal_jpeg), "key")

        assert isinstance(result, list)
        assert len(result) == 3072


class TestBatchEmbedTexts:
    @pytest.mark.asyncio
    async def test_returns_multiple_embeddings(self):
        mock_client = _make_mock_client()
        with patch(_PATCH, return_value=mock_client):
            from app.services.embedding_service import batch_embed_texts
            results = await batch_embed_texts(["Rezept A", "Rezept B", "Rezept C"], "key")

        assert len(results) == 3
        for r in results:
            assert len(r) == 3072
