"""
Integrationstests für den Re-Embedding-Job (app.routers.admin._run_re_embed).

Laufen gegen eine ECHTE PostgreSQL-Instanz mit pgvector — die Auswahl
«Bilder ohne Embedding» und das Schreiben der VECTOR(3072)-Spalte lassen sich
nicht sinnvoll gegen eine leichtere Engine prüfen. Fehlt die Datenbank, werden
sie übersprungen. Nur der Gemini-Aufruf ist gemockt.
"""

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


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

JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"

NEW_VECTOR = [0.25] * 3072
OLD_VECTOR = [0.5] * 3072


@pytest.fixture(autouse=True)
async def _dispose_engine():
    """Pool nach jedem Test leeren — jeder Test bekommt eine eigene Event-Loop."""
    yield
    try:
        from app.database import engine

        await engine.dispose()
    except Exception:
        pass


@pytest.fixture
async def seeded(tmp_path, monkeypatch):
    """
    Ein Benutzer mit einem Rezept und vier Bildern, dazu ein fremdes Bild:
      - missing:   ohne Embedding, Datei vorhanden      → wird nachgeholt
      - embedded:  hat bereits ein Embedding            → bleibt unangetastet
      - lost_file: ohne Embedding, Datei fehlt          → zählt als Fehler
      - foreign:   ohne Embedding, anderer Benutzer     → bleibt unangetastet
    """
    from sqlalchemy import text

    from app.database import engine

    ids = SimpleNamespace(
        owner=uuid.uuid4(),
        stranger=uuid.uuid4(),
        recipe=uuid.uuid4(),
        missing=uuid.uuid4(),
        embedded=uuid.uuid4(),
        lost_file=uuid.uuid4(),
        foreign=uuid.uuid4(),
        job=uuid.uuid4(),
    )

    originals = tmp_path / "originals"
    originals.mkdir()
    for name in ("missing.jpg", "embedded.jpg", "foreign.jpg"):
        (originals / name).write_bytes(JPEG_BYTES)

    monkeypatch.setattr(
        "app.routers.admin.get_settings",
        lambda: SimpleNamespace(upload_dir=str(tmp_path)),
    )
    # resolved_image_path fragt bei fehlender Datei nach Supabase — im Test
    # gibt es keines, die fehlende Datei muss als FileNotFoundError enden.
    monkeypatch.setattr(
        "app.services._utils.get_settings",
        lambda: SimpleNamespace(supabase_url=""),
    )

    async with engine.begin() as conn:
        for uid, label in ((ids.owner, "owner"), (ids.stranger, "stranger")):
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, name, role, status) "
                    "VALUES (:id, :email, :name, 'user', 'approved')"
                ),
                {"id": uid, "email": f"reembed-{label}-{uid}@test.invalid", "name": label},
            )
        await conn.execute(
            text(
                "INSERT INTO recipes (id, user_id, title, instructions, servings) "
                "VALUES (:id, :user_id, 'Rösti', 'Kartoffeln raffeln und braten.', 4)"
            ),
            {"id": ids.recipe, "user_id": ids.owner},
        )
        for img_id, uid, name, vector in (
            (ids.missing, ids.owner, "missing.jpg", None),
            (ids.embedded, ids.owner, "embedded.jpg", str(OLD_VECTOR)),
            (ids.lost_file, ids.owner, "lost.jpg", None),
            (ids.foreign, ids.stranger, "foreign.jpg", None),
        ):
            await conn.execute(
                text(
                    "INSERT INTO images (id, user_id, file_path, file_name, mime_type, embedding) "
                    "VALUES (:id, :user_id, :file_path, :file_name, 'image/jpeg', "
                    "CAST(:embedding AS vector))"
                ),
                {
                    "id": img_id,
                    "user_id": uid,
                    "file_path": f"originals/{name}",
                    "file_name": name,
                    "embedding": vector,
                },
            )

    # Über das ORM wie im Endpunkt: die Spalten-Defaults leben im Modell, nicht in der DB.
    from app.database import AsyncSessionLocal
    from app.models.job import ReEmbedJob

    async with AsyncSessionLocal() as session:
        session.add(ReEmbedJob(id=ids.job, user_id=ids.owner, status="running"))
        await session.commit()

    yield ids

    async with engine.begin() as conn:
        # Rezepte, Bilder und Jobs hängen per ON DELETE CASCADE an den Benutzern.
        await conn.execute(
            text("DELETE FROM users WHERE id = ANY(:ids)"),
            {"ids": [ids.owner, ids.stranger]},
        )


