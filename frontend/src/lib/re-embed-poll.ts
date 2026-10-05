/**
 * Abfrageintervall der Fortschrittsanzeige für den Re-Embedding-Job.
 *
 * Eigene Datei ohne Server-Abhängigkeiten: das Admin-Dashboard (Client) pollt
 * in diesem Takt, und RE_EMBED_STATUS_LIMIT in rate-limit.ts leitet daraus
 * sein Kontingent ab. So können die beiden Werte nicht auseinanderlaufen.
 */
export const RE_EMBED_POLL_INTERVAL_MS = 3_000;
