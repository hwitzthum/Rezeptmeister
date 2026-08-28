"""
Tests für POST /ai/suggest — Prompt-Aufbau, Qualitätsschranke, Nachschlag.

Der Gemini-Aufruf ist gemockt; geprüft wird, was der Dienst daraus macht:
Kommt der Kontext im Prompt an? Erkennt die Prüfung schlechte Antworten?
Wird genau einmal nachgefordert? Diese Tests brauchen keine Datenbank —
das Geschmacksprofil entsteht auf der Next.js-Seite und kommt als Nutzlast.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from tests.conftest import TEST_INTERNAL_SECRET
from app.services.suggestion_service import (
    ANZAHL_VORSCHLAEGE,
    RecipeSuggestion,
    SuggestRequest,
    SuggestResponse,
    TasteProfile,
    WertAnzahl,
    build_retry_prompt,
    build_suggest_prompt,
    drop_unusable,
    find_quality_issues,
    normalize_suggestions,
)


# ── Testdaten ─────────────────────────────────────────────────────────────────


def make_profile() -> TasteProfile:
    return TasteProfile(
        vorhandeneTitel=["Berner Rösti", "Basler Mehlsuppe", "Zopf"],
        favoritenTitel=["Berner Rösti"],
        bestbewerteteTitel=["Basler Mehlsuppe"],
        haeufigsteKuechen=[WertAnzahl(wert="Schweizer", anzahl=12)],
        haeufigsteKategorien=[WertAnzahl(wert="Hauptgang", anzahl=9)],
        haeufigsteZutaten=["butter", "zwiebeln"],
        haeufigsteTags=["vegetarisch"],
        rezeptAnzahl=14,
    )


def make_request(**overrides) -> SuggestRequest:
    defaults = dict(
        ingredients=["Federkohl"],
        cuisine="",
        time_budget_minutes=45,
        dietary=["Vegetarisch"],
        season="Herbst",
        season_month="Oktober",
        seasonal_ingredients=["Kürbis", "Quitten"],
        seasonal_occasions=["Wildsaison"],
        exclude_titles=["Kürbisgratin"],
        taste_profile=make_profile(),
    )
    defaults.update(overrides)
    return SuggestRequest(**defaults)


def make_suggestion(
    index: int,
    title: str,
    *,
    why: str = "Ergänzt die Schweizer Küche deiner Sammlung um eine Süsswasserkomponente.",
    highlight: str = "Der Fisch wird nur in Butter geschwenkt, nie mehliert.",
    cuisine: str = "Schweizer",
    key_ingredients: list[str] | None = None,
    difficulty: str = "mittel",
) -> RecipeSuggestion:
    return RecipeSuggestion(
        id=index,
        title=title,
        description="Ein Gericht. Es schmeckt gut.",
        why_it_fits=why,
        highlight=highlight,
        key_ingredients=key_ingredients if key_ingredients is not None else ["Fisch", "Butter", "Zitrone"],
        missing_ingredients=["Fisch"],
        cuisine=cuisine,
        category="Hauptgang",
        time_estimate_minutes=40,
        difficulty=difficulty,
    )


def make_five(titles: list[str] | None = None) -> list[RecipeSuggestion]:
    titles = titles or ["Egli-Filet", "Randenrisotto", "Zwetschgenwähe", "Wildgeschnetzeltes", "Kefenpfanne"]
    kuechen = ["Schweizer", "Italienisch", "Französisch", "Deutsch", "Asiatisch"]
    return [
        make_suggestion(i + 1, t, cuisine=kuechen[i % len(kuechen)])
        for i, t in enumerate(titles)
    ]


# ── Prompt ────────────────────────────────────────────────────────────────────


class TestPrompt:
    def test_nennt_die_sammlung_als_ausschluss(self):
        prompt = build_suggest_prompt(make_request())
        assert "Berner Rösti" in prompt
        assert "Basler Mehlsuppe" in prompt
        assert "keine blosse Variante" in prompt

    def test_nennt_favoriten_und_haeufigste_kuechen(self):
        prompt = build_suggest_prompt(make_request())
        assert "Als Favorit markiert" in prompt
        assert "Schweizer (12)" in prompt

    def test_nennt_saison_konkret_statt_allgemein(self):
        prompt = build_suggest_prompt(make_request())
        assert "Oktober" in prompt
        assert "Kürbis" in prompt
        assert "Quitten" in prompt
        assert "Wildsaison" in prompt

    def test_nennt_die_ausschlussliste_des_letzten_durchlaufs(self):
        prompt = build_suggest_prompt(make_request())
        assert "Kürbisgratin" in prompt

    def test_fordert_alle_felder_und_verbietet_klischees(self):
        prompt = build_suggest_prompt(make_request())
        assert f"Genau {ANZAHL_VORSCHLAEGE} Vorschläge" in prompt
        assert "keine leeren Listen" in prompt
        assert "Spaghetti Bolognese" in prompt
        assert "why_it_fits" in prompt
        assert "highlight" in prompt

    def test_verlangt_schweizer_schreibweise(self):
        prompt = build_suggest_prompt(make_request())
        assert "'ss'" in prompt and "'ß'" in prompt

    def test_kommt_ohne_profil_aus(self):
        # Ein frisches Konto hat noch keine Sammlung — der Prompt muss trotzdem stehen.
        prompt = build_suggest_prompt(make_request(taste_profile=None, exclude_titles=[]))
        assert f"Genau {ANZAHL_VORSCHLAEGE} Vorschläge" in prompt
        assert "DIE SAMMLUNG DIESER PERSON" not in prompt

    def test_nachschlag_benennt_die_beanstandungen(self):
        basis = build_suggest_prompt(make_request())
        retry = build_retry_prompt(basis, ["Nur 3 statt 5 Vorschläge."])
        assert basis in retry
        assert "Nur 3 statt 5 Vorschläge." in retry
        assert "vollständig neue Antwort" in retry


# ── Qualitätsschranke ─────────────────────────────────────────────────────────


class TestQualitaet:
    def test_saubere_antwort_wird_nicht_beanstandet(self):
        assert find_quality_issues(make_five(), make_request()) == []

    def test_erkennt_zu_wenige_vorschlaege(self):
        issues = find_quality_issues(make_five()[:3], make_request())
        assert any("nur 3" in i for i in issues)

    def test_erkennt_wiederholung_aus_der_sammlung(self):
        vorschlaege = make_five(["Berner Rösti", "A", "B", "C", "D"])
        issues = find_quality_issues(vorschlaege, make_request())
        assert any("Berner Rösti" in i for i in issues)

    def test_erkennt_wiederholung_trotz_abweichender_schreibweise(self):
        # "berner roesti" ist dasselbe Gericht — der Vergleich muss das sehen.
        vorschlaege = make_five(["berner roesti!", "A", "B", "C", "D"])
        issues = find_quality_issues(vorschlaege, make_request())
        assert any("berner roesti" in i.lower() for i in issues)

    def test_erkennt_ausgeschlossenen_titel_des_letzten_durchlaufs(self):
        vorschlaege = make_five(["Kürbisgratin", "A", "B", "C", "D"])
        issues = find_quality_issues(vorschlaege, make_request())
        assert any("Kürbisgratin" in i for i in issues)

    def test_erkennt_doppelte_innerhalb_der_antwort(self):
        vorschlaege = make_five(["A", "A", "B", "C", "D"])
        issues = find_quality_issues(vorschlaege, make_request())
        assert any("Mehrfach vorgeschlagen" in i for i in issues)

    def test_erkennt_fehlende_pflichtangaben(self):
        vorschlaege = make_five()
        vorschlaege[0].why_it_fits = "   "
        vorschlaege[1].key_ingredients = []
        issues = find_quality_issues(vorschlaege, make_request())
        assert any("Pflichtangaben" in i for i in issues)

    def test_erkennt_haeufung_derselben_kueche(self):
        vorschlaege = [
            make_suggestion(i + 1, f"Gericht {i}", cuisine="Italienisch")
            for i in range(5)
        ]
        issues = find_quality_issues(vorschlaege, make_request())
        assert any("derselben Küche" in i for i in issues)

    def test_normalisierung_faengt_unbekannte_schwierigkeit_ab(self):
        vorschlaege = make_five()
        vorschlaege[0].difficulty = "Sehr schwer"
        vorschlaege[1].difficulty = "EINFACH"
        normalize_suggestions(vorschlaege)
        assert vorschlaege[0].difficulty == "mittel"
        assert vorschlaege[1].difficulty == "einfach"

    def test_aussortieren_behaelt_nur_brauchbares(self):
        vorschlaege = make_five(["Berner Rösti", "Egli-Filet", "Egli-Filet", "Neu", "Auch neu"])
        behalten = drop_unusable(vorschlaege, make_request())
        titel = [s.title for s in behalten]
        assert "Berner Rösti" not in titel
        assert titel.count("Egli-Filet") == 1
        assert len(titel) == 3


# ── Route ─────────────────────────────────────────────────────────────────────


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


async def _post(app, payload):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post(
            "/ai/suggest",
            json=payload,
            headers={
                "X-Gemini-Api-Key": "test-key",
                "X-Internal-Token": TEST_INTERNAL_SECRET,
            },
        )


BASE_PAYLOAD = {
    "ingredients": ["Federkohl"],
    "time_budget_minutes": 45,
    "season_month": "Oktober",
    "seasonal_ingredients": ["Kürbis"],
    "taste_profile": {
        "vorhandeneTitel": ["Berner Rösti"],
        "favoritenTitel": ["Berner Rösti"],
        "bestbewerteteTitel": [],
        "haeufigsteKuechen": [{"wert": "Schweizer", "anzahl": 12}],
        "haeufigsteKategorien": [],
        "haeufigsteZutaten": ["butter"],
        "haeufigsteTags": [],
        "rezeptAnzahl": 14,
    },
}


class TestRoute:
    @pytest.mark.asyncio
    async def test_ohne_schluessel_abgewiesen(self, app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/ai/suggest",
                json=BASE_PAYLOAD,
                headers={"X-Internal-Token": TEST_INTERNAL_SECRET},
            )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_saubere_antwort_geht_ohne_nachschlag_durch(self, app):
        mock = AsyncMock(return_value=SuggestResponse(suggestions=make_five()))
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, BASE_PAYLOAD)
        assert response.status_code == 200
        assert len(response.json()["suggestions"]) == ANZAHL_VORSCHLAEGE
        assert mock.await_count == 1

    @pytest.mark.asyncio
    async def test_fehlerhafte_antwort_loest_genau_einen_nachschlag_aus(self, app):
        schlecht = SuggestResponse(suggestions=make_five(["Berner Rösti", "A", "B", "C", "D"]))
        gut = SuggestResponse(suggestions=make_five())
        mock = AsyncMock(side_effect=[schlecht, gut])
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, BASE_PAYLOAD)
        assert response.status_code == 200
        assert mock.await_count == 2
        titel = [s["title"] for s in response.json()["suggestions"]]
        assert "Berner Rösti" not in titel

    @pytest.mark.asyncio
    async def test_zweiter_fehlversuch_wird_gefiltert_statt_ausgeliefert(self, app):
        schlecht = SuggestResponse(suggestions=make_five(["Berner Rösti", "A", "B", "C", "D"]))
        mock = AsyncMock(side_effect=[schlecht, schlecht])
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, BASE_PAYLOAD)
        assert response.status_code == 200
        assert mock.await_count == 2
        titel = [s["title"] for s in response.json()["suggestions"]]
        assert "Berner Rösti" not in titel
        assert len(titel) == 4

    @pytest.mark.asyncio
    async def test_nummerierung_bleibt_nach_dem_filtern_luecklos(self, app):
        schlecht = SuggestResponse(suggestions=make_five(["Berner Rösti", "A", "B", "C", "D"]))
        mock = AsyncMock(side_effect=[schlecht, schlecht])
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, BASE_PAYLOAD)
        ids = [s["id"] for s in response.json()["suggestions"]]
        assert ids == list(range(1, len(ids) + 1))

    @pytest.mark.asyncio
    async def test_prompt_traegt_profil_und_saison_zum_modell(self, app):
        mock = AsyncMock(return_value=SuggestResponse(suggestions=make_five()))
        with patch("app.routers.ai.generate_structured", mock):
            await _post(app, BASE_PAYLOAD)
        prompt = mock.await_args_list[0].args[0]
        assert "Berner Rösti" in prompt
        assert "Oktober" in prompt
        assert "Kürbis" in prompt
        assert "Federkohl" in prompt

    @pytest.mark.asyncio
    async def test_ausfall_des_ki_dienstes_wird_als_502_gemeldet(self, app):
        mock = AsyncMock(side_effect=RuntimeError("Zeitüberschreitung"))
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, BASE_PAYLOAD)
        assert response.status_code == 502
