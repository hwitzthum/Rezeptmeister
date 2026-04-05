"""
URL-Import-Service für Rezeptmeister.
Fetcht eine URL, parst JSON-LD schema.org/Recipe und konvertiert
automatisch in Schweizer Masseinheiten.
Fallback: Seitentext wird an Gemini Flash zur strukturierten Extraktion geschickt.
"""

import asyncio
import ipaddress
import json
import logging
import re
import socket
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.services.ai_service import generate_structured
from app.services.ocr_service import OcrIngredient, OcrResult

logger = logging.getLogger(__name__)

# ── SSRF-Schutz ────────────────────────────────────────────────────────────────

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / AWS metadata
    ipaddress.ip_network("100.64.0.0/10"),   # shared address space
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),         # ULA
    ipaddress.ip_network("fe80::/10"),        # link-local IPv6
]


async def _validate_all_ips(hostname: str) -> None:
    """
    Löst ALLE A/AAAA-Einträge des Hostnamens auf und wirft ValueError,
    sobald eine Adresse privat, loopback oder link-local ist.
    Verhindert Multi-Record-Bypass und IPv6-only-Hosts.
    """
    loop = asyncio.get_running_loop()
    try:
        results = await loop.run_in_executor(
            None,
            lambda: socket.getaddrinfo(hostname, None, 0, socket.SOCK_STREAM),
        )
    except OSError as exc:
        raise ValueError(f"Hostname nicht auflösbar: {hostname!r}") from exc

    if not results:
        raise ValueError(f"Kein DNS-Eintrag für Hostname: {hostname!r}")

    for _family, _type, _proto, _canonname, sockaddr in results:
        raw_ip = sockaddr[0]
        try:
            addr = ipaddress.ip_address(raw_ip)
        except ValueError:
            continue
        if any(addr in net for net in _BLOCKED_NETWORKS):
            raise ValueError(
                f"Adresse {raw_ip!r} ist ein privates/internes Netz (SSRF-Schutz)"
            )


