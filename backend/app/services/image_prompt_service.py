"""
Prompt-Aufbau für die KI-Bildgenerierung.

Vorher stand in jedem Prompt derselbe Satz — «natürliches Licht, rustikaler
Holztisch, frische Zutaten im Hintergrund». Das Modell lieferte darauf
zuverlässig dasselbe Bild: Unterlage, rechts der Teller, gleiche Stimmung.
Nutzerinnen konnten ihre Gerichte in der Übersicht nicht mehr auseinanderhalten.

Jetzt wird jede Bildanfrage aus mehreren unabhängigen Achsen zusammengesetzt
(Perspektive, Untergrund, Licht, Komposition, Stil, Geschirr). Die Auswahl ist
über einen Seed reproduzierbar, damit sie im Test prüfbar bleibt; der Router
zieht pro Aufruf einen frischen Seed, damit «Neues Bild generieren» wirklich
etwas Neues bringt.

Das Geschirr richtet sich nach der Art des Gerichts: eine Suppe gehört in eine
Schüssel, eine Wähe aufs Blech — sonst erfindet das Modell einen Teller, auf
dem eine Suppe schlicht falsch aussieht.
"""

from __future__ import annotations

import random

PERSPEKTIVEN = [
    "Aufnahme senkrecht von oben (Flat Lay)",
    "45-Grad-Ansicht schräg von vorne",
    "flacher Winkel auf Augenhöhe mit dem Gericht",
    "extreme Nahaufnahme, Fokus auf die Textur der Oberfläche",
    "leicht erhöhte Dreiviertelansicht",
]

UNTERGRUENDE = [
    "dunkle Schieferplatte",
    "helles, zerknittertes Leinentuch",
    "weisser Marmor mit feinen Adern",
    "abgewetzter Holztisch",
    "graue Betonplatte",
    "handbemalte Keramikfliesen in Blau und Weiss",
    "mattschwarze Fläche, fast ohne Umgebung",
    "sonnenbeschienener Gartentisch im Freien",
    "rot-weiss kariertes Tischtuch",
    "gebürsteter Edelstahl einer Restaurantküche",
    "Terrakotta-Boden mit Kräutertopf am Rand",
]

LICHT = [
    "weiches Fensterlicht von links",
    "hartes Seitenlicht mit langen Schatten",
    "goldenes Abendlicht kurz vor Sonnenuntergang",
    "dramatisches Low-Key-Licht, dunkler Hintergrund",
    "helle, luftige High-Key-Ausleuchtung",
    "Gegenlicht, aufsteigender Dampf sichtbar",
    "kühles Morgenlicht",
]

KOMPOSITIONEN = [
    "Gericht exakt zentriert und bildfüllend, keine weiteren Objekte",
    "Gericht weit links aussermittig, viel leerer Raum rechts",
    "Gericht am unteren Bildrand angeschnitten",
    "Teller am rechten Bildrand angeschnitten, Blick in die Mitte des Gerichts",
    "zwei Portionen versetzt hintereinander, vordere scharf",
    "eine Hand serviert gerade oder taucht mit Gabel oder Löffel ein",
    "sehr geringe Schärfentiefe, Hintergrund in weichem Bokeh",
    "Gericht im Halbkreis von Zutaten umrahmt, alles scharf",
]

STILE = [
    "rustikal und bodenständig",
    "minimalistisch, modern, viel Weissraum",
    "Pariser Bistro",
    "Alphütte mit Holzwänden",
    "urbanes Restaurant mit dunklen Tönen",
    "sommerlich frisch, kräftige Farben",
    "gemütlich winterlich, warme Töne",
    "nordisch reduziert, gedeckte Farben",
]

GESCHIRR_ALLGEMEIN = [
    "schlichter weisser Porzellanteller",
    "handgetöpferte Keramikschale in Erdtönen",
    "gusseiserne Pfanne direkt serviert",
    "grobes Holzbrett",
    "weisser Emaille-Teller mit blauem Rand",
    "tiefblau glasierter Teller",
    "schwarzer Steinteller",
    "altes Blumenmuster-Porzellan",
]