def _embedding_mock() -> MagicMock:
    result = MagicMock()
    result.embeddings = [SimpleNamespace(values=NEW_VECTOR)]
    client = MagicMock()
    client.aio.models.embed_content = AsyncMock(return_value=result)
    return client


async def _first_component(image_id) -> float | None:
    """Erste Komponente des gespeicherten Embeddings — None, wenn keines existiert."""
    from sqlalchemy import text

    from app.database import engine

    async with engine.connect() as conn:
        row = await conn.execute(
            text("SELECT (embedding::real[])[1] FROM images WHERE id = :id"), {"id": image_id}
        )
        return row.scalar_one()


@requires_db
class TestReEmbedBackfillsImages:
    """
    Prod, 2026-10-05: Der Embedding-Aufruf nach dem Upload ging verloren, 64
    Bilder blieben ohne Embedding — und es gab keinen Weg, sie nachzuholen.
    """

    async def test_backfills_only_own_images_without_embedding(self, seeded):
        from sqlalchemy import text

        from app.database import engine
        from app.routers.admin import _run_re_embed

        with patch("app.services._utils.get_gemini_client", return_value=_embedding_mock()), \
             patch("app.routers.admin.asyncio.sleep", new=AsyncMock()):
            await _run_re_embed(seeded.job, seeded.owner, "fake-key")

        assert await _first_component(seeded.missing) == pytest.approx(0.25)
        # Vorhandenes Embedding wird nicht neu berechnet.
        assert await _first_component(seeded.embedded) == pytest.approx(0.5)
        assert await _first_component(seeded.lost_file) is None
        assert await _first_component(seeded.foreign) is None

        async with engine.connect() as conn:
            job = (
                await conn.execute(
                    text(
                        "SELECT status, total_recipes, completed_recipes, failed_recipes, details "
                        "FROM re_embed_jobs WHERE id = :id"
                    ),
                    {"id": seeded.job},
                )
            ).one()
            recipe_has_embedding = (
                await conn.execute(
                    text("SELECT embedding IS NOT NULL FROM recipes WHERE id = :id"),
                    {"id": seeded.recipe},
                )
            ).scalar_one()

        # 1 Rezept + 2 Bilder ohne Embedding; das Bild ohne Datei ist der eine Fehler.
        assert job.status == "done"
        assert (job.total_recipes, job.completed_recipes, job.failed_recipes) == (3, 2, 1)
        assert recipe_has_embedding is True

        by_id = {d["recipe_id"]: d for d in job.details}
        assert by_id[str(seeded.missing)] == {
            "recipe_id": str(seeded.missing),
            "title": "Bild: missing.jpg",
            "status": "ok",
        }
        assert by_id[str(seeded.lost_file)]["status"] == "error"
        assert str(seeded.embedded) not in by_id
        assert str(seeded.foreign) not in by_id

    async def test_user_without_recipes_still_gets_images_backfilled(self, seeded):
        """Früher endete der Job sofort, wenn der Benutzer keine Rezepte hatte."""
        from sqlalchemy import text

        from app.database import engine
        from app.routers.admin import _run_re_embed

        async with engine.begin() as conn:
            await conn.execute(text("DELETE FROM recipes WHERE id = :id"), {"id": seeded.recipe})

        with patch("app.services._utils.get_gemini_client", return_value=_embedding_mock()), \
             patch("app.routers.admin.asyncio.sleep", new=AsyncMock()):
            await _run_re_embed(seeded.job, seeded.owner, "fake-key")

        assert await _first_component(seeded.missing) == pytest.approx(0.25)
