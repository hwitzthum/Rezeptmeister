"""Tests for Settings validators in app/config.py."""

import pytest
from pydantic import ValidationError


def _make_settings(**overrides):
    """Instantiate Settings with a valid baseline, applying overrides."""
    from app.config import Settings

    defaults = {"INTERNAL_SECRET": "a" * 32}
    env = {**defaults, **overrides}
    return Settings(**{k.lower(): v for k, v in env.items()})


class TestCorsNoWildcard:
    def test_star_string_rejected(self):
        with pytest.raises(ValidationError, match="CORS_ORIGINS_RAW must not contain"):
            _make_settings(CORS_ORIGINS_RAW="*")

    def test_star_json_array_rejected(self):
        with pytest.raises(ValidationError, match="CORS_ORIGINS_RAW must not contain"):
            _make_settings(CORS_ORIGINS_RAW='["*"]')

    def test_explicit_origin_accepted(self):
        s = _make_settings(CORS_ORIGINS_RAW="https://example.com")
        assert "https://example.com" in s.cors_origins

    def test_comma_separated_origins_accepted(self):
        s = _make_settings(
            CORS_ORIGINS_RAW="https://a.example.com,https://b.example.com"
        )
        assert s.cors_origins == ["https://a.example.com", "https://b.example.com"]

    def test_default_localhost_accepted(self):
        s = _make_settings(CORS_ORIGINS_RAW="http://localhost:3001")
        assert s.cors_origins == ["http://localhost:3001"]
