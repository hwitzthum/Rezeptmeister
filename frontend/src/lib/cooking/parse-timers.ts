/**
 * Erkennt Zeitangaben in deutschem Rezepttext und gibt sie als
 * Timer-Objekte zurück. Unterstützt:
 *   - "5 Minuten", "30 Min.", "1 Minute"
 *   - "1 Stunde", "2 Std."
 *   - "10-12 Minuten" (Bereiche → Mittelwert aufgerundet)
 *   - "1 Stunde 30 Minuten" (zusammengesetzte Angaben)
 */

export interface TimerMatch {
  minutes: number;
  label: string;
  startIndex: number;
  endIndex: number;
}

// Zusammengesetzte Angabe: "1 Stunde 30 Minuten"
const COMPOUND_RE =
  /(\d+)\s*(Stunden?|Std\.?)\s+(?:und\s+)?(\d+)\s*(Minuten?|Min\.?)/gi;

// Bereich: "10-12 Minuten"
const RANGE_MIN_RE = /(\d+)\s*[-–]\s*(\d+)\s*(Minuten?|Min\.?)/gi;

// Bereich Stunden: "1-2 Stunden"
const RANGE_HR_RE = /(\d+)\s*[-–]\s*(\d+)\s*(Stunden?|Std\.?)/gi;

// Einzelne Stunden: "2 Stunden"
const HOURS_RE = /(\d+)\s*(Stunden?|Std\.?)/gi;

// Einzelne Minuten: "30 Minuten"
const MINUTES_RE = /(\d+)\s*(Minuten?|Min\.?)/gi;

export function parseTimers(text: string): TimerMatch[] {
  if (!text) return [];

  const results: TimerMatch[] = [];
  const usedRanges: Array<[number, number]> = [];

  function overlaps(start: number, end: number): boolean {
    return usedRanges.some(
      ([s, e]) => start < e && end > s,
    );
  }

  function addMatch(
    start: number,
    end: number,
    minutes: number,
    label: string,
  ) {
    if (!overlaps(start, end) && minutes > 0) {
      usedRanges.push([start, end]);
      results.push({ minutes, label, startIndex: start, endIndex: end });
    }
  }

  // 1) Zusammengesetzte Angaben zuerst (höchste Spezifität)
  for (const m of text.matchAll(COMPOUND_RE)) {
    const hours = parseInt(m[1], 10);
    const mins = parseInt(m[3], 10);
    addMatch(m.index!, m.index! + m[0].length, hours * 60 + mins, m[0]);
  }

  // 2) Bereiche Minuten
  for (const m of text.matchAll(RANGE_MIN_RE)) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    addMatch(
      m.index!,
      m.index! + m[0].length,
      Math.ceil((lo + hi) / 2),
      m[0],
    );
  }

  // 3) Bereiche Stunden
  for (const m of text.matchAll(RANGE_HR_RE)) {
    const lo = parseInt(m[1], 10);
    const hi = parseInt(m[2], 10);
    addMatch(
      m.index!,
      m.index! + m[0].length,
      Math.ceil((lo + hi) / 2) * 60,
      m[0],
    );
  }

  // 4) Einzelne Stunden
  for (const m of text.matchAll(HOURS_RE)) {
    addMatch(
      m.index!,
      m.index! + m[0].length,
      parseInt(m[1], 10) * 60,
      m[0],
    );
  }

  // 5) Einzelne Minuten
  for (const m of text.matchAll(MINUTES_RE)) {
    addMatch(m.index!, m.index! + m[0].length, parseInt(m[1], 10), m[0]);
  }

  // Nach Position sortieren
  results.sort((a, b) => a.startIndex - b.startIndex);
  return results;
}
