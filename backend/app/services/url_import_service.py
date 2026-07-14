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

# Kappt den gepufferten Response-Body beim URL-Import. Ohne diese Grenze würde
# httpx den kompletten Body in den Speicher laden, egal wie gross er ist —
# eine bösartige/kompromittierte "Rezept"-URL könnte mit einer riesigen
# Antwort (oder Dekompressions-Bombe) den Worker-Speicher erschöpfen. Der
# genutzte Seitentext wird ohnehin auf 8000 Zeichen gekürzt, daher reichen
# wenige MB für jede legitime Rezeptseite völlig aus.
_MAX_IMPORT_RESPONSE_BYTES = 5 * 1024 * 1024  # 5 MB

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


async def _validate_all_ips(hostname: str) -> list[str]:
    """
    Löst ALLE A/AAAA-Einträge des Hostnamens auf und wirft ValueError,
    sobald eine Adresse privat, loopback oder link-local ist.
    Verhindert Multi-Record-Bypass und IPv6-only-Hosts.

    Gibt die validierten Rohadressen (in Auflösungsreihenfolge) zurück, damit
    Aufrufer, die tatsächlich eine Verbindung öffnen (siehe _SafeTransport),
    exakt die hier geprüfte Adresse verwenden können, statt sich auf eine
    zweite, unabhängige Auflösung zu verlassen (siehe Kommentar dort).
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

    validated_ips: list[str] = []
    for _family, _type, _proto, _canonname, sockaddr in results:
        raw_ip = sockaddr[0]
        try:
            addr = ipaddress.ip_address(raw_ip)
        except ValueError:
            continue
        # IPv4-mapped IPv6-Adressen (::ffff:a.b.c.d) betten eine IPv4-Adresse
        # ein, die der Kernel auf einem Dual-Stack-Socket direkt an das
        # eingebettete IPv4-Ziel weiterleitet. `addr in net` liefert für
        # unterschiedliche IP-Versionen stillschweigend False (keine
        # Exception), daher würde z.B. ein AAAA-Eintrag
        # "::ffff:169.254.169.254" die rein IPv4-basierten Netze in
        # _BLOCKED_NETWORKS umgehen. Zusätzlich die entpackte IPv4-Adresse
        # prüfen, um diesen Bypass zu schliessen.
        candidates: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = [addr]
        mapped = getattr(addr, "ipv4_mapped", None)
        if mapped is not None:
            candidates.append(mapped)
        if any(candidate in net for candidate in candidates for net in _BLOCKED_NETWORKS):
            raise ValueError(
                f"Adresse {raw_ip!r} ist ein privates/internes Netz (SSRF-Schutz)"
            )
        validated_ips.append(raw_ip)

    if not validated_ips:
        raise ValueError(f"Keine gültige Adresse für Hostname: {hostname!r}")
    return validated_ips


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
    Validiert ALLE A/AAAA-Adressen unmittelbar vor jeder TCP-Verbindung UND
    verbindet exakt zu der geprüften Adresse (DNS-Pinning).

    Nur den Hostnamen vor dem Connect zu validieren (via socket.getaddrinfo)
    und die eigentliche Verbindung dann `super().handle_async_request()` zu
    überlassen, schliesst DNS-Rebinding NICHT: httpcore löst den Hostnamen für
    den echten TCP-Connect selbst und unabhängig erneut auf (siehe
    httpcore._backends.anyio.connect_tcp → anyio.connect_tcp → eigener
    getaddrinfo-Aufruf). Ein Angreifer mit Kontrolle über die autoritative
    DNS-Zone des Ziels kann die Validierungs-Anfrage mit einer öffentlichen
    Adresse beantworten und die Sekunden später folgende Connect-Anfrage
    (TTL=0) mit einer internen Adresse (z. B. 169.254.169.254) — die
    Validierung liefe dann ins Leere.

    Um das zu schliessen, wird die Ziel-URL der Anfrage auf die bereits
    validierte IP-Adresse umgeschrieben, sodass httpcore keine eigene,
    unabhängig beantwortbare DNS-Auflösung mehr durchführt. Host-Header
    (bereits beim Request-Aufbau gesetzt) und TLS-SNI/Zertifikatsprüfung
    (via der `sni_hostname`-Extension) bleiben auf den ursprünglichen
    Hostnamen gepinnt, sodass virtuelles Hosting und Zertifikatsvalidierung
    unverändert funktionieren.
    """

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        hostname = request.url.host
        # IPv6-Literale in eckigen Klammern normalisieren
        if hostname.startswith("[") and hostname.endswith("]"):
            hostname = hostname[1:-1]
        try:
            validated_ips = await _validate_all_ips(hostname)
        except ValueError as exc:
            raise httpx.ConnectError(str(exc)) from exc

        pinned_ip = validated_ips[0]
        pinned_url = request.url.copy_with(host=pinned_ip)
        pinned_request = httpx.Request(
            method=request.method,
            url=pinned_url,
            headers=request.headers,
            stream=request.stream,
            extensions={**request.extensions, "sni_hostname": hostname},
        )
        return await super().handle_async_request(pinned_request)


