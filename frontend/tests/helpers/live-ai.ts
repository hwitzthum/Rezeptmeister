/**
 * Hilfsmittel für Tests, die **echt** gegen Gemini laufen.
 *
 * Diese Tests hängen an einer fremden, mengenbegrenzten API. In einem
 * Gesamtlauf feuern nebenher Einbettungen, Vorschläge, OCR und Bildgenerierung
 * — die kostenlose Stufe von Gemini lehnt dann einzelne Aufrufe ab. Im Backend
 * steht dann `ClientError`, vorne kommt ein 502 an, und zwar auffallend
 * schnell (unter einer Sekunde statt der üblichen sieben).
 *
 * Das ist kein Fehler der Anwendung: sie reicht die Ablehnung korrekt durch.
 * Der Test soll aber die eigene Verkabelung prüfen, nicht die Tagesform der
 * fremden API. Deshalb wird ein 5xx eine begrenzte Zahl von Malen wiederholt.
 * Ein echter Regressionsfehler schlägt weiterhin fehl — nur eben später.
 */

import { test } from "@playwright/test";

/** Budget fuer einen Test mit Live-Aufruf inkl. Wiederholungen. */
const LIVE_TEST_TIMEOUT_MS = 120_000;

/** `B` ist die Form des Bodys — Objekt bei den meisten Routen, Array bei der Suche. */
export interface AiResponse<B = unknown> {
  status: number;
  body: B;
}

/**
 * Führt einen KI-Aufruf aus und wiederholt ihn bei einer Ablehnung von oben.
 *
 * @param call Muss `{ status, body }` liefern — genau wie die Aufrufe in den
 *             Phase-Specs, die `page.evaluate` mit `fetch` benutzen.
 */
export async function callLiveAi<B = unknown>(
  call: () => Promise<AiResponse<B>>,
  { tries = 4, delayMs = 4_000 }: { tries?: number; delayMs?: number } = {},
): Promise<AiResponse<B>> {
  // Ein Gemini-Aufruf dauert 5–20 s; mit Wiederholungen reichen 30 s nicht.
  test.setTimeout(LIVE_TEST_TIMEOUT_MS);
  let last: AiResponse<B> | undefined;

  for (let attempt = 1; attempt <= tries; attempt++) {
    last = await call();
    // Nur Ablehnungen von oben wiederholen. 4xx sind Fehler der Anwendung und
    // sollen sofort auffallen.
    if (last.status < 500) return last;
    if (attempt < tries) {
      console.log(
        `[live-ai] Versuch ${attempt}/${tries} bekam ${last.status} — ` +
          `warte ${delayMs} ms und versuche erneut.`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return last!;
}
