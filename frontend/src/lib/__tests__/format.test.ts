import { describe, it, expect } from "vitest";
import { relativeDate, zurichDateISO } from "../format";

describe("relativeDate", () => {
  const now = new Date(2026, 7, 30, 15, 0, 0); // 30.08.2026 15:00 lokal

  it("erkennt heute und gestern anhand des Kalendertags, nicht der 24 Stunden", () => {
    expect(relativeDate("2026-08-30", now)).toBe("Heute");
    expect(relativeDate(new Date(2026, 7, 30, 1, 0).toISOString(), now)).toBe(
      "Heute",
    );
    expect(relativeDate("2026-08-29", now)).toBe("Gestern");
  });

  it("staffelt Tage, Wochen, Monate, Jahre", () => {
    expect(relativeDate("2026-08-27", now)).toBe("vor 3 Tagen");
    expect(relativeDate("2026-08-09", now)).toBe("vor 3 Wochen");
    expect(relativeDate("2026-05-30", now)).toBe("vor 3 Monaten");
    expect(relativeDate("2024-08-30", now)).toBe("vor 2 Jahren");
  });

  it("behandelt Zukunftsdaten als heute", () => {
    expect(relativeDate("2026-09-05", now)).toBe("Heute");
  });
});

describe("zurichDateISO", () => {
  it("liefert das Zurich-Datum auch kurz vor Mitternacht UTC", () => {
    // 23:30 UTC am 30.08. ist in Zürich (UTC+2) bereits der 31.08.
    expect(zurichDateISO(new Date("2026-08-30T23:30:00Z"))).toBe("2026-08-31");
    expect(zurichDateISO(new Date("2026-08-30T12:00:00Z"))).toBe("2026-08-30");
  });

  it("hat das Format YYYY-MM-DD", () => {
    expect(zurichDateISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
