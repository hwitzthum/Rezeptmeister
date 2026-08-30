/**
 * Ein Schritttext wird in Segmente zerlegt, die der Kochmodus nacheinander
 * rendert: Text, Timer-Knopf, hervorgehobene Zutat. Timer gewinnen bei
 * Überlappung — ihre Indizes bleiben stabil, damit die bestehenden
 * `timer-button-{schritt}-{i}`-Kennungen weiter gelten.
 */

import type { TimerMatch } from "./parse-timers";
import type { IngredientSpan } from "./link-ingredients";

export type StepSegment =
  | { kind: "text"; text: string }
  | { kind: "timer"; text: string; timer: TimerMatch; timerIndex: number }
  | { kind: "ingredient"; text: string; ingredientId: string };

interface Marked {
  start: number;
  end: number;
  segment: StepSegment;
}

export function buildStepSegments(
  text: string,
  timers: TimerMatch[],
  ingredientSpans: IngredientSpan[],
): StepSegment[] {
  const marked: Marked[] = timers.map((timer, timerIndex) => ({
    start: timer.startIndex,
    end: timer.endIndex,
    segment: {
      kind: "timer",
      text: text.slice(timer.startIndex, timer.endIndex),
      timer,
      timerIndex,
    },
  }));

  for (const span of ingredientSpans) {
    const collides = marked.some(
      (m) => span.startIndex < m.end && m.start < span.endIndex,
    );
    if (collides) continue;
    marked.push({
      start: span.startIndex,
      end: span.endIndex,
      segment: {
        kind: "ingredient",
        text: text.slice(span.startIndex, span.endIndex),
        ingredientId: span.ingredientId,
      },
    });
  }

  marked.sort((a, b) => a.start - b.start);

  const segments: StepSegment[] = [];
  let cursor = 0;
  for (const m of marked) {
    if (m.start > cursor)
      segments.push({ kind: "text", text: text.slice(cursor, m.start) });
    segments.push(m.segment);
    cursor = m.end;
  }
  if (cursor < text.length)
    segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}