# Stichwort in Kategorie oder Titel → passendes Geschirr. Reihenfolge zählt:
# der erste Treffer gewinnt, deshalb spezifische Begriffe zuerst.
GESCHIRR_NACH_ART: list[tuple[tuple[str, ...], list[str]]] = [
    (("suppe", "bouillon", "eintopf", "brühe"), ["tiefe Suppenschüssel", "Steinguttopf mit Kelle", "Suppenschale mit breitem Rand"]),
    (("wähe", "kuchen", "torte", "tarte", "gugelhopf", "cake"), ["rundes Backblech", "Kuchenplatte auf Fuss", "angeschnitten auf Holzbrett, ein Stück auf Teller"]),
    (("dessert", "creme", "crème", "glace", "mousse", "pudding", "tiramisu"), ["Dessertglas", "kleine Glasschale", "flacher Dessertteller mit Sauce"]),
    (("salat",), ["weite Salatschüssel aus Holz", "flache Keramikschale", "grosser weisser Teller"]),
    (("getränk", "drink", "smoothie", "punsch", "sirup"), ["hohes Glas", "Henkelglas", "Karaffe mit Glas daneben"]),
    (("pasta", "spaghetti", "nudel", "risotto", "curry", "ragout", "gulasch"), ["tiefer Teller", "weite Schüssel", "Pfanne direkt auf dem Tisch"]),
    (("brot", "zopf", "gipfeli", "brötchen", "focaccia"), ["Holzbrett mit Leinentuch", "Brotkorb", "Gitterrost zum Auskühlen"]),
    (("pizza", "flammkuchen"), ["Pizzabrett", "Holzschieber", "Backpapier direkt auf dem Tisch"]),
    (("frühstück", "müesli", "birchermüesli", "porridge"), ["Frühstücksschale", "Glas mit Schichten", "Schale auf Holztablett"]),
    (("sandwich", "burger", "wrap", "toast"), ["Holzbrett", "Pergamentpapier in Korb", "Emaille-Teller"]),
]

VERBOTEN = "Kein Text, keine Logos, keine Wasserzeichen, keine Gesichter im Bild."


def geschirr_fuer(title: str, category: str) -> list[str]:
    """Liefert die Geschirr-Kandidaten, die zur Art des Gerichts passen."""
    haystack = f"{category} {title}".lower()
    for stichworte, kandidaten in GESCHIRR_NACH_ART:
        if any(w in haystack for w in stichworte):
            return kandidaten
    return GESCHIRR_ALLGEMEIN


def build_image_prompt(
    title: str,
    ingredients: list[str],
    category: str = "",
    seed: str | None = None,
) -> str:
    """
    Baut einen Prompt, dessen Bildsprache pro Seed anders ausfällt.

    Gleicher Seed → gleicher Prompt (testbar); kein Seed → zufällig.
    """
    rng = random.Random(seed)
    perspektive = rng.choice(PERSPEKTIVEN)
    untergrund = rng.choice(UNTERGRUENDE)
    licht = rng.choice(LICHT)
    komposition = rng.choice(KOMPOSITIONEN)
    stil = rng.choice(STILE)
    geschirr = rng.choice(geschirr_fuer(title, category))

    zutaten = ", ".join(ingredients[:8])
    zutaten_satz = f" Erkennbare Zutaten: {zutaten}." if zutaten else ""
    kategorie_satz = f" Kategorie: {category}." if category else ""

    return (
        f"Professionelles Food-Foto des Gerichts «{title}».{zutaten_satz}{kategorie_satz} "
        f"Das Gericht selbst ist der einzige Blickfang und klar als «{title}» erkennbar. "
        f"Serviert auf: {geschirr}. "
        f"Perspektive: {perspektive}. "
        f"Untergrund: {untergrund}. "
        f"Licht: {licht}. "
        f"Komposition: {komposition}. "
        f"Stil: {stil}. "
        f"{VERBOTEN}"
    )
