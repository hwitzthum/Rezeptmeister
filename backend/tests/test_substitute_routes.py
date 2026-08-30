"""
Ersatz-Assistent: Prompt, Nachbearbeitung, Route und Fehler-Mapping.
Gemini wird auf Router-Ebene gemockt (wie in test_suggest_routes.py).
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.services.substitution_service import (
    Substitute,
    SubstituteRequest,
    SubstituteResponse,
    build_substitute_prompt,
    normalize_substitutes,
)
from tests.conftest import TEST_INTERNAL_SECRET


def make_request(**overrides) -> SubstituteRequest:
    defaults = dict(
        ingredient="Crème fraîche",
        amount=2.0,
        unit="dl",
        recipe_title="Zürcher Geschnetzeltes",
        other_ingredients=["Kalbfleisch", "Champignons", "Weisswein"],
        dietary=[],
        reason="habe ich nicht",
    )
    defaults.update(overrides)
    return SubstituteRequest(**defaults)


def make_response(n: int = 3) -> SubstituteResponse:
    return SubstituteResponse(
        substitutes=[
            Substitute(name=f"Ersatz {i}", amount_hint="2 dl", effect="Etwas dünner.", confidence="gut")
            for i in range(n)
        ],
        note="",
    )


class TestPrompt:
    def test_prompt_nennt_zutat_menge_rezept_und_kontext(self):
        prompt = build_substitute_prompt(make_request())
        assert "2 dl Crème fraîche" in prompt
        assert "Zürcher Geschnetzeltes" in prompt
        assert "Champignons" in prompt
        assert "habe ich nicht" in prompt
        assert "genau 3" in prompt
        assert "ss» statt «ß" in prompt

    def test_prompt_traegt_einschraenkungen_als_zwingend(self):
        prompt = build_substitute_prompt(make_request(dietary=["Vegan", "Laktosefrei"]))
        assert "zwingend" in prompt
        assert "Vegan, Laktosefrei" in prompt

    def test_prompt_ohne_menge_und_rezept(self):
        prompt = build_substitute_prompt(
            make_request(amount=None, unit="", recipe_title="", other_ingredients=[], reason="")
        )
        assert "Ersatz für «Crème fraîche»." in prompt
        assert "GRUND" not in prompt
        assert "WEITERE ZUTATEN" not in prompt


class TestNormalize:
    def test_klemmt_vertrauen_und_kuerzt_auf_drei(self):
        raw = make_response(5)
        raw.substitutes[0].confidence = "Gut"
        raw.substitutes[1].confidence = "sehr gut"
        raw.substitutes[2].confidence = "Notlösung"
        result = normalize_substitutes(raw)
        assert len(result.substitutes) == 3
        assert [s.confidence for s in result.substitutes] == ["gut", "brauchbar", "notloesung"]

    def test_verwirft_leere_namen(self):
        raw = make_response(3)
        raw.substitutes[1].name = "   "
        result = normalize_substitutes(raw)
        assert len(result.substitutes) == 2


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


async def _post(app, payload, key="test-key"):
    headers = {"X-Internal-Token": TEST_INTERNAL_SECRET}
    if key:
        headers["X-Gemini-Api-Key"] = key
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/ai/substitute", json=payload, headers=headers)


PAYLOAD = {
    "ingredient": "Crème fraîche",
    "amount": 2,
    "unit": "dl",
    "recipe_title": "Zürcher Geschnetzeltes",
    "other_ingredients": ["Kalbfleisch"],
    "dietary": [],
    "reason": "habe ich nicht",
}


class TestRoute:
    async def test_liefert_drei_ersatz(self, app):
        mock = AsyncMock(return_value=make_response())
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 200
        body = response.json()
        assert len(body["substitutes"]) == 3
        assert body["substitutes"][0]["confidence"] == "gut"
        # Prompt trug Zutat und Kontext zum Modell
        assert "Crème fraîche" in mock.await_args_list[0].args[0]

    async def test_ohne_schluessel_400(self, app):
        response = await _post(app, PAYLOAD, key=None)
        assert response.status_code == 400

    async def test_unbekannter_fehler_502(self, app):
        with patch("app.routers.ai.generate_structured", AsyncMock(side_effect=RuntimeError("kaputt"))):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 502

    async def test_quota_wird_zu_429_mit_kuratierter_meldung(self, app):
        from google.genai import errors as genai_errors

        exc = genai_errors.ClientError(429, {"error": {"message": "RESOURCE_EXHAUSTED"}})
        with patch("app.routers.ai.generate_structured", AsyncMock(side_effect=exc)):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 429
        assert response.json()["detail"]["code"] == "quota"
        assert "Kontingent" in response.json()["detail"]["message"]

    async def test_ungueltiger_schluessel_wird_zu_400(self, app):
        from google.genai import errors as genai_errors

        exc = genai_errors.ClientError(403, {"error": {"message": "PERMISSION_DENIED"}})
        with patch("app.routers.ai.generate_structured", AsyncMock(side_effect=exc)):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "invalid_key"

    async def test_leere_liste_502(self, app):
        with patch("app.routers.ai.generate_structured", AsyncMock(return_value=make_response(0))):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 502
