"""
Pytest-Konfiguration für Rezeptmeister Backend.

Wenn asyncpg oder pgvector in der aktiven Python-Umgebung fehlen (z.B. wenn ein
systemweites Python statt des uv-venvs aktiv ist), werden die betroffenen Module
durch Minimal-Mocks ersetzt, BEVOR irgendein Test die App importiert.

Das erlaubt Route-Tests ohne eine echte Datenbankverbindung laufen zu lassen,
da alle Background-Tasks in den Tests ohnehin gemockt werden.
"""

import sys
from unittest.mock import AsyncMock, MagicMock


def _make_mock_db_module() -> MagicMock:
    """Erstellt einen Minimal-Mock für app.database."""
    mock_session = MagicMock()
    mock_session.__aenter__ = AsyncMock(return_value=MagicMock())
    mock_session.__aexit__ = AsyncMock(return_value=None)

    mock_db = MagicMock()
    mock_db.AsyncSessionLocal = MagicMock(return_value=mock_session)
    mock_db.engine = MagicMock()
    mock_db.Base = MagicMock()
    mock_db.get_db = AsyncMock()
    return mock_db


def _make_mock_pgvector() -> None:
    """Mockt pgvector und pgvector.sqlalchemy wenn das Paket fehlt."""
    mock_pgvector = MagicMock()
    mock_pgvector_sqlalchemy = MagicMock()
    # Vector-Typ: gibt beim Aufruf mit (dims) eine MagicMock-Instanz zurück
    mock_pgvector_sqlalchemy.Vector = MagicMock(return_value=MagicMock())
    sys.modules.setdefault("pgvector", mock_pgvector)
    sys.modules.setdefault("pgvector.sqlalchemy", mock_pgvector_sqlalchemy)


# ── Abhängigkeiten prüfen und ggf. mocken ─────────────────────────────────────
# Läuft bei der Test-Sammlung, BEVOR test_*.py-Module importiert werden.

try:
    import asyncpg  # noqa: F401
except ImportError:
    if "app.database" not in sys.modules:
        sys.modules["app.database"] = _make_mock_db_module()

try:
    import pgvector  # noqa: F401
except ImportError:
    _make_mock_pgvector()


# ── Gemeinsame Test-Fixtures ───────────────────────────────────────────────────

import pathlib
import pytest


@pytest.fixture
def minimal_jpeg(tmp_path) -> pathlib.Path:
    """Minimale gültige JPEG-Datei (1×1 Pixel) für Bild-Tests."""
    jpeg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
    p = tmp_path / "test.jpg"
    p.write_bytes(jpeg_bytes)
    return p
