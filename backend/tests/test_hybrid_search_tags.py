"""
Integrationstests: Die Hybridsuche (Volltext + Vektor) kennt die Tags.

Die Tags erzeugt die KI beim Anlegen ("Asiatisch", "Geflügel", "Rind"). Sie
stehen nicht im `fts_vector`, also fand der Volltext-Zweig nie ein Rezept über
seinen Tag. Läuft gegen eine ECHTE PostgreSQL-Instanz (Funktionen
`rm_normalize` und `word_similarity` gibt es nur dort); fehlt sie, werden die
Tests übersprungen. Nur der Gemini-Aufruf ist gemockt.

Der Anfragevektor entspricht VECTOR. Das Ziel-Rezept trägt den entgegen-
gesetzten Vektor und landet im Vektor-Zweig zuletzt; ein Platz an der Spitze
kommt allein vom Tag-Treffer.
"""

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest


def _database_available() -> bool:
    try:
        import asyncpg  # noqa: F401
        from sqlalchemy import text

        from app.database import engine

        async def _ping() -> None:
            try:
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
            finally:
                await engine.dispose()

        asyncio.run(_ping())
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not _database_available(),
    reason="PostgreSQL nicht erreichbar — DB-Integrationstests übersprungen.",
)

VECTOR = [0.1] * 3072
GEGENVEKTOR = [-0.1] * 3072


@pytest.fixture(autouse=True)
async def _dispose_engine():
    yield
    try:
        from app.database import engine

        await engine.dispose()
    except Exception:
        pass


@pytest.fixture
async def seeded():
    from sqlalchemy import text

    from app.database import engine

    ids = SimpleNamespace(
        owner=uuid.uuid4(),
        stranger=uuid.uuid4(),
        wok=uuid.uuid4(),
        gratin=uuid.uuid4(),
        suppe=uuid.uuid4(),
        fremd=uuid.uuid4(),
    )
    rezepte = (
        (ids.wok, ids.owner, "Gemüsepfanne", ["Asiatisch", "Geflügel"], GEGENVEKTOR),
        (ids.gratin, ids.owner, "Kartoffelgratin", ["Vegetarisch"], VECTOR),
        (ids.suppe, ids.owner, "Fischsuppe", [], VECTOR),
        # Fremdes Rezept mit passendem Tag: darf nie erscheinen.
        (ids.fremd, ids.stranger, "Fremdes Curry", ["Asiatisch"], VECTOR),
    )
    async with engine.begin() as conn:
        for uid, label in ((ids.owner, "owner"), (ids.stranger, "stranger")):
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, name, role, status) "
                    "VALUES (:id, :email, :name, 'user', 'approved')"
                ),
                {"id": uid, "email": f"tags-{label}-{uid}@test.invalid", "name": label},
            )
        for rid, uid, title, tags, vec in rezepte:
            await conn.execute(
                text(
                    "INSERT INTO recipes (id, user_id, title, instructions, servings, "
                    "tags, embedding) VALUES (:id, :uid, :title, 'Alles garen.', 2, "
                    "CAST(:tags AS text[]), CAST(:emb AS vector))"
                ),
                {
                    "id": rid,
                    "uid": uid,
                    "title": title,
                    "tags": tags,
                    "emb": str(vec),
                },
            )

    yield ids

    async with engine.begin() as conn:
        for uid in (ids.owner, ids.stranger):
            await conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": uid})


async def _top(user_id, query: str, limit: int = 1) -> list[str]:
    from app.routers.search import HybridSearchRequest, hybrid_search

    with patch(
        "app.routers.search.embed_text", new=AsyncMock(return_value=VECTOR)
    ):
        result = await hybrid_search(
            HybridSearchRequest(query=query, limit=limit, user_id=user_id),
            x_gemini_api_key="test-key",
        )
    return [r.title for r in result]


@requires_db
@pytest.mark.parametrize(
    "query",
    [
        "asiatisch",  # exakter Tag
        "asia",  # Wortanfang
        "asiatich",  # Tippfehler
        "etwas asiatisches zum Abendessen",  # Tag steckt in einem ganzen Satz
    ],
)
async def test_tag_hebt_das_passende_rezept_an_die_spitze(seeded, query):
    assert await _top(seeded.owner, query) == ["Gemüsepfanne"]


@requires_db
async def test_umlautschreibung_wird_normalisiert(seeded):
    assert await _top(seeded.owner, "gefluegel") == ["Gemüsepfanne"]


@requires_db
async def test_fremde_rezepte_erscheinen_nie(seeded):
    titel = await _top(seeded.owner, "asiatisch", limit=10)
    assert "Fremdes Curry" not in titel
