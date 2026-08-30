"""
KI-Wochenplan: Prompt, Qualitätsschranke, Reparatur/Auffüllen, Route.
Gemini wird auf Router-Ebene gemockt.
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.services.plan_week_service import (
    PlanCandidate,
    PlanEntry,
    PlanSlot,
    PlanWeekRequest,
    PlanWeekResponse,
    build_plan_prompt,
    build_retry_prompt,
    find_plan_issues,
    repair_plan,
)
from tests.conftest import TEST_INTERNAL_SECRET


def cand(i, t, *, k=None, m=None, p=4, v=0, d=None, n=0, f=0, r=None):
    return PlanCandidate(i=i, t=t, k=k, m=m, p=p, v=v, d=d, n=n, f=f, r=r)


CANDIDATES = [
    cand(0, "Älplermagronen", k="Schweizer", m=45, p=4, v=1, d=90, n=3),
    cand(1, "Zürcher Geschnetzeltes", k="Schweizer", m=30, p=4, d=10, n=5, f=1),
    cand(2, "Risotto Milanese", k="Italienisch", m=35, p=4, v=1, d=None, n=0),
    cand(3, "Thai-Curry", k="Thailändisch", m=25, p=8, d=40, n=1, r=4.5),
    cand(4, "Lasagne", k="Italienisch", m=90, p=8, d=200, n=2),
    cand(5, "Rösti", k="Schweizer", m=25, p=4, v=1, d=5, n=8),
]


def slots(days=(0, 1, 2), meal="abendessen"):
    return [PlanSlot(day_index=d, meal_type=meal, is_weekday=d <= 4) for d in days]


def make_request(**overrides) -> PlanWeekRequest:
    defaults = dict(
        slots=slots(),
        candidates=CANDIDATES,
        vegetarian_min=1,
        max_minutes_weekday=60,
        vary_cuisine=True,
        use_leftovers=False,
        new_suggestions_max=0,
        wish="",
        season_month="August",
        seasonal_ingredients=["Zucchetti", "Tomaten"],
        day_labels=["Montag 31.08.", "Dienstag 01.09.", "Mittwoch 02.09."],
    )
    defaults.update(overrides)
    return PlanWeekRequest(**defaults)


def entry(day, idx, meal="abendessen", **kw):
    return PlanEntry(day_index=day, meal_type=meal, candidate_index=idx, reason="Passt.", **kw)


class TestPrompt:
    def test_nennt_plaetze_kandidaten_saison_und_regeln(self):
        prompt = build_plan_prompt(make_request(wish="bitte einmal Fisch"))
        assert "Montag 31.08." in prompt
        assert "«Älplermagronen»" in prompt and "d=90" in prompt and "v=1" in prompt
        assert "d=nie" in prompt
        assert "August" in prompt and "Zucchetti" in prompt
        assert "bitte einmal Fisch" in prompt
        assert "Mindestens 1 Plätze" in prompt
        assert "m ≤ 60" in prompt
        assert "derselben Küche" in prompt
        assert "Keine neuen Gerichte" in prompt
        assert "ss» statt «ß" in prompt

    def test_regeln_folgen_den_optionen(self):
        prompt = build_plan_prompt(
            make_request(vegetarian_min=0, max_minutes_weekday=None, vary_cuisine=False, use_leftovers=True, new_suggestions_max=2)
        )
        assert "Mindestens" not in prompt
        assert "Werktagen" not in prompt
        assert "derselben Küche" not in prompt
        assert "Reste" in prompt
        assert "Höchstens 2 Plätze" in prompt

    def test_retry_prompt_nennt_beanstandungen(self):
        assert "Nur 0 vegetarische" in build_retry_prompt("basis", ["Nur 0 vegetarische Plätze"])


class TestSchranke:
    def test_guter_plan_ohne_beanstandung(self):
        plan = [entry(0, 2), entry(1, 1), entry(2, 3)]
        assert find_plan_issues(plan, make_request()) == []

    def test_fehlende_und_fremde_plaetze(self):
        plan = [entry(0, 2), entry(5, 1)]
        issues = find_plan_issues(plan, make_request())
        assert any("nicht verlangt" in i for i in issues)
        assert any("Nicht gefüllte" in i for i in issues)

    def test_doppelter_platz_und_ungueltiger_index(self):
        plan = [entry(0, 2), entry(0, 1), entry(1, 42), entry(2, 3)]
        issues = find_plan_issues(plan, make_request())
        assert any("doppelt belegt" in i for i in issues)
        assert any("42" in i for i in issues)

    def test_doppeltes_rezept_ohne_reste_regel(self):
        plan = [entry(0, 3), entry(1, 3), entry(2, 2)]
        issues = find_plan_issues(plan, make_request())
        assert any("2-mal" in i for i in issues)

    def test_reste_am_folgetag_bei_grossem_rezept_ok(self):
        plan = [entry(0, 3), entry(1, 3, leftover_of_day=0), entry(2, 2)]
        assert not any("2-mal" in i for i in find_plan_issues(plan, make_request(use_leftovers=True)))

    def test_reste_bei_kleinem_rezept_beanstandet(self):
        plan = [entry(0, 1), entry(1, 1, leftover_of_day=0), entry(2, 2)]
        issues = find_plan_issues(plan, make_request(use_leftovers=True, vary_cuisine=False))
        assert any("2-mal" in i for i in issues)

    def test_vegetarisches_defizit(self):
        plan = [entry(0, 1), entry(1, 3), entry(2, 4)]
        issues = find_plan_issues(plan, make_request(vegetarian_min=2, max_minutes_weekday=None))
        assert any("vegetarische" in i for i in issues)

    def test_zeitverstoss_nur_am_werktag(self):
        wochenende = make_request(slots=[PlanSlot(day_index=5, meal_type="abendessen", is_weekday=False)])
        assert not any("Minuten" in i for i in find_plan_issues([entry(5, 4)], wochenende))
        werktag = make_request(slots=slots((0,)), vegetarian_min=0)
        assert any("Minuten" in i for i in find_plan_issues([entry(0, 4)], werktag))

    def test_kuechen_nachbarschaft(self):
        plan = [entry(0, 0), entry(1, 5), entry(2, 2)]
        issues = find_plan_issues(plan, make_request())
        assert any("dieselbe Küche" in i for i in issues)
        assert not any("dieselbe Küche" in i for i in find_plan_issues(plan, make_request(vary_cuisine=False)))

    def test_neue_vorschlaege_nur_wenn_erlaubt(self):
        plan = [
            PlanEntry(day_index=0, meal_type="abendessen", new_title="Fischknusperli", new_description="x"),
            entry(1, 2),
            entry(2, 3),
        ]
        assert any("neue Vorschläge" in i for i in find_plan_issues(plan, make_request()))
        assert not any("neue Vorschläge" in i for i in find_plan_issues(plan, make_request(new_suggestions_max=1)))

    def test_weder_rezept_noch_vorschlag(self):
        plan = [PlanEntry(day_index=0, meal_type="abendessen"), entry(1, 2), entry(2, 3)]
        assert any("weder Rezept" in i for i in find_plan_issues(plan, make_request()))


class TestReparatur:
    def test_fuellt_alle_plaetze_und_meldet_aufgefuellte(self):
        repaired, filled = repair_plan([entry(0, 2)], make_request())
        assert [e.day_index for e in repaired] == [0, 1, 2]
        assert sorted(filled) == ["1-abendessen", "2-abendessen"]
        assert all(e.candidate_index is not None for e in repaired)
        assert find_plan_issues(repaired, make_request()) == []

    def test_entfernt_ungueltiges_und_fuellt_nach(self):
        plan = [entry(0, 42), entry(1, 4), entry(2, 2)]  # 42 gibt es nicht, 4 zu lang am Werktag
        repaired, filled = repair_plan(plan, make_request())
        assert len(repaired) == 3
        assert "0-abendessen" in filled and "1-abendessen" in filled
        assert all(e.candidate_index != 4 for e in repaired)

    def test_bevorzugt_vegi_bei_defizit_und_nie_gekochtes(self):
        req = make_request(slots=slots((0,)), vegetarian_min=1)
        repaired, _ = repair_plan([], req)
        chosen = repaired[0].candidate_index
        assert CANDIDATES[chosen].v == 1
        assert chosen == 2  # Risotto: vegetarisch und nie gekocht
        assert "vegetarisch" in repaired[0].reason or "nie gekocht" in repaired[0].reason

    def test_meidet_vortagskueche(self):
        req = make_request(slots=slots((0, 1)), vegetarian_min=0)
        repaired, _ = repair_plan([entry(0, 2)], req)  # Tag 0 italienisch
        tag1 = CANDIDATES[repaired[1].candidate_index]
        assert tag1.k != "Italienisch"

    def test_wiederholt_bei_zu_kleinem_pool(self):
        req = make_request(slots=slots((0, 1, 2)), candidates=[cand(0, "Einziges", m=20)], vegetarian_min=0)
        repaired, filled = repair_plan([], req)
        assert len(repaired) == 3
        assert all(e.candidate_index == 0 for e in repaired)
        assert any("Wiederholung" in e.reason for e in repaired)

    def test_behaelt_erlaubten_neuen_vorschlag(self):
        plan = [PlanEntry(day_index=0, meal_type="abendessen", new_title="Fischknusperli", new_description="Knusprig.")]
        repaired, _ = repair_plan(plan, make_request(new_suggestions_max=1))
        assert repaired[0].new_title == "Fischknusperli"
        assert repaired[0].candidate_index is None

    def test_verwirft_unerlaubten_neuen_vorschlag(self):
        plan = [PlanEntry(day_index=0, meal_type="abendessen", new_title="Fischknusperli")]
        repaired, filled = repair_plan(plan, make_request())
        assert repaired[0].new_title is None
        assert "0-abendessen" in filled


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


PAYLOAD = make_request().model_dump()


async def _post(app, payload, key="test-key"):
    headers = {"X-Internal-Token": TEST_INTERNAL_SECRET}
    if key:
        headers["X-Gemini-Api-Key"] = key
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/ai/plan-week", json=payload, headers=headers)


def good_plan():
    return PlanWeekResponse(entries=[entry(0, 2), entry(1, 1), entry(2, 3)])


class TestRoute:
    async def test_liefert_vollstaendigen_plan(self, app):
        mock = AsyncMock(return_value=good_plan())
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 200
        body = response.json()
        assert len(body["entries"]) == 3
        assert body["filled_by_fallback"] == []
        assert body["issues_remaining"] == []
        assert mock.await_count == 1
        assert "«Älplermagronen»" in mock.await_args_list[0].args[0]

    async def test_nachschlag_bei_beanstandung_und_auffuellen(self, app):
        schlecht = PlanWeekResponse(entries=[entry(0, 3), entry(1, 3)])  # doppelt, Tag 2 fehlt
        mock = AsyncMock(side_effect=[schlecht, good_plan()])
        with patch("app.routers.ai.generate_structured", mock):
            response = await _post(app, PAYLOAD)
        assert response.status_code == 200
        assert mock.await_count == 2
        assert "ABGELEHNT" in mock.await_args_list[1].args[0]
        assert response.json()["issues_remaining"] == []

    async def test_beide_schlecht_dann_deterministisch_gefuellt(self, app):
        schlecht = PlanWeekResponse(entries=[entry(0, 42)])
        with patch("app.routers.ai.generate_structured", AsyncMock(side_effect=[schlecht, schlecht])):
            response = await _post(app, PAYLOAD)
        body = response.json()
        assert len(body["entries"]) == 3
        assert len(body["filled_by_fallback"]) == 3

    async def test_ohne_schluessel_400(self, app):
        assert (await _post(app, PAYLOAD, key=None)).status_code == 400

    async def test_ohne_kandidaten_und_ohne_neue_400(self, app):
        response = await _post(app, {**PAYLOAD, "candidates": []})
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "no_candidates"

    async def test_gemini_fehler_502(self, app):
        with patch("app.routers.ai.generate_structured", AsyncMock(side_effect=RuntimeError("x"))):
            assert (await _post(app, PAYLOAD)).status_code == 502
