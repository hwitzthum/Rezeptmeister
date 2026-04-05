import { describe, it, expect } from "vitest";
import { parseSteps } from "../parse-steps";

describe("parseSteps", () => {
  it("parst nummerierte Schritte mit Punkt", () => {
    const input = `1. Zwiebeln schneiden.
2. Öl in der Pfanne erhitzen.
3. Zwiebeln anbraten.`;
    const steps = parseSteps(input);
    expect(steps).toEqual([
      "Zwiebeln schneiden.",
      "Öl in der Pfanne erhitzen.",
      "Zwiebeln anbraten.",
    ]);
  });

  it("parst nummerierte Schritte mit Klammer", () => {
    const input = `1) Teig vorbereiten
2) 30 Minuten ruhen lassen
3) Ausrollen`;
    expect(parseSteps(input)).toHaveLength(3);
    expect(parseSteps(input)[0]).toBe("Teig vorbereiten");
  });

  it("parst nummerierte Schritte mit Doppelpunkt", () => {
    const input = `1: Wasser kochen
2: Nudeln hinzufügen`;
    expect(parseSteps(input)).toHaveLength(2);
    expect(parseSteps(input)[0]).toBe("Wasser kochen");
  });

  it("fällt auf Absätze zurück wenn keine Nummern", () => {
    const input = `Zwiebeln fein hacken und in Olivenöl anbraten.

Tomaten hinzufügen und 20 Minuten köcheln lassen.

Mit Salz und Pfeffer abschmecken.`;
    const steps = parseSteps(input);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain("Zwiebeln");
    expect(steps[2]).toContain("Salz");
  });

  it("fällt auf Zeilenumbrüche zurück bei einzelnen Zeilen", () => {
    const input = `Zwiebeln schneiden
Öl erhitzen
Alles zusammen anbraten`;
    const steps = parseSteps(input);
    expect(steps).toHaveLength(3);
  });

  it("gibt leeres Array für leeren Input", () => {
    expect(parseSteps("")).toEqual([]);
    expect(parseSteps("   ")).toEqual([]);
  });

  it("gibt einzelnen Schritt für einzeiligen Text", () => {
    const input = "Alles gut vermischen.";
    const steps = parseSteps(input);
    expect(steps).toEqual(["Alles gut vermischen."]);
  });

  it("entfernt Nummernpräfixe sauber", () => {
    const input = `1. Ersten Schritt machen
2. Zweiten Schritt machen`;
    const steps = parseSteps(input);
    expect(steps[0]).not.toMatch(/^\d/);
    expect(steps[1]).not.toMatch(/^\d/);
  });

  it("behandelt mehrzeilige nummerierte Schritte", () => {
    const input = `1. Zwiebeln schneiden und
   in die Pfanne geben.
2. Alles gut anbraten.`;
    const steps = parseSteps(input);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain("in die Pfanne geben");
  });
});
