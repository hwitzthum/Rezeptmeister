import { describe, it, expect } from "vitest";
import { buildEmbeddingText } from "../embedding-text";

describe("buildEmbeddingText", () => {
  it("nimmt Titel, Beschreibung, Anleitung, Küche, Kategorie und Tags auf", () => {
    expect(
      buildEmbeddingText({
        title: "Gemüsepfanne",
        description: "Schnell gemacht.",
        instructions: "Alles braten.",
        cuisine: "Asiatisch",
        category: "Hauptgericht",
        tags: ["Asiatisch", "Geflügel"],
      }),
    ).toBe(
      [
        "Gemüsepfanne",
        "Schnell gemacht.",
        "Alles braten.",
        "Kueche: Asiatisch",
        "Kategorie: Hauptgericht",
        "Tags: Asiatisch, Geflügel",
      ].join("\n"),
    );
  });

  it("lässt leere Felder und leere Tag-Listen weg", () => {
    expect(
      buildEmbeddingText({
        title: "Rösti",
        description: null,
        instructions: "Braten.",
        cuisine: "",
        category: undefined,
        tags: [],
      }),
    ).toBe("Rösti\nBraten.");
  });
});
