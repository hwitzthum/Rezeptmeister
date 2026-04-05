import { describe, it, expect } from "vitest";
import { parseTimers } from "../parse-timers";

describe("parseTimers", () => {
  it("erkennt einfache Minutenangabe", () => {
    const result = parseTimers("Köcheln lassen für 30 Minuten.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(30);
    expect(result[0].label).toBe("30 Minuten");
  });

  it("erkennt abgekürzte Minutenangabe", () => {
    const result = parseTimers("5 Min. braten.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(5);
  });

  it("erkennt Stundenangabe", () => {
    const result = parseTimers("2 Stunden im Ofen backen.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(120);
  });

  it("erkennt abgekürzte Stundenangabe", () => {
    const result = parseTimers("1 Std. ruhen lassen.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(60);
  });

  it("erkennt zusammengesetzte Angabe (Stunde + Minuten)", () => {
    const result = parseTimers("1 Stunde 30 Minuten backen.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(90);
  });

  it("erkennt Bereiche (10-12 Minuten)", () => {
    const result = parseTimers("10-12 Minuten köcheln.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(11); // Mittelwert aufgerundet
  });

  it("erkennt Bereiche mit Gedankenstrich", () => {
    const result = parseTimers("35–40 Minuten backen.");
    expect(result).toHaveLength(1);
    expect(result[0].minutes).toBe(38); // ceil((35+40)/2)
  });

  it("erkennt mehrere Timer in einem Schritt", () => {
    const result = parseTimers(
      "5 Minuten anbraten, dann 20 Minuten köcheln lassen.",
    );
    expect(result).toHaveLength(2);
    expect(result[0].minutes).toBe(5);
    expect(result[1].minutes).toBe(20);
  });

  it("gibt leeres Array wenn keine Zeitangabe", () => {
    expect(parseTimers("Zwiebeln fein hacken.")).toEqual([]);
    expect(parseTimers("")).toEqual([]);
  });

  it("gibt korrekte Positionen zurück", () => {
    const text = "Dann 15 Minuten warten.";
    const result = parseTimers(text);
    expect(result).toHaveLength(1);
    expect(text.slice(result[0].startIndex, result[0].endIndex)).toBe(
      "15 Minuten",
    );
  });

  it("erkennt Singular (1 Minute, 1 Stunde)", () => {
    const result = parseTimers("1 Minute warten, dann 1 Stunde ruhen.");
    expect(result).toHaveLength(2);
    expect(result[0].minutes).toBe(1);
    expect(result[1].minutes).toBe(60);
  });
});
