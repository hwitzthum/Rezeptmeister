import { describe, it, expect } from "vitest";
import { saisonFuer, saisonaleZutaten } from "../ai/saison";

describe("saisonFuer", () => {
  it("liefert fuer jeden Monat gefuellte Listen", () => {
    for (let monat = 0; monat < 12; monat++) {
      // Mittag am 15., damit die Zeitzonenumrechnung nicht in den Nachbarmonat kippt
      const saison = saisonFuer(new Date(Date.UTC(2026, monat, 15, 12)));
      expect(saison.monat).toBeTruthy();
      expect(saison.jahreszeit).toBeTruthy();
      expect(saison.gemuese.length).toBeGreaterThan(3);
      expect(saison.fruechte.length).toBeGreaterThan(0);
      expect(saison.anlass.length).toBeGreaterThan(0);
    }
  });

  it("ordnet Monat und Jahreszeit richtig zu", () => {
    expect(saisonFuer(new Date(Date.UTC(2026, 0, 15, 12)))).toMatchObject({
      monat: "Januar",
      jahreszeit: "Winter",
    });
    expect(saisonFuer(new Date(Date.UTC(2026, 3, 15, 12)))).toMatchObject({
      monat: "April",
      jahreszeit: "Frühling",
    });
    expect(saisonFuer(new Date(Date.UTC(2026, 6, 15, 12)))).toMatchObject({
      monat: "Juli",
      jahreszeit: "Sommer",
    });
    expect(saisonFuer(new Date(Date.UTC(2026, 9, 15, 12)))).toMatchObject({
      monat: "Oktober",
      jahreszeit: "Herbst",
    });
    expect(saisonFuer(new Date(Date.UTC(2026, 11, 15, 12)))).toMatchObject({
      monat: "Dezember",
      jahreszeit: "Winter",
    });
  });

  it("rechnet in Schweizer Zeit, nicht in UTC", () => {
    // 31. Januar 23:30 UTC ist in Zuerich bereits der 1. Februar.
    expect(saisonFuer(new Date("2026-01-31T23:30:00Z")).monat).toBe("Februar");
  });

  it("nennt schweizerische Zutaten, keine Importware", () => {
    const dezember = saisonFuer(new Date(Date.UTC(2026, 11, 15, 12)));
    expect(dezember.gemuese).toContain("Nüsslisalat");
    expect(dezember.gemuese).not.toContain("Tomaten");

    const august = saisonFuer(new Date(Date.UTC(2026, 7, 15, 12)));
    expect(august.gemuese).toContain("Tomaten");
    expect(august.anlass.join(" ")).toContain("1. August");
  });
});

describe("saisonaleZutaten", () => {
  it("fasst Gemuese und Fruechte zu einer Liste zusammen", () => {
    const datum = new Date(Date.UTC(2026, 9, 15, 12));
    const saison = saisonFuer(datum);
    expect(saisonaleZutaten(datum)).toEqual([
      ...saison.gemuese,
      ...saison.fruechte,
    ]);
  });
});
