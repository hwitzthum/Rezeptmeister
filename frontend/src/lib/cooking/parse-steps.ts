/**
 * Parst Rezeptanweisungen (plain text) in einzelne Schritte.
 *
 * Erkennt nummerierte Schritte (1. / 2) / 3:) und fällt auf
 * Absatz- bzw. Zeilenumbruch-Splitting zurück.
 */

const NUMBERED_LINE = /^\s*\d+[\.\)\:]\s+/m;

export function parseSteps(instructions: string): string[] {
  if (!instructions || !instructions.trim()) return [];

  const text = instructions.trim();

  // Nummerierte Schritte erkennen
  if (NUMBERED_LINE.test(text)) {
    // Split an Zeilengrenzen, die mit einer Nummer beginnen
    const parts = text.split(/\n(?=\s*\d+[\.\)\:]\s+)/);
    return parts
      .map((p) => p.replace(/^\s*\d+[\.\)\:]\s+/, "").trim())
      .filter(Boolean);
  }

  // Fallback: Doppelte Zeilenumbrüche (Absätze)
  const paragraphs = text.split(/\n\s*\n+/);
  if (paragraphs.length > 1) {
    return paragraphs.map((p) => p.trim()).filter(Boolean);
  }

  // Letzter Fallback: Einzelne Zeilenumbrüche
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}
