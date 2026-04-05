"""
Live-Integrationstests für die Gemini-KI-Pipeline.

Werden ÜBERSPRUNGEN wenn GEMINI_TEST_KEY nicht gesetzt ist.
Laden den Schlüssel automatisch aus ../../.env (Projektstamm) oder
aus der Umgebungsvariable GEMINI_TEST_KEY.

Führe aus mit:
    uv run pytest tests/test_live_gemini.py -v -s
"""

import os
import pathlib
import re
import pytest


# ── Schlüssel laden ────────────────────────────────────────────────────────────

def _load_gemini_key() -> str:
    """Liest GEMINI_TEST_KEY aus Umgebung oder ../../.env."""
    if key := os.environ.get("GEMINI_TEST_KEY", "").strip():
        return key
    # Projektstamm: zwei Ebenen über backend/tests/
    root_env = pathlib.Path(__file__).parent.parent.parent / ".env"
    if root_env.exists():
        m = re.search(r"^GEMINI_TEST_KEY=(.+)$", root_env.read_text(), re.MULTILINE)
        if m:
            return m.group(1).strip()
    return ""


GEMINI_TEST_KEY = _load_gemini_key()
_skip_without_key = pytest.mark.skipif(
    not GEMINI_TEST_KEY,
    reason="GEMINI_TEST_KEY nicht gesetzt – Live-Tests übersprungen",
)


# ── Hilfsfunktion: Mini-Rezeptbild ────────────────────────────────────────────

def _make_recipe_image(path: pathlib.Path) -> None:
    """Erstellt ein einfaches PNG mit Rezepttext für OCR-Tests."""
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (500, 650), color="white")
    draw = ImageDraw.Draw(img)
    recipe_lines = [
        "Zürcher Geschnetzeltes",
        "",
        "Portionen: 4   Zubereitungszeit: 35 Min.",
        "",
        "Zutaten:",
        "  600 g  Kalbfleisch, in Streifen",
        "  2 EL   Butter",
        "  1      Zwiebel, fein gehackt",
        "  200 g  Champignons, in Scheiben",
        "  2 dl   Rahm",
        "  1 dl   Weisswein",
        "  Salz und Pfeffer nach Geschmack",
        "",
        "Zubereitung:",
        "1. Fleisch portionenweise in Butter kräftig",
        "   anbraten, herausnehmen.",
        "2. Zwiebeln im gleichen Topf andünsten.",
        "3. Pilze dazugeben, mitdünsten.",
        "4. Mit Weisswein ablöschen, einkochen lassen.",
        "5. Rahm beigeben, 5 Minuten köcheln.",
        "6. Fleisch zurückgeben, würzen.",
        "7. Mit Rösti servieren.",
    ]
    y = 20
    for line in recipe_lines:
        draw.text((20, y), line, fill="black")
        y += 26

    img.save(str(path), "PNG")


# ── Text-Embedding ─────────────────────────────────────────────────────────────

@_skip_without_key
class TestLiveEmbedText:
    @pytest.mark.asyncio
    async def test_returns_3072_dims(self):
        from app.services.embedding_service import embed_text
        result = await embed_text("Zürcher Geschnetzeltes mit Rösti", GEMINI_TEST_KEY)
        assert isinstance(result, list), "Ergebnis muss eine Liste sein"
        assert len(result) == 3072, f"Erwartet 3072 Dimensionen, erhalten: {len(result)}"
        assert all(isinstance(v, float) for v in result), "Alle Werte müssen float sein"

    @pytest.mark.asyncio
    async def test_document_and_query_differ(self):
        """Dokumenten- und Abfrage-Embeddings sollen sich unterscheiden."""
        from app.services.embedding_service import embed_text
        doc = await embed_text("Schnitzel mit Pommes", GEMINI_TEST_KEY, is_query=False)
        qry = await embed_text("Schnitzel mit Pommes", GEMINI_TEST_KEY, is_query=True)
        assert doc != qry, "Dokument- und Abfrage-Embedding müssen verschieden sein"
        # Beide sollten 3072 Dims haben
        assert len(doc) == len(qry) == 3072

    @pytest.mark.asyncio
    async def test_similar_texts_closer_than_unrelated(self):
        """Ähnliche Texte sollen einen höheren Kosinus-Score haben."""
        import math
        from app.services.embedding_service import embed_text

        def cosine(a: list[float], b: list[float]) -> float:
            dot = sum(x * y for x, y in zip(a, b))
            na = math.sqrt(sum(x ** 2 for x in a))
            nb = math.sqrt(sum(x ** 2 for x in b))
            return dot / (na * nb) if na and nb else 0.0

        emb_cake1 = await embed_text("Schokoladenkuchen mit Sahne", GEMINI_TEST_KEY)
        emb_cake2 = await embed_text("Schokotorte mit Rahm", GEMINI_TEST_KEY)
        emb_fish  = await embed_text("Zürcher Geschnetzeltes", GEMINI_TEST_KEY)

        score_similar   = cosine(emb_cake1, emb_cake2)
        score_different = cosine(emb_cake1, emb_fish)
        assert score_similar > score_different, (
            f"Ähnliche Texte ({score_similar:.3f}) sollen näher sein als "
            f"unähnliche ({score_different:.3f})"
        )

    @pytest.mark.asyncio
    async def test_batch_embed_returns_correct_count(self):
        from app.services.embedding_service import batch_embed_texts
        texts = ["Apfelkuchen", "Linsensuppe", "Birchermüesli"]
        results = await batch_embed_texts(texts, GEMINI_TEST_KEY)
        assert len(results) == 3
        for r in results:
            assert len(r) == 3072