async def _is_safe_url(url: str) -> bool:
    """
    Gibt True zurück, wenn die URL sicher ist (kein privates Netz, kein localhost).
    Prüft ALLE A/AAAA-Records des Hostnamens.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        await _validate_all_ips(hostname)
        return True
    except (OSError, ValueError):
        return False


class _SafeTransport(httpx.AsyncHTTPTransport):
    """
    Validiert ALLE A/AAAA-Adressen unmittelbar vor jeder TCP-Verbindung.
    Schützt gegen DNS-Rebinding: auch wenn sich das DNS zwischen der
    Vorab-Prüfung und dem eigentlichen Connect ändert, wird die Verbindung
    abgelehnt, bevor Daten gesendet werden.
    """

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        hostname = request.url.host
        # IPv6-Literale in eckigen Klammern normalisieren
        if hostname.startswith("[") and hostname.endswith("]"):
            hostname = hostname[1:-1]
        try:
            await _validate_all_ips(hostname)
        except ValueError as exc:
            raise httpx.ConnectError(str(exc)) from exc
        return await super().handle_async_request(request)


# ── Schweizer Einheiten-Konvertierungen ────────────────────────────────────────

# (Faktor auf Zieleinheit, Zieleinheit)
_UNIT_CONVERSIONS: dict[str, tuple[float, str]] = {
    "cup":    (2.4,    "dl"),
    "cups":   (2.4,    "dl"),
    "oz":     (28.35,  "g"),
    "ounce":  (28.35,  "g"),
    "ounces": (28.35,  "g"),
    "lb":     (453.6,  "g"),
    "lbs":    (453.6,  "g"),
    "pound":  (453.6,  "g"),
    "pounds": (453.6,  "g"),
    "tbsp":   (1.0,    "EL"),
    "tablespoon": (1.0, "EL"),
    "tablespoons": (1.0, "EL"),
    "tsp":    (1.0,    "TL"),
    "teaspoon":   (1.0, "TL"),
    "teaspoons":  (1.0, "TL"),
}

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _parse_iso_duration(duration: Optional[str]) -> Optional[int]:
    """Parst ISO 8601-Dauer wie PT15M, PT1H30M → Minuten."""
    if not duration:
        return None
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?", duration)
    if not match:
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    return hours * 60 + minutes


def _parse_yield(value) -> Optional[int]:
    """Extrahiert erste Ganzzahl aus recipeYield (kann String oder Liste sein)."""
    if value is None:
        return None
    if isinstance(value, list):
        value = value[0] if value else None
    if value is None:
        return None
    match = re.search(r"\d+", str(value))
    return int(match.group()) if match else None


def _parse_ingredient_string(raw: str) -> OcrIngredient:
    """
    Parst Zutaten-Strings wie '200g Mehl' oder '2 EL Olivenöl'.
    Regex: optional Menge, optional Einheit, Rest = Name.
    """
    raw = raw.strip()
    pattern = r"^([\d.,/½¼¾⅓⅔⅛⅜⅝⅞]+)\s*([a-zA-ZäöüÄÖÜ.]+)?\s+(.+)$"
    match = re.match(pattern, raw)
    if match:
        amount_str, unit, name = match.group(1), match.group(2), match.group(3)
        # Brüche normalisieren
        amount_str = (
            amount_str.replace("½", "0.5")
            .replace("¼", "0.25")
            .replace("¾", "0.75")
            .replace("⅓", "0.333")
            .replace("⅔", "0.667")
            .replace("⅛", "0.125")
        )
        try:
            if "/" in amount_str:
                parts = amount_str.split("/")
                amount = float(parts[0]) / float(parts[1])
            else:
                amount = float(amount_str.replace(",", "."))
        except (ValueError, ZeroDivisionError):
            amount = None
        return OcrIngredient(amount=amount, unit=unit, name=name.strip())
    # Kein Match: gesamter String = Name
    return OcrIngredient(amount=None, unit=None, name=raw)


def _apply_ch_conversions(ingredients: list[OcrIngredient]) -> list[OcrIngredient]:
    """Konvertiert nicht-schweizerische Einheiten in Schweizer Standard."""
    result = []
    for ing in ingredients:
        unit_lower = (ing.unit or "").lower().strip(".")
        if unit_lower in _UNIT_CONVERSIONS and ing.amount is not None:
            factor, new_unit = _UNIT_CONVERSIONS[unit_lower]
            result.append(
                OcrIngredient(
                    amount=round(ing.amount * factor, 2),
                    unit=new_unit,
                    name=ing.name,
                    notes=ing.notes,
                )
            )
        else:
            result.append(ing)
    return result


def _extract_instruction_text(instructions) -> str:
    """
    Verarbeitet recipeInstructions – kann sein:
    - einfacher String
    - Liste von Strings
    - Liste von HowToStep-Objekten (dict mit 'text'-Key)
    """
    if not instructions:
        return ""
    if isinstance(instructions, str):
        return instructions.strip()
    steps = []
    for i, step in enumerate(instructions, 1):
        if isinstance(step, str):
            steps.append(f"{i}. {step.strip()}")
        elif isinstance(step, dict):
            text = step.get("text") or step.get("name") or ""
            steps.append(f"{i}. {text.strip()}")
    return "\n".join(steps)


def _map_jsonld_to_recipe(data: dict) -> OcrResult:
    """Mappt schema.org/Recipe JSON-LD auf OcrResult."""
    raw_ingredients = data.get("recipeIngredient") or []
    ingredients = [_parse_ingredient_string(s) for s in raw_ingredients if isinstance(s, str)]
    ingredients = _apply_ch_conversions(ingredients)

    instructions_raw = data.get("recipeInstructions") or ""
    instructions = _extract_instruction_text(instructions_raw) or "Keine Anleitung verfügbar."

    # Kategorie / Küche
    cuisine = data.get("recipeCuisine")
    if isinstance(cuisine, list):
        cuisine = cuisine[0] if cuisine else None

    category = data.get("recipeCategory")
    if isinstance(category, list):
        category = category[0] if category else None

    return OcrResult(
        title=data.get("name") or "Unbekanntes Rezept",
        description=data.get("description") or None,
        servings=_parse_yield(data.get("recipeYield")),
        prep_time_minutes=_parse_iso_duration(data.get("prepTime")),
        cook_time_minutes=_parse_iso_duration(data.get("cookTime")),
        difficulty=None,
        ingredients=ingredients,
        instructions=instructions,
        tags=[t for t in [cuisine, category] if t],
        source_type="web_import",
    )


# ── Haupt-Service-Funktion ─────────────────────────────────────────────────────

async def fetch_and_parse(url: str, api_key: str, model: str) -> OcrResult:
    """
    1. Fetcht URL mit httpx
    2. Parst JSON-LD <script>-Tags nach @type: Recipe
    3. Bei Fund: Mapping auf OcrResult + CH-Einheiten-Konvertierung
    4. Fallback: bereinigter Seitentext an Gemini Flash
    5. Gibt OcrResult zurück
    """
    if not await _is_safe_url(url):
        raise ValueError(f"URL nicht erlaubt (privates Netz oder ungültiges Schema): {url}")

    headers = {"User-Agent": "Mozilla/5.0 (compatible; Rezeptmeister/1.0)"}
    async with httpx.AsyncClient(
        transport=_SafeTransport(), follow_redirects=False, timeout=15.0
    ) as client:
        response = await client.get(url, headers=headers)
        # Manuell umleiten, aber jeden Schritt auf private Adressen prüfen
        redirect_count = 0
        while response.status_code in (301, 302, 303, 307, 308) and redirect_count < 5:
            redirect_url = response.headers.get("location", "")
            if not redirect_url:
                break
            # Relative Redirect auflösen
            if not redirect_url.startswith("http"):
                from urllib.parse import urljoin
                redirect_url = urljoin(url, redirect_url)
            if not await _is_safe_url(redirect_url):
                raise ValueError(f"Redirect auf private Adresse blockiert: {redirect_url}")
            response = await client.get(redirect_url, headers=headers)
            url = redirect_url
            redirect_count += 1
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # JSON-LD zuerst versuchen
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw = script.string or ""
            if not raw.strip():
                continue
            data = json.loads(raw)

            # @graph-Arrays auflösen
            if isinstance(data, dict) and data.get("@graph"):
                data = next(
                    (x for x in data["@graph"] if x.get("@type") == "Recipe"),
                    data,
                )
            if isinstance(data, list):
                data = next(
                    (x for x in data if x.get("@type") == "Recipe"),
                    None,
                )
            if data and data.get("@type") == "Recipe":
                result = _map_jsonld_to_recipe(data)
                logger.info(f"Rezept via JSON-LD importiert: {result.title!r}")
                return result
        except (json.JSONDecodeError, AttributeError, TypeError) as e:
            logger.debug(f"JSON-LD-Parse-Fehler: {e}")
            continue

    # Fallback: Seitentext an Gemini Flash
    logger.info(f"Kein JSON-LD gefunden – Fallback auf Gemini-Textextraktion für {url}")
    page_text = soup.get_text(separator="\n", strip=True)[:8000]
    prompt = (
        "Extrahiere das Rezept aus diesem Webseitentext auf Deutsch "
        "(Schweizer Masseinheiten verwenden: g, kg, ml, dl, l, EL, TL, KL, Msp., Prise, Stk., Bund, Pkg.).\n\n"
        f"{page_text}"
    )
    result = await generate_structured(prompt, OcrResult, api_key, model, temperature=0.2)
    result.source_type = "web_import"
    # CH-Einheiten auch auf Gemini-Ergebnis anwenden
    result.ingredients = _apply_ch_conversions(result.ingredients)
    return result
