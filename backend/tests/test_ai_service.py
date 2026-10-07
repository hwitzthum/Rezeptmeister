"""
Tests für generate_structured.
Google lehnt temperature, top_p, top_k und thinking_budget bei neuen
Gemini-Modellen mit 400 INVALID_ARGUMENT ab — der Config darf sie nie enthalten.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import BaseModel

from app.services.ai_service import generate_structured


class _Antwort(BaseModel):
    text: str


def _client():
    response = MagicMock()
    response.parsed = _Antwort(text="ok")
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(return_value=response)
    return client


@pytest.mark.asyncio
@pytest.mark.parametrize("thinking_level", [None, "low"])
async def test_config_ohne_sampling_parameter(thinking_level):
    client = _client()
    with patch("app.services.ai_service.get_gemini_client", return_value=client):
        await generate_structured(
            "prompt", _Antwort, "key", "gemini-3.6-flash", thinking_level=thinking_level
        )

    config = client.aio.models.generate_content.call_args.kwargs["config"]
    assert config.temperature is None
    assert config.top_p is None
    assert config.top_k is None
    if thinking_level is None:
        assert config.thinking_config is None
    else:
        assert config.thinking_config.thinking_level.value.lower() == thinking_level
        assert config.thinking_config.thinking_budget is None