# ── Bild-Embedding ─────────────────────────────────────────────────────────────

@_skip_without_key
class TestLiveEmbedImage:
    @pytest.mark.asyncio
    async def test_returns_3072_dims(self, tmp_path):
        from app.services.embedding_service import embed_image

        img_path = tmp_path / "rezept.png"
        _make_recipe_image(img_path)

        result = await embed_image(str(img_path), GEMINI_TEST_KEY)
        assert isinstance(result, list)
        assert len(result) == 3072, f"Erwartet 3072 Dims, erhalten: {len(result)}"
        assert all(isinstance(v, float) for v in result)

    @pytest.mark.asyncio
    async def test_image_embedding_differs_from_text_embedding(self, tmp_path):
        """Bild-Embedding soll sich vom Text-Embedding für denselben Titel unterscheiden."""
        from app.services.embedding_service import embed_image, embed_text

        img_path = tmp_path / "rezept.png"
        _make_recipe_image(img_path)

        img_emb  = await embed_image(str(img_path), GEMINI_TEST_KEY)
        text_emb = await embed_text("Zürcher Geschnetzeltes", GEMINI_TEST_KEY)

        # Beide im gleichen Semantikraum — sollten ähnlich aber nicht identisch sein
        assert img_emb != text_emb


# ── OCR-Service ────────────────────────────────────────────────────────────────

@_skip_without_key
class TestLiveOcr:
    @pytest.mark.asyncio
    async def test_extracts_recipe_from_image(self, tmp_path):
        from app.services.ocr_service import extract_recipe_from_image, OcrResult

        img_path = tmp_path / "rezept.png"
        _make_recipe_image(img_path)

        result = await extract_recipe_from_image(str(img_path), GEMINI_TEST_KEY)

        assert isinstance(result, OcrResult), "Ergebnis muss OcrResult sein"
        assert result.title, "Titel darf nicht leer sein"
        assert len(result.ingredients) > 0, "Mindestens eine Zutat erwartet"
        assert result.instructions, "Zubereitung darf nicht leer sein"
        assert result.source_type == "image_ocr"

    @pytest.mark.asyncio
    async def test_ingredients_have_swiss_units(self, tmp_path):
        """Zutaten sollen Schweizer Masseinheiten verwenden."""
        from app.services.ocr_service import extract_recipe_from_image

        img_path = tmp_path / "rezept.png"
        _make_recipe_image(img_path)

        result = await extract_recipe_from_image(str(img_path), GEMINI_TEST_KEY)

        # Mindestens eine Zutat mit erkannter Menge oder Einheit
        has_amount_or_unit = any(
            ing.amount is not None or ing.unit is not None
            for ing in result.ingredients
        )
        assert has_amount_or_unit, "Mindestens eine Zutat mit Menge/Einheit erwartet"

    @pytest.mark.asyncio
    async def test_result_is_in_german(self, tmp_path):
        """Ergebnis muss auf Deutsch sein."""
        from app.services.ocr_service import extract_recipe_from_image

        img_path = tmp_path / "rezept.png"
        _make_recipe_image(img_path)

        result = await extract_recipe_from_image(str(img_path), GEMINI_TEST_KEY)

        # Titel und Anweisungen sollen erkennbar deutsch sein
        german_indicators = ["und", "mit", "in", "der", "die", "das", "zu", "von"]
        full_text = f"{result.title} {result.instructions}".lower()
        has_german = any(f" {word} " in f" {full_text} " for word in german_indicators)
        assert has_german, f"Ergebnis scheint nicht auf Deutsch: {result.title!r}"
