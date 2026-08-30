"""
Rezeptvorschläge: Prompt-Aufbau und Qualitätsprüfung.

Der frühere Prompt bestand aus sechs Zeilen ohne jeden Nutzerkontext — das
Modell konnte gar nichts anderes liefern als Standardgerichte. Hier entstehen
stattdessen ein Prompt, der die Sammlung, die Saison und harte Ausschlüsse
kennt, und eine Prüfung, die das Ergebnis nicht ungesehen durchwinkt.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Annotated

from pydantic import BaseModel, Field

# ── Anfrage ───────────────────────────────────────────────────────────────────


class WertAnzahl(BaseModel):
    wert: Annotated[str, Field(max_length=100)]
    anzahl: int = 0


class TasteProfile(BaseModel):
    """Was Next.js aus der Rezeptsammlung des Nutzers zusammengetragen hat."""

    vorhandeneTitel: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=80)
    favoritenTitel: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=30)
    bestbewerteteTitel: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=20)
    haeufigGekochteTitel: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=20)
    haeufigsteKuechen: list[WertAnzahl] = Field(default=[], max_length=10)
    haeufigsteKategorien: list[WertAnzahl] = Field(default=[], max_length=10)
    haeufigsteZutaten: list[Annotated[str, Field(max_length=100)]] = Field(default=[], max_length=30)
    haeufigsteTags: list[Annotated[str, Field(max_length=50)]] = Field(default=[], max_length=20)
    rezeptAnzahl: int = 0


class SuggestRequest(BaseModel):
    ingredients: list[Annotated[str, Field(max_length=100)]] = Field(default=[], max_length=50)
    cuisine: Annotated[str, Field(max_length=100)] = ""
    time_budget_minutes: Annotated[int, Field(ge=5, le=480)] = 60
    dietary: list[Annotated[str, Field(max_length=50)]] = Field(default=[], max_length=20)
    season: Annotated[str, Field(max_length=50)] = ""
    exclude_titles: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=30)
    taste_profile: TasteProfile | None = None
    season_month: Annotated[str, Field(max_length=20)] = ""
    seasonal_ingredients: list[Annotated[str, Field(max_length=100)]] = Field(default=[], max_length=40)
    seasonal_occasions: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=10)


# ── Antwort ───────────────────────────────────────────────────────────────────


class RecipeSuggestion(BaseModel):
    id: int
    title: str
    description: str
    why_it_fits: str
    highlight: str
    key_ingredients: list[str]
    missing_ingredients: list[str]
    cuisine: str
    category: str
    time_estimate_minutes: int
    difficulty: str


class SuggestResponse(BaseModel):
    suggestions: list[RecipeSuggestion]


ANZAHL_VORSCHLAEGE = 5

# Gerichte, die jedes Sprachmodell als Erstes ausspuckt. Sie sind nicht
# schlecht — sie sind nur nichtssagend, weil sie ohne jeden Bezug zur Sammlung
# und zur Saison kommen.
ABGEGRIFFENE_GERICHTE = [
    "Spaghetti Bolognese",
    "Gemüsecurry",
    "Ofengemüse mit Feta",
    "Kürbissuppe",
    "Pasta mit Pesto",
    "Chili con Carne",
    "Caesar Salad",
]


def _bullet(items: list[str]) -> str:
    return ", ".join(items)


def build_suggest_prompt(body: SuggestRequest) -> str:
    """
    Baut den Prompt aus Eingaben, Geschmacksprofil und Saison.

    Bewusst fordernd formuliert: "genau", "jedes", "keiner" statt "etwa" oder
    "möglichst". Permissive Formulierungen führen dazu, dass das Modell die
    untere Grenze wählt und Felder leer lässt.
    """
    p = body.taste_profile
    teile: list[str] = [
        "Du bist ein erfahrener Schweizer Kochbuch-Autor und kennst die "
        "Sammlung dieser Person. Schlage genau "
        f"{ANZAHL_VORSCHLAEGE} Rezepte vor.",
    ]

    # ── Was die Person schon hat ──
    if p and p.vorhandeneTitel:
        teile.append(
            f"\nDIE SAMMLUNG DIESER PERSON ({p.rezeptAnzahl} Rezepte). "
            "Keiner dieser Titel und keine blosse Variante davon darf "
            "vorgeschlagen werden:\n"
            + _bullet(p.vorhandeneTitel)
        )
    if p and p.favoritenTitel:
        teile.append(
            "Als Favorit markiert — daran lässt sich der Geschmack ablesen: "
            + _bullet(p.favoritenTitel)
        )
    if p and p.bestbewerteteTitel:
        teile.append("Am besten bewertet: " + _bullet(p.bestbewerteteTitel))
    if p and p.haeufigGekochteTitel:
        teile.append(
            "Laut Kochhistorie am häufigsten tatsächlich gekocht — das zählt "
            "mehr als Gespeichertes, denn es zeigt, was wirklich auf den Tisch kommt: "
            + _bullet(p.haeufigGekochteTitel)
        )
    if p and p.haeufigsteKuechen:
        teile.append(
            "Häufigste Küchen: "
            + ", ".join(f"{k.wert} ({k.anzahl})" for k in p.haeufigsteKuechen)
        )
    if p and p.haeufigsteKategorien:
        teile.append(
            "Häufigste Kategorien: "
            + ", ".join(f"{k.wert} ({k.anzahl})" for k in p.haeufigsteKategorien)
        )
    if p and p.haeufigsteZutaten:
        teile.append(
            "Zutaten, die in dieser Küche ständig vorkommen (die Vorratskammer): "
            + _bullet(p.haeufigsteZutaten)
        )
    if p and p.haeufigsteTags:
        teile.append("Wiederkehrende Merkmale: " + _bullet(p.haeufigsteTags))

    # ── Vorgaben aus dem Formular ──
    if body.ingredients:
        teile.append("\nDiese Zutaten sind vorhanden und sollen verwendet werden: "
                     + _bullet(body.ingredients))
    if body.cuisine:
        teile.append(f"Gewünschte Küche: {body.cuisine}")
    if body.dietary:
        teile.append(f"Ernährungsweise, zwingend einzuhalten: {_bullet(body.dietary)}")
    teile.append(f"Maximale Gesamtzeit je Rezept: {body.time_budget_minutes} Minuten")

    # ── Saison: Tatsachen statt Vermutungen ──
    if body.season_month or body.seasonal_ingredients:
        monat = body.season_month or body.season
        zeile = f"\nEs ist {monat}"
        if body.season:
            zeile += f" ({body.season})"
        zeile += "."
        if body.seasonal_ingredients:
            zeile += (" In der Schweiz hat gerade Saison: "
                      + _bullet(body.seasonal_ingredients) + ".")
        if body.seasonal_occasions:
            zeile += " Kulinarisch steht an: " + _bullet(body.seasonal_occasions) + "."
        zeile += (" Mindestens drei der fünf Vorschläge müssen eine dieser "
                  "Saisonzutaten tragend verwenden — nicht als Beilage.")
        teile.append(zeile)

    if body.exclude_titles:
        teile.append(
            "\nDiese Titel wurden soeben schon vorgeschlagen und sind "
            "ausgeschlossen: " + _bullet(body.exclude_titles)
        )

    # ── Harte Regeln ──
    teile.append(
        "\nREGELN:\n"
        f"1. Genau {ANZAHL_VORSCHLAEGE} Vorschläge. Jedes Feld jedes Vorschlags "
        "ausfüllen, keine leeren Zeichenketten, keine leeren Listen.\n"
        "2. Fünf verschiedene Hauptzutaten und fünf verschiedene Garmethoden "
        "(z. B. schmoren, backen, braten, dämpfen, roh). Höchstens ein "
        "Vorschlag je Küche.\n"
        "3. Verboten, weil abgegriffen und beliebig: "
        + _bullet(ABGEGRIFFENE_GERICHTE)
        + " — ausser die Vorgaben verlangen ausdrücklich danach.\n"
        "4. Kein Vorschlag darf ein Gericht aus der Sammlung wiederholen oder "
        "leicht abwandeln.\n"
        "5. 'why_it_fits': genau ein Satz, der konkret auf diese Sammlung oder "
        "diese Vorgaben Bezug nimmt (nenne ein Rezept, eine Küche oder eine "
        "Zutat daraus beim Namen). Keine Allgemeinplätze wie 'passt gut zu "
        "Ihrem Geschmack'.\n"
        "6. 'highlight': genau ein Satz über die eine Technik oder Wendung, die "
        "dieses Gericht besonders macht — etwas, das man nicht ohnehin weiss.\n"
        "7. 'key_ingredients': 3 bis 6 tragende Zutaten. "
        "'missing_ingredients': was davon eingekauft werden muss, gemessen an "
        "den vorhandenen Zutaten und der Vorratskammer oben; ist alles da, "
        "bleibt die Liste leer.\n"
        "8. 'description': genau zwei Sätze — was es ist und wie es schmeckt.\n"
        "9. 'cuisine' und 'category' als einzelne Wörter (z. B. 'Schweizer', "
        "'Hauptgang').\n"
        "10. 'difficulty' ist genau eines von: einfach, mittel, anspruchsvoll. "
        "'time_estimate_minutes' ist eine ganze Zahl.\n"
        "11. Deutsch in Schweizer Standardschreibung: immer 'ss', nie 'ß'. "
        "Schweizer Masseinheiten (dl, EL, TL, KL, °C)."
    )

    return "\n".join(teile)


# ── Qualitätsprüfung ─────────────────────────────────────────────────────────


# Deutsche Umlaute werden ausgeschrieben, nicht bloss entakzentuiert: "Rösti"
# und "Roesti" sind dasselbe Gericht, "Rosti" wäre eine andere Zeichenkette.
# Gleiche Abbildung wie `rm_normalize` in der Datenbank und
# `normalizeForSearch` im Frontend.
_UMLAUTE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def _normalize_title(title: str) -> str:
    """Klein, Umlaute ausgeschrieben, ohne Satzzeichen — für den Duplikatvergleich."""
    lowered = title.lower().strip().translate(_UMLAUTE)
    # Was danach noch an Akzenten übrig ist (z. B. "é" in "Purée"), fällt weg.
    decomposed = unicodedata.normalize("NFKD", lowered)
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", without_accents).strip()


def find_quality_issues(
    suggestions: list[RecipeSuggestion], body: SuggestRequest
) -> list[str]:
    """
    Prüft das Modellergebnis gegen die Vorgaben des Prompts.

    Gibt die Beanstandungen als Klartext zurück — sie gehen wörtlich in den
    Nachschlag, damit das Modell weiss, was es korrigieren soll. Leere Liste
    heisst: die Antwort erfüllt die Vorgaben.
    """
    issues: list[str] = []

    if len(suggestions) < ANZAHL_VORSCHLAEGE:
        issues.append(
            f"Es kamen nur {len(suggestions)} statt {ANZAHL_VORSCHLAEGE} Vorschläge."
        )

    verboten = {_normalize_title(t) for t in body.exclude_titles}
    if body.taste_profile:
        verboten |= {_normalize_title(t) for t in body.taste_profile.vorhandeneTitel}

    doppelte = [s.title for s in suggestions if _normalize_title(s.title) in verboten]
    if doppelte:
        issues.append(
            "Diese Vorschläge stehen bereits in der Sammlung oder waren "
            "ausgeschlossen: " + ", ".join(doppelte) + "."
        )

    # Duplikate innerhalb der Antwort selbst
    gesehen: set[str] = set()
    intern_doppelt: list[str] = []
    for s in suggestions:
        n = _normalize_title(s.title)
        if n in gesehen:
            intern_doppelt.append(s.title)
        gesehen.add(n)
    if intern_doppelt:
        issues.append("Mehrfach vorgeschlagen: " + ", ".join(intern_doppelt) + ".")

    leer = [
        s.title
        for s in suggestions
        if not s.why_it_fits.strip()
        or not s.highlight.strip()
        or not s.description.strip()
        or not s.key_ingredients
    ]
    if leer:
        issues.append(
            "Bei diesen Vorschlägen fehlen Pflichtangaben (why_it_fits, "
            "highlight, description oder key_ingredients): " + ", ".join(leer) + "."
        )

    kuechen: dict[str, int] = {}
    for s in suggestions:
        schluessel = _normalize_title(s.cuisine)
        if schluessel:
            kuechen[schluessel] = kuechen.get(schluessel, 0) + 1
    gehaeuft = [k for k, v in kuechen.items() if v > 2]
    if gehaeuft:
        issues.append(
            "Mehr als zwei Vorschläge stammen aus derselben Küche — die Regel "
            "verlangt höchstens einen je Küche."
        )

    return issues


def build_retry_prompt(base_prompt: str, issues: list[str]) -> str:
    """Der Nachschlag nennt die Beanstandungen beim Namen statt nur zu wiederholen."""
    return (
        base_prompt
        + "\n\nDER VORHERIGE VERSUCH WAR FEHLERHAFT:\n- "
        + "\n- ".join(issues)
        + "\nLiefere eine vollständig neue Antwort, die alle Regeln einhält."
    )


ERLAUBTE_SCHWIERIGKEIT = {"einfach", "mittel", "anspruchsvoll"}


def normalize_suggestions(suggestions: list[RecipeSuggestion]) -> list[RecipeSuggestion]:
    """
    Deterministische Nachbearbeitung statt Hoffen auf das Modell.

    Die Schwierigkeit steuert im Frontend eine Farbzuordnung; ein Wert
    ausserhalb der drei erlaubten Stufen führt dort zu einem leeren Etikett.
    Das lässt sich in Code sicher abfangen, im Prompt nicht.
    """
    for s in suggestions:
        stufe = s.difficulty.strip().lower()
        s.difficulty = stufe if stufe in ERLAUBTE_SCHWIERIGKEIT else "mittel"
        s.time_estimate_minutes = max(1, int(s.time_estimate_minutes))
        s.title = s.title.strip()
    return suggestions


def drop_unusable(
    suggestions: list[RecipeSuggestion], body: SuggestRequest
) -> list[RecipeSuggestion]:
    """
    Letzte Instanz, wenn auch der Nachschlag nicht sauber ist: Duplikate und
    Vorschläge ohne Pflichtangaben fliegen raus. Lieber drei brauchbare
    Vorschläge ausliefern als fünf, von denen zwei schon im Kochbuch stehen.
    """
    verboten = {_normalize_title(t) for t in body.exclude_titles}
    if body.taste_profile:
        verboten |= {_normalize_title(t) for t in body.taste_profile.vorhandeneTitel}

    behalten: list[RecipeSuggestion] = []
    gesehen: set[str] = set()
    for s in suggestions:
        n = _normalize_title(s.title)
        if n in verboten or n in gesehen:
            continue
        if not s.title.strip() or not s.description.strip():
            continue
        gesehen.add(n)
        behalten.append(s)
    return behalten