async def _bounded_get(
    client: httpx.AsyncClient, url: str, headers: dict[str, str]
) -> httpx.Response:
    """
    GET mit gestreamtem Body, der bei _MAX_IMPORT_RESPONSE_BYTES abgebrochen
    wird, statt die komplette Antwort ungeprüft in den Speicher zu laden.
    Gibt eine normale httpx.Response zurück (Body bereits vollständig
    gelesen und über response.text zugänglich), sodass der Rest der
    Aufrufer-Logik unverändert bleibt.
    """
    request = client.build_request("GET", url, headers=headers)
    response = await client.send(request, stream=True)
    try:
        total = 0
        chunks: list[bytes] = []
        async for chunk in response.aiter_bytes():
            total += len(chunk)
            if total > _MAX_IMPORT_RESPONSE_BYTES:
                raise ValueError(
                    f"Antwort von {url!r} überschreitet das Limit von "
                    f"{_MAX_IMPORT_RESPONSE_BYTES} Bytes."
                )
            chunks.append(chunk)
    finally:
        await response.aclose()
    # response._content ist das offizielle httpx-Internal, das .text/.json()
    # verwenden, sobald der Body manuell (per stream=True) gelesen wurde.
    response._content = b"".join(chunks)
    return response


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


def _extract_image_url(value: object) -> Optional[str]:
    """Extrahiert die erste HTTPS-Bild-URL aus dem JSON-LD image-Feld.
    Unterstützt: String, Liste, ImageObject, Liste von ImageObjects."""
    if isinstance(value, str):
        candidates = [value]
    elif isinstance(value, list):
        candidates = [
            (v if isinstance(v, str) else v.get("url") or v.get("contentUrl") or "")
            for v in value
            if isinstance(v, (str, dict))
        ]
    elif isinstance(value, dict):
        candidates = [value.get("url") or value.get("contentUrl") or ""]
    else:
        return None
    for url in candidates:
        if isinstance(url, str) and url.startswith("https://"):
            return url
    return None


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
        image_url=_extract_image_url(data.get("image")),
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
        response = await _bounded_get(client, url, headers)
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
            response = await _bounded_get(client, redirect_url, headers)
            url = redirect_url
            redirect_count += 1
        response.raise_for_status()

    # Parsing ist synchron CPU-gebunden (großer DOM → 100-500 ms); im Thread-Pool
    # ausführen, damit der Event-Loop nicht blockiert und gleichzeitige Importe
    # nicht serialisieren.
    soup = await asyncio.to_thread(BeautifulSoup, response.text, "html.parser")

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
    page_text = (
        await asyncio.to_thread(soup.get_text, separator="\n", strip=True)
    )[:8000]
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
