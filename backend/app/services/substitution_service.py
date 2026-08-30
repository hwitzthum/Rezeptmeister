"""
Ersatz-Assistent (Phase 21): «Ich habe keine Crème fraîche — was nehme ich?»

Prompt und Nachbearbeitung sind reine Funktionen, damit sie ohne Gemini
getestet werden können. Der Prompt ist bewusst fordernd formuliert — bei
«2–3 Vorschläge» liefert das Modell zwei, bei «genau drei» drei.
"""

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field

Confidence = Literal["gut", "brauchbar", "notloesung"]
_CONFIDENCE_VALUES: tuple[Confidence, ...] = ("gut", "brauchbar", "notloesung")

ANZAHL_ERSATZ = 3


class SubstituteRequest(BaseModel):
    ingredient: Annotated[str, Field(min_length=1, max_length=200)]
    amount: Optional[float] = None
    unit: Annotated[str, Field(max_length=20)] = ""
    recipe_title: Annotated[str, Field(max_length=500)] = ""
    other_ingredients: list[Annotated[str, Field(max_length=200)]] = Field(default=[], max_length=200)
    dietary: list[Annotated[str, Field(max_length=50)]] = Field(default=[], max_length=10)
    reason: Annotated[str, Field(max_length=200)] = ""


class Substitute(BaseModel):
    name: str
    amount_hint: str
    effect: str
    confidence: str


class SubstituteResponse(BaseModel):
    substitutes: list[Substitute]
    note: str = ""


def _bullet(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


def build_substitute_prompt(body: SubstituteRequest) -> str:
    menge = f"{body.amount:g} {body.unit}".strip() if body.amount else body.unit
    zutat = f"{menge} {body.ingredient}".strip() if menge else body.ingredient

    teile: list[str] = [
        "Du bist eine erfahrene Schweizer Köchin und hilfst am Herd — kurz, "
        "konkret, praxistauglich.",
        f"\nGESUCHT: Ersatz für «{zutat}»"
        + (f" im Rezept «{body.recipe_title}»." if body.recipe_title else "."),
    ]
    if body.reason:
        teile.append(f"GRUND: {body.reason}")
    if body.dietary:
        teile.append("EINSCHRÄNKUNGEN (zwingend einhalten): " + ", ".join(body.dietary))
    if body.other_ingredients:
        teile.append(
            "WEITERE ZUTATEN IM REZEPT (Ersatz muss dazu passen, Vorhandenes bevorzugen):\n"
            + _bullet(body.other_ingredients[:60])
        )

    teile.append(
        f"""
REGELN:
1. Nenne genau {ANZAHL_ERSATZ} Ersatzmöglichkeiten, beste zuerst. Keine Wiederholung
   der gesuchten Zutat, keine reinen Markennamen.
2. `name`: die Ersatzzutat, ein bis vier Wörter.
3. `amount_hint`: die Menge, die die angegebene Menge ersetzt — in Schweizer
   Masseinheiten (g, kg, ml, dl, l, EL, TL, KL, Msp., Prise, Stk.). Ohne
   Mengenangabe ein Verhältnis («gleiche Menge», «halb so viel»).
4. `effect`: genau ein Satz zur Auswirkung auf Konsistenz, Geschmack oder
   Gar-/Backzeit. Kein «funktioniert gut» ohne Begründung.
5. `confidence`: genau einer der Werte «gut», «brauchbar», «notloesung».
6. `note`: ein Satz für das ganze Rezept, falls nötig (z. B. «Backzeit ggf. um
   5 Minuten verlängern»), sonst leer.
7. Alles auf Deutsch (Schweizer Standard, «ss» statt «ß»)."""
    )
    return "\n".join(teile)


def normalize_substitutes(response: SubstituteResponse) -> SubstituteResponse:
    """Deterministische Nachbearbeitung: Vertrauenswerte klemmen, Leeres entfernen, auf drei kürzen."""
    cleaned: list[Substitute] = []
    for sub in response.substitutes:
        name = sub.name.strip()
        if not name:
            continue
        confidence = sub.confidence.strip().lower().replace("ö", "oe")
        if confidence not in _CONFIDENCE_VALUES:
            confidence = "brauchbar"
        cleaned.append(
            Substitute(
                name=name,
                amount_hint=sub.amount_hint.strip(),
                effect=sub.effect.strip(),
                confidence=confidence,
            )
        )
        if len(cleaned) == ANZAHL_ERSATZ:
            break
    return SubstituteResponse(substitutes=cleaned, note=response.note.strip())
