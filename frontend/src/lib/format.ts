/** Formats an ISO date string in Swiss date format (dd.mm.yyyy). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Formats a byte count as a human-readable size string. */
export function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * «Heute», «Gestern», «vor 3 Wochen» — relativ zu `now`. Nimmt ISO-Zeitstempel
 * oder reine Datumsangaben (YYYY-MM-DD, als lokaler Tag interpretiert).
 */
export function relativeDate(iso: string, now: Date = new Date()): string {
  const target = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  const days = Math.round(
    (startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000,
  );
  if (days <= 0) return "Heute";
  if (days === 1) return "Gestern";
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 30) return `vor ${Math.floor(days / 7)} Wochen`;
  if (days < 365) return `vor ${Math.floor(days / 30)} Monaten`;
  return `vor ${Math.floor(days / 365)} Jahren`;
}

/**
 * Heutiges Datum in Europe/Zurich als YYYY-MM-DD — unabhängig von der
 * Server-Zeitzone, sonst kippt «heute» um Mitternacht UTC.
 */
export function zurichDateISO(now: Date = new Date()): string {
  return now
    .toLocaleString("sv-SE", { timeZone: "Europe/Zurich" })
    .slice(0, 10);
}

/** Formats a duration in minutes as "X Min." or "X Std. Y Min." */
export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`;
}
