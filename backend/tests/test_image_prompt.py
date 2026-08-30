"""
Tests für den Prompt-Aufbau der KI-Bildgenerierung.

Anlass: Alle generierten Bilder sahen gleich aus (Unterlage, rechts der Teller).
Geprüft wird, dass der Prompt pro Seed wirklich variiert, den Titel immer
trägt, das Geschirr zur Art des Gerichts passt und die Auswahl reproduzierbar
bleibt. Kein Gemini-Aufruf nötig — der Aufbau ist eine reine Funktion.
"""

from app.services.image_prompt_service import (
    GESCHIRR_ALLGEMEIN,
    KOMPOSITIONEN,
    LICHT,
    PERSPEKTIVEN,
    STILE,
    UNTERGRUENDE,
    build_image_prompt,
    geschirr_fuer,
)


def _prompts(n: int, **kwargs: object) -> list[str]:
    return [build_image_prompt("Zürcher Geschnetzeltes", ["Kalbfleisch", "Rahm"], seed=str(i), **kwargs) for i in range(n)]


def test_titel_und_zutaten_stehen_immer_im_prompt():
    for p in _prompts(20):
        assert "Zürcher Geschnetzeltes" in p
        assert "Kalbfleisch, Rahm" in p
        assert "Kein Text" in p


def test_prompts_variieren_deutlich():
    prompts = _prompts(40)
    # Sechs unabhängige Achsen: 40 Seeds müssen weit mehr als eine Handvoll
    # verschiedener Prompts ergeben — sonst sähen die Bilder wieder gleich aus.
    assert len(set(prompts)) >= 35


def test_jede_achse_wird_tatsaechlich_gewuerfelt():
    prompts = "\n".join(_prompts(60))
    for pool in (PERSPEKTIVEN, UNTERGRUENDE, LICHT, KOMPOSITIONEN, STILE, GESCHIRR_ALLGEMEIN):
        getroffen = sum(1 for eintrag in pool if eintrag in prompts)
        assert getroffen >= len(pool) // 2, f"Zu wenig Varianz in {pool[0]!r}-Achse"


def test_kein_fester_holztisch_mehr():
    # Der alte Prompt zwang jedes Bild auf «rustikaler Holztisch».
    prompts = _prompts(30)
    assert sum("Holztisch" in p for p in prompts) < len(prompts) // 2


def test_gleicher_seed_gleicher_prompt():
    a = build_image_prompt("Rösti", ["Kartoffeln"], "Hauptgericht", seed="fix")
    b = build_image_prompt("Rösti", ["Kartoffeln"], "Hauptgericht", seed="fix")
    assert a == b


def test_geschirr_passt_zur_art_des_gerichts():
    assert "Suppenschüssel" in " ".join(geschirr_fuer("Kürbissuppe", ""))
    assert "Backblech" in " ".join(geschirr_fuer("Peperoni-Wähe", "Hauptgericht"))
    assert "Dessertglas" in " ".join(geschirr_fuer("Himbeercreme im Glas", "Dessert"))
    assert geschirr_fuer("Rösti", "Beilage") is GESCHIRR_ALLGEMEIN


def test_suppe_landet_nie_auf_flachem_teller():
    for i in range(30):
        p = build_image_prompt("Bündner Gerstensuppe", ["Gerste"], "Suppe", seed=str(i))
        assert "Porzellanteller" not in p
        assert any(g in p for g in geschirr_fuer("Bündner Gerstensuppe", "Suppe"))


def test_zutaten_werden_auf_acht_begrenzt():
    p = build_image_prompt("Test", [f"Z{i}" for i in range(20)], seed="x")
    assert "Z7" in p and "Z8" not in p
