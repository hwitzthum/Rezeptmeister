/**
 * Extrahiert die geteilte Rezeptadresse aus der Query der Importieren-Seite.
 *
 * Quellen und ihre Eigenheiten:
 * - Android-Share-Target (`manifest.ts`, F.3) schickt `title`, `text` und `url`.
 *   Welche Felder gefüllt sind, entscheidet die teilende App: Chrome liefert `url`,
 *   viele andere Apps packen „Titel https://…" in `text` und lassen `url` leer.
 * - Der iOS-Kurzbefehl hängt die Teilen-Sheet-Eingabe unkodiert an `?url=` an.
 *   Bringt die geteilte Seite selbst eine Abfrage mit (`?id=1&seite=2`), zerfällt
 *   sie beim Parsen in weitere Parameter — die gehören wieder angehängt.
 */

const SHARE_KEYS = new Set(["url", "text", "title"]);

/** Genug für jede reale Rezeptadresse; verhindert überlange Eingaben. */
const MAX_URL_LENGTH = 2048;

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

function keyOf(pair: string): string {
  const eq = pair.indexOf("=");
  return (eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
}

function valueOf(pair: string): string {
  const eq = pair.indexOf("=");
  return eq === -1 ? "" : pair.slice(eq + 1);
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    // Kaputte Prozentzeichen sollen die Seite nicht sprengen.
    return value;
  }
}

/** Gibt die Adresse zurück, wenn sie eine vollständige http(s)-Adresse ist. */
function asHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return trimmed;
  } catch {
    return null;
  }
}

/** Erste http(s)-Adresse aus einem Freitext („Titel https://…"). */
function firstHttpUrl(text: string): string | null {
  const match = HTTP_URL_PATTERN.exec(text);
  if (!match) return null;
  // Satzzeichen am Ende gehören nicht zur Adresse.
  return asHttpUrl(match[0].replace(/[.,;:)\]]+$/, ""));
}

/**
 * @param search Query-String, mit oder ohne führendes `?`
 *               (z. B. `useSearchParams().toString()`).
 */
export function extractSharedUrl(search: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (!query) return null;

  const pairs = query.split("&").filter(Boolean);

  const urlIndex = pairs.findIndex((pair) => keyOf(pair) === "url");
  if (urlIndex !== -1) {
    let raw = valueOf(pairs[urlIndex]);
    if (decode(raw).includes("?")) {
      for (let i = urlIndex + 1; i < pairs.length; i++) {
        if (SHARE_KEYS.has(keyOf(pairs[i]))) break;
        raw += `&${pairs[i]}`;
      }
    }
    const candidate = asHttpUrl(decode(raw));
    if (candidate) return candidate;
  }

  for (const key of ["text", "title"]) {
    const pair = pairs.find((p) => keyOf(p) === key);
    if (!pair) continue;
    const candidate = firstHttpUrl(decode(valueOf(pair)));
    if (candidate) return candidate;
  }

  return null;
}
