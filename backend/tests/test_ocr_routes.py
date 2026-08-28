"""
Integrationstests für POST /ocr/extract (Mehrseiten-OCR).

Diese Tests laufen gegen eine ECHTE PostgreSQL-Instanz (die Eigentumsprüfung
ist eine DB-Abfrage — SQLite würde ein anderes Typsystem und andere
UUID/Enum-Semantik testen). Fehlt die Datenbank, werden sie übersprungen.

Der Gemini-Aufruf ist gemockt; Router- und Service-Pfad laufen echt durch,
inklusive Pfadauflösung über _utils.resolved_image_path.
"""

import asyncio
import json
import uuid
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import TEST_INTERNAL_SECRET


# ── DB-Verfügbarkeit prüfen (Skip statt Fehlschlag) ───────────────────────────

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
                # Verbindungen dürfen die Event-Loop dieses Checks nicht überleben.
                await engine.dispose()

        asyncio.run(_ping())
        return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(
    not _database_available(),
    reason="PostgreSQL nicht erreichbar — DB-Integrationstests übersprungen.",
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"

MERGED_RECIPE = {
    "title": "Zürcher Geschnetzeltes mit Rösti",
    "description": "Klassiker über zwei Kochbuchseiten.",
    "servings": 4,
    "prep_time_minutes": 20,
    "cook_time_minutes": 30,
    "difficulty": "mittel",
    "ingredients": [
        {"amount": 600, "unit": "g", "name": "Kalbfleisch", "notes": "in Streifen"},
        {"amount": 2, "unit": "dl", "name": "Rahm", "notes": None},
        {"amount": 800, "unit": "g", "name": "Kartoffeln", "notes": "für die Rösti"},
    ],
    "instructions": "1. Fleisch anbraten.\n2. Rahm zugeben.\n3. Rösti backen.\n4. Servieren.",
    "tags": ["Schweizer Küche"],
    "source_type": "image_ocr",
}


@pytest.fixture
def app():
    from app.main import app as fastapi_app

    return fastapi_app


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
    """Legt zwei Benutzer, drei Bilder und die zugehörigen Dateien an."""
    from sqlalchemy import text

    from app.database import engine

    owner_id = uuid.uuid4()
    stranger_id = uuid.uuid4()
    page_one_id = uuid.uuid4()
    page_two_id = uuid.uuid4()
    foreign_id = uuid.uuid4()

    originals = tmp_path / "originals"
    originals.mkdir()
    for name in ("seite-1.jpg", "seite-2.jpg", "fremd.jpg"):
        (originals / name).write_bytes(JPEG_BYTES)

    # Router liest upload_dir über get_settings() — auf das Testverzeichnis umlenken.
    monkeypatch.setattr(
        "app.routers.ocr.get_settings",
        lambda: SimpleNamespace(upload_dir=str(tmp_path)),
    )

    async with engine.begin() as conn:
        for uid, label in ((owner_id, "owner"), (stranger_id, "stranger")):
            await conn.execute(
                text(
                    "INSERT INTO users (id, email, name, role, status) "
                    "VALUES (:id, :email, :name, 'user', 'approved')"
                ),
                {"id": uid, "email": f"ocr-{label}-{uid}@test.invalid", "name": f"OCR {label}"},
            )
        for img_id, uid, path in (
            (page_one_id, owner_id, "originals/seite-1.jpg"),
            (page_two_id, owner_id, "originals/seite-2.jpg"),
            (foreign_id, stranger_id, "originals/fremd.jpg"),
        ):
            await conn.execute(
                text(
                    "INSERT INTO images (id, user_id, file_path, file_name, mime_type) "
                    "VALUES (:id, :user_id, :file_path, :file_name, 'image/jpeg')"
                ),
                {
                    "id": img_id,
                    "user_id": uid,
                    "file_path": path,
                    "file_name": path.split("/")[-1],
                },
            )

    yield SimpleNamespace(
        owner_id=owner_id,
        stranger_id=stranger_id,
        page_one_id=page_one_id,
        page_two_id=page_two_id,
        foreign_id=foreign_id,
    )

    async with engine.begin() as conn:
        # Bilder hängen per ON DELETE CASCADE an den Benutzern.
        await conn.execute(
            text("DELETE FROM users WHERE id = ANY(:ids)"),
            {"ids": [owner_id, stranger_id]},
        )


def _gemini_mock(payload: dict) -> MagicMock:
    response = MagicMock()
    response.text = json.dumps(payload)
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(return_value=response)
    return client


async def _post(app, body: dict):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        return await client.post(
            "/ocr/extract",
            json=body,
            headers={
                "X-Gemini-API-Key": "fake-key",
                "X-Internal-Token": TEST_INTERNAL_SECRET,
            },
        )


# ── Tests ─────────────────────────────────────────────────────────────────────

@requires_db
class TestOcrExtractOwnership:
    async def test_foreign_image_returns_403(self, app, seeded):
        res = await _post(
            app,
            {"image_ids": [str(seeded.foreign_id)], "user_id": str(seeded.owner_id)},
        )
        assert res.status_code == 403
        assert res.json()["detail"] == "Nicht autorisiert."

    async def test_one_foreign_page_among_own_returns_403(self, app, seeded):
        """Eine einzige fremde Seite kippt die ganze Anfrage."""
        res = await _post(
            app,
            {
                "image_ids": [str(seeded.page_one_id), str(seeded.foreign_id)],
                "user_id": str(seeded.owner_id),
            },
        )
        assert res.status_code == 403

    async def test_unknown_image_returns_404(self, app, seeded):
        res = await _post(
            app,
            {"image_ids": [str(uuid.uuid4())], "user_id": str(seeded.owner_id)},
        )
        assert res.status_code == 404
        assert res.json()["detail"] == "Bild nicht gefunden."

    async def test_unknown_page_among_own_returns_404(self, app, seeded):
        res = await _post(
            app,
            {
                "image_ids": [str(seeded.page_one_id), str(uuid.uuid4())],
                "user_id": str(seeded.owner_id),
            },
        )
        assert res.status_code == 404


@requires_db
class TestOcrExtractMultiPage:
    async def test_two_pages_yield_single_merged_recipe(self, app, seeded):
        mock_client = _gemini_mock(MERGED_RECIPE)
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            res = await _post(
                app,
                {
                    "image_ids": [str(seeded.page_one_id), str(seeded.page_two_id)],
                    "user_id": str(seeded.owner_id),
                },
            )

        assert res.status_code == 200
        body = res.json()
        assert len(body["recipes"]) == 1
        recipe = body["recipes"][0]
        assert recipe["title"] == "Zürcher Geschnetzeltes mit Rösti"
        assert len(recipe["ingredients"]) == 3
        assert recipe["source_type"] == "image_ocr"

        # Genau EIN Gemini-Aufruf mit BEIDEN Seiten in Reihenfolge.
        mock_client.aio.models.generate_content.assert_awaited_once()
        contents = mock_client.aio.models.generate_content.await_args.kwargs["contents"]
        image_parts = [p for p in contents if getattr(p, "inline_data", None) is not None]
        assert len(image_parts) == 2
        assert "aufeinanderfolgende" in contents[-1].text.lower() or "AUFEINANDERFOLGENDE" in contents[-1].text

    async def test_single_image_id_still_supported(self, app, seeded):
        """Bestandsvertrag: image_id (Einzahl) bleibt gültig, Mehrfach-Rezept-Semantik."""
        mock_client = _gemini_mock({"recipes": [MERGED_RECIPE]})
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            res = await _post(
                app,
                {"image_id": str(seeded.page_one_id), "user_id": str(seeded.owner_id)},
            )

        assert res.status_code == 200
        assert len(res.json()["recipes"]) == 1
        contents = mock_client.aio.models.generate_content.await_args.kwargs["contents"]
        image_parts = [p for p in contents if getattr(p, "inline_data", None) is not None]
        assert len(image_parts) == 1

    async def test_single_element_image_ids_uses_single_page_path(self, app, seeded):
        mock_client = _gemini_mock({"recipes": [MERGED_RECIPE]})
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            res = await _post(
                app,
                {"image_ids": [str(seeded.page_one_id)], "user_id": str(seeded.owner_id)},
            )
        assert res.status_code == 200
        assert len(res.json()["recipes"]) == 1

    async def test_missing_file_returns_422(self, app, seeded, tmp_path):
        (tmp_path / "originals" / "seite-2.jpg").unlink()
        mock_client = _gemini_mock(MERGED_RECIPE)
        with patch("app.services._utils.get_gemini_client", return_value=mock_client):
            res = await _post(
                app,
                {
                    "image_ids": [str(seeded.page_one_id), str(seeded.page_two_id)],
                    "user_id": str(seeded.owner_id),
                },
            )
        assert res.status_code == 422


class TestOcrExtractValidation:
    """Validierung greift vor jedem DB-Zugriff — läuft auch ohne Datenbank."""

    async def test_missing_api_key_returns_400(self, app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post(
                "/ocr/extract",
                json={"image_ids": [str(uuid.uuid4())], "user_id": str(uuid.uuid4())},
                headers={"X-Internal-Token": TEST_INTERNAL_SECRET},
            )
        assert res.status_code == 400

    async def test_no_image_returns_422(self, app):
        res = await _post(app, {"user_id": str(uuid.uuid4())})
        assert res.status_code == 422

    async def test_more_than_ten_pages_returns_422(self, app):
        res = await _post(
            app,
            {
                "image_ids": [str(uuid.uuid4()) for _ in range(11)],
                "user_id": str(uuid.uuid4()),
            },
        )
        assert res.status_code == 422

    async def test_invalid_uuid_returns_422(self, app):
        res = await _post(app, {"image_ids": ["kein-uuid"], "user_id": str(uuid.uuid4())})
        assert res.status_code == 422
