"""
KI-Wochenplan (Phase 21): plant aus den *eigenen* Rezepten der Nutzerin.

Das Modell wählt Kandidaten-Indizes aus einer kompakten Liste, die Next.js
zusammenstellt (Titel, Küche, Zeit, Tags, Favorit, Bewertung, Kochhistorie).
Alles, was sich aus den Kandidatendaten prüfen lässt, prüft `find_plan_issues`
deterministisch; ein Nachschlag nennt die Beanstandungen; danach repariert
und füllt `repair_plan` — die Nutzerin bekommt nie einen halben Plan.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field

MealType = Literal["fruehstueck", "mittagessen", "abendessen", "snack"]

MEAL_LABELS: dict[str, str] = {
    "fruehstueck": "Frühstück",
    "mittagessen": "Mittagessen",
    "abendessen": "Abendessen",
    "snack": "Snack",
}
MEAL_ORDER: dict[str, int] = {k: i for i, k in enumerate(MEAL_LABELS)}
DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]

# Reste lohnen sich erst ab dieser Portionenzahl des Kandidaten.
LEFTOVER_MIN_SERVINGS = 6


# ── Anfrage ──────────────────────────────────────────────────────────────────


class PlanCandidate(BaseModel):
    """Kompakte Form (Kurzschlüssel sparen Tokens): i=Index, t=Titel, c=Kategorie,
    k=Küche, m=Minuten, p=Portionen, tg=Tags, f=Favorit, r=Bewertung,
    n=wie oft gekocht, d=Tage seit zuletzt gekocht, v=vegetarisch."""

    i: int = Field(ge=0)
    t: Annotated[str, Field(max_length=500)]
    c: Optional[Annotated[str, Field(max_length=100)]] = None
    k: Optional[Annotated[str, Field(max_length=100)]] = None
    m: Optional[int] = None
    p: int = 4
    tg: list[Annotated[str, Field(max_length=50)]] = Field(default=[], max_length=20)
    f: int = 0
    r: Optional[float] = None
    n: int = 0
    d: Optional[int] = None
    v: int = 0


class PlanSlot(BaseModel):
    day_index: int = Field(ge=0, le=6)
    meal_type: MealType
    is_weekday: bool = True


class PlanWeekRequest(BaseModel):
    slots: list[PlanSlot] = Field(min_length=1, max_length=28)
    candidates: list[PlanCandidate] = Field(default=[], max_length=120)
    vegetarian_min: int = Field(0, ge=0, le=28)
    max_minutes_weekday: Optional[int] = Field(None, ge=5, le=480)
    vary_cuisine: bool = True
    use_leftovers: bool = False
    new_suggestions_max: int = Field(0, ge=0, le=7)
    wish: Annotated[str, Field(max_length=500)] = ""
    season_month: Annotated[str, Field(max_length=20)] = ""
    seasonal_ingredients: list[Annotated[str, Field(max_length=100)]] = Field(default=[], max_length=40)
    day_labels: list[Annotated[str, Field(max_length=40)]] = Field(default=[], max_length=7)


# ── Antwort ──────────────────────────────────────────────────────────────────


class PlanEntry(BaseModel):
    day_index: int
    meal_type: str
    candidate_index: Optional[int] = None
    new_title: Optional[str] = None
    new_description: Optional[str] = None
    reason: str = ""
    leftover_of_day: Optional[int] = None


class PlanWeekResponse(BaseModel):
    entries: list[PlanEntry]


class PlanWeekResult(BaseModel):
    entries: list[PlanEntry]
    filled_by_fallback: list[str]
    issues_remaining: list[str]


# ── Hilfen ───────────────────────────────────────────────────────────────────


def slot_key(day_index: int, meal_type: str) -> str:
    return f"{day_index}-{meal_type}"


def _day_label(body: PlanWeekRequest, day_index: int) -> str:
    if day_index < len(body.day_labels) and body.day_labels[day_index]:
        return body.day_labels[day_index]
    return DAY_NAMES[day_index] if 0 <= day_index < 7 else f"Tag {day_index}"


def _candidate_line(c: PlanCandidate) -> str:
    parts = [f"i={c.i}", f"t=«{c.t}»"]
    if c.k:
        parts.append(f"k={c.k}")
    if c.c:
        parts.append(f"c={c.c}")
    if c.m is not None:
        parts.append(f"m={c.m}")
    parts.append(f"p={c.p}")
    if c.tg:
        parts.append("tg=" + "/".join(c.tg[:6]))
    if c.f:
        parts.append("f=1")
    if c.r is not None:
        parts.append(f"r={c.r:.1f}")
    parts.append(f"n={c.n}")
    parts.append(f"d={c.d if c.d is not None else 'nie'}")
    if c.v:
        parts.append("v=1")
    return "- " + " ".join(parts)


# ── Prompt ───────────────────────────────────────────────────────────────────


def build_plan_prompt(body: PlanWeekRequest) -> str:
    slots = sorted(body.slots, key=lambda s: (s.day_index, MEAL_ORDER.get(s.meal_type, 9)))
    slot_lines = [
        f"- day_index={s.day_index} meal_type={s.meal_type} "
        f"({_day_label(body, s.day_index)}, {MEAL_LABELS.get(s.meal_type, s.meal_type)}, "
        f"{'Werktag' if s.is_weekday else 'Wochenende'})"
        for s in slots
    ]

    teile: list[str] = [
        "Du planst die Woche für eine Schweizer Küche. Du wählst ausschliesslich "
        "aus der Rezeptsammlung dieser Person (unten) und begründest jede Wahl.",
        "\nZU FÜLLENDE PLÄTZE (jeder genau einmal):\n" + "\n".join(slot_lines),
    ]

    if body.candidates:
        teile.append(
            "\nREZEPTSAMMLUNG (Legende: i=Index, t=Titel, k=Küche, c=Kategorie, "
            "m=Minuten, p=Portionen, tg=Tags, f=Favorit, r=Bewertung 1–5, "
            "n=wie oft gekocht, d=Tage seit zuletzt gekocht oder «nie», v=vegetarisch):\n"
            + "\n".join(_candidate_line(c) for c in body.candidates)
        )
    else:
        teile.append("\nDie Sammlung ist leer — alle Plätze müssen neue Vorschläge sein.")

    if body.season_month:
        saison = f"\nSAISON: {body.season_month}."
        if body.seasonal_ingredients:
            saison += " Jetzt in der Schweiz: " + ", ".join(body.seasonal_ingredients[:25]) + "."
        teile.append(saison)

    if body.wish:
        teile.append(f"\nWUNSCH DER PERSON: {body.wish}")

    regeln: list[str] = [
        "Fülle jeden Platz genau einmal; lasse keinen aus und erfinde keinen dazu.",
        "`candidate_index` ist ein `i` aus der Sammlung. Kein Rezept zweimal in der Woche"
        + (
            " — Ausnahme «Reste»: ein Rezept mit p ≥ 6 darf am direkt folgenden Tag im "
            "gleichen Platz wiederholt werden; dann `leftover_of_day` auf den ersten Tag setzen."
            if body.use_leftovers
            else "."
        ),
    ]
    if body.new_suggestions_max > 0:
        regeln.append(
            f"Höchstens {body.new_suggestions_max} Plätze dürfen ein NEUES Gericht sein, das nicht "
            "in der Sammlung steht: dann `candidate_index` null, `new_title` (Titel) und "
            "`new_description` (zwei Sätze) füllen. Neue Gerichte zählen nicht als vegetarisch."
        )
    else:
        regeln.append("Keine neuen Gerichte: `new_title` und `new_description` bleiben null.")
    if body.max_minutes_weekday is not None:
        regeln.append(
            f"An Werktagen nur Rezepte mit m ≤ {body.max_minutes_weekday} Minuten "
            "(Rezepte ohne Zeitangabe sind erlaubt)."
        )
    if body.vegetarian_min > 0:
        regeln.append(f"Mindestens {body.vegetarian_min} Plätze mit einem Rezept, das v=1 hat.")
    if body.vary_cuisine:
        regeln.append("Aufeinanderfolgende Tage nie mit derselben Küche (k).")
    regeln += [
        "Bevorzuge, was lange nicht gekocht wurde (hohes d oder «nie») und selten gekocht wurde (niedriges n); "
        "Favoriten (f=1) und gut Bewertetes (r) gehören trotzdem regelmässig auf den Tisch.",
        "Berücksichtige die Saison, wo die Sammlung das hergibt.",
        "`reason`: genau ein konkreter Satz, warum dieses Rezept an diesem Tag — nicht «passt gut».",
        "Alles auf Deutsch (Schweizer Standard, «ss» statt «ß»).",
    ]
    teile.append("\nREGELN:\n" + "\n".join(f"{i + 1}. {r}" for i, r in enumerate(regeln)))
    return "\n".join(teile)


def build_retry_prompt(base_prompt: str, issues: list[str]) -> str:
    return (
        base_prompt
        + "\n\nDEIN LETZTER PLAN WURDE ABGELEHNT. Beanstandungen:\n"
        + "\n".join(f"- {i}" for i in issues)
        + "\n\nErstelle den Plan neu und behebe jede Beanstandung."
    )


# ── Qualitätsschranke ────────────────────────────────────────────────────────


def find_plan_issues(entries: list[PlanEntry], body: PlanWeekRequest) -> list[str]:
    issues: list[str] = []
    by_index = {c.i: c for c in body.candidates}
    wanted = {slot_key(s.day_index, s.meal_type): s for s in body.slots}

    seen_slots: set[str] = set()
    for e in entries:
        key = slot_key(e.day_index, e.meal_type)
        if key not in wanted:
            issues.append(f"Platz {key} wurde nicht verlangt.")
        elif key in seen_slots:
            issues.append(f"Platz {key} ist doppelt belegt.")
        seen_slots.add(key)
    missing = [k for k in wanted if k not in seen_slots]
    if missing:
        issues.append("Nicht gefüllte Plätze: " + ", ".join(missing) + ".")

    new_count = 0
    used: dict[int, list[PlanEntry]] = {}
    for e in entries:
        if e.candidate_index is None:
            if not e.new_title:
                issues.append(f"Platz {slot_key(e.day_index, e.meal_type)} hat weder Rezept noch neuen Vorschlag.")
                continue
            new_count += 1
            continue
        if e.candidate_index not in by_index:
            issues.append(f"candidate_index {e.candidate_index} gibt es nicht.")
            continue
        if e.new_title:
            issues.append(f"Platz {slot_key(e.day_index, e.meal_type)} hat Rezept UND neuen Vorschlag.")
        used.setdefault(e.candidate_index, []).append(e)

    if new_count > body.new_suggestions_max:
        issues.append(
            f"{new_count} neue Vorschläge, erlaubt sind höchstens {body.new_suggestions_max}."
        )

    for idx, group in used.items():
        if len(group) < 2:
            continue
        cand = by_index[idx]
        group_sorted = sorted(group, key=lambda e: e.day_index)
        ok = (
            body.use_leftovers
            and len(group) == 2
            and cand.p >= LEFTOVER_MIN_SERVINGS
            and group_sorted[1].day_index == group_sorted[0].day_index + 1
            and group_sorted[1].meal_type == group_sorted[0].meal_type
        )
        if not ok:
            issues.append(f"«{cand.t}» ist {len(group)}-mal eingeplant.")

    if body.vegetarian_min > 0:
        veg = sum(
            1
            for e in entries
            if e.candidate_index is not None
            and e.candidate_index in by_index
            and by_index[e.candidate_index].v
        )
        if veg < body.vegetarian_min:
            issues.append(f"Nur {veg} vegetarische Plätze, verlangt sind {body.vegetarian_min}.")

    if body.max_minutes_weekday is not None:
        for e in entries:
            slot = wanted.get(slot_key(e.day_index, e.meal_type))
            cand = by_index.get(e.candidate_index) if e.candidate_index is not None else None
            if slot and slot.is_weekday and cand and cand.m is not None and cand.m > body.max_minutes_weekday:
                issues.append(
                    f"«{cand.t}» braucht {cand.m} Minuten, am Werktag sind höchstens "
                    f"{body.max_minutes_weekday} erlaubt."
                )

    if body.vary_cuisine:
        by_day: dict[int, set[str]] = {}
        for e in entries:
            cand = by_index.get(e.candidate_index) if e.candidate_index is not None else None
            if cand and cand.k:
                by_day.setdefault(e.day_index, set()).add(cand.k.strip().lower())
        for day, kuechen in by_day.items():
            nxt = by_day.get(day + 1)
            if nxt and kuechen & nxt:
                issues.append(
                    f"Tag {day} und Tag {day + 1} haben dieselbe Küche ({', '.join(sorted(kuechen & nxt))})."
                )

    return issues


# ── Reparatur und deterministisches Auffüllen ───────────────────────────────


def _candidate_sort_key(c: PlanCandidate, need_veg: bool) -> tuple:
    # Kleinere Werte zuerst: Vegi-Bedarf, nie/lange nicht gekocht, selten gekocht, Favorit, Bewertung, Index
    days = 10_000 if c.d is None else c.d
    return (
        0 if (c.v or not need_veg) else 1,
        -days,
        c.n,
        0 if c.f else 1,
        -(c.r or 0),
        c.i,
    )


def repair_plan(entries: list[PlanEntry], body: PlanWeekRequest) -> tuple[list[PlanEntry], list[str]]:
    """Entfernt Ungültiges, füllt Fehlendes deterministisch. Gibt (Plan, aufgefüllte Slot-Keys) zurück."""
    by_index = {c.i: c for c in body.candidates}
    wanted = {slot_key(s.day_index, s.meal_type): s for s in body.slots}

    kept: dict[str, PlanEntry] = {}
    used_counts: dict[int, int] = {}
    new_count = 0
    for e in entries:
        key = slot_key(e.day_index, e.meal_type)
        slot = wanted.get(key)
        if slot is None or key in kept:
            continue
        if e.candidate_index is None:
            if not e.new_title or new_count >= body.new_suggestions_max:
                continue
            new_count += 1
            kept[key] = PlanEntry(**{**e.model_dump(), "meal_type": slot.meal_type})
            continue
        cand = by_index.get(e.candidate_index)
        if cand is None:
            continue
        if slot.is_weekday and body.max_minutes_weekday is not None and cand.m is not None and cand.m > body.max_minutes_weekday:
            continue
        already = used_counts.get(cand.i, 0)
        if already >= 1:
            allowed_leftover = (
                body.use_leftovers
                and already == 1
                and cand.p >= LEFTOVER_MIN_SERVINGS
                and any(
                    k.day_index == e.day_index - 1 and k.meal_type == e.meal_type and k.candidate_index == cand.i
                    for k in kept.values()
                )
            )
            if not allowed_leftover:
                continue
        used_counts[cand.i] = already + 1
        kept[key] = PlanEntry(
            **{**e.model_dump(), "meal_type": slot.meal_type, "new_title": None, "new_description": None}
        )

    filled = fill_remaining(kept, body, used_counts)
    ordered = sorted(kept.values(), key=lambda e: (e.day_index, MEAL_ORDER.get(e.meal_type, 9)))
    return ordered, filled


def fill_remaining(kept: dict[str, PlanEntry], body: PlanWeekRequest, used_counts: dict[int, int]) -> list[str]:
    """Füllt offene Plätze aus den Kandidaten; erlaubt Wiederholung nur, wenn der Pool zu klein ist."""
    by_index = {c.i: c for c in body.candidates}
    filled: list[str] = []
    slots = sorted(body.slots, key=lambda s: (s.day_index, MEAL_ORDER.get(s.meal_type, 9)))

    def veg_count() -> int:
        return sum(
            1 for e in kept.values() if e.candidate_index is not None and by_index[e.candidate_index].v
        )

    def cuisine_of_day(day: int) -> set[str]:
        return {
            by_index[e.candidate_index].k.strip().lower()
            for e in kept.values()
            if e.day_index == day and e.candidate_index is not None and by_index[e.candidate_index].k
        }

    for slot in slots:
        key = slot_key(slot.day_index, slot.meal_type)
        if key in kept:
            continue
        need_veg = veg_count() < body.vegetarian_min
        neighbours = cuisine_of_day(slot.day_index - 1) | cuisine_of_day(slot.day_index + 1)

        def eligible(c: PlanCandidate, allow_reuse: bool) -> bool:
            if not allow_reuse and used_counts.get(c.i, 0) > 0:
                return False
            if slot.is_weekday and body.max_minutes_weekday is not None and c.m is not None and c.m > body.max_minutes_weekday:
                return False
            return True

        pool = [c for c in body.candidates if eligible(c, allow_reuse=False)]
        reused = False
        if not pool:
            pool = [c for c in body.candidates if eligible(c, allow_reuse=True)]
            reused = True
        if not pool:
            continue  # gar nichts passt — bleibt offen, taucht in issues_remaining auf

        if body.vary_cuisine:
            fresh = [c for c in pool if not c.k or c.k.strip().lower() not in neighbours]
            if fresh:
                pool = fresh

        chosen = min(pool, key=lambda c: _candidate_sort_key(c, need_veg))
        used_counts[chosen.i] = used_counts.get(chosen.i, 0) + 1
        if reused:
            grund = "Automatisch ergänzt (Wiederholung, da die Sammlung klein ist)."
        elif need_veg and chosen.v:
            grund = "Automatisch ergänzt: vegetarisch, wie gewünscht."
        elif chosen.d is None:
            grund = "Automatisch ergänzt: noch nie gekocht."
        else:
            grund = f"Automatisch ergänzt: zuletzt vor {chosen.d} Tagen gekocht."
        kept[key] = PlanEntry(
            day_index=slot.day_index,
            meal_type=slot.meal_type,
            candidate_index=chosen.i,
            reason=grund,
        )
        filled.append(key)
    return filled
