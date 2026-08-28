import { describe, it, expect } from "vitest";
import {
  buildPrefixTsQuery,
  escapeLike,
  normalizeForSearch,
  TITLE_SIMILARITY_THRESHOLD,
  INGREDIENT_SIMILARITY_THRESHOLD,
} from "../recipes/search-query";

describe("buildPrefixTsQuery", () => {
  it("haengt an jedes Token einen Praefix-Stern", () => {
    expect(buildPrefixTsQuery("zop")).toBe("zop:*");
    expect(buildPrefixTsQuery("zop bro")).toBe("zop:* & bro:*");
  });

  it("behandelt Umlaute als Wortbestandteil", () => {
    expect(buildPrefixTsQuery("rösti")).toBe("rösti:*");
    expect(buildPrefixTsQuery("Älplermagronen")).toBe("Älplermagronen:*");
  });

  it("zerlegt an Satzzeichen und Bindestrichen", () => {
    expect(buildPrefixTsQuery("cordon-bleu")).toBe("cordon:* & bleu:*");
    expect(buildPrefixTsQuery("suppe, warm")).toBe("suppe:* & warm:*");
  });

  it("laesst Ziffern stehen", () => {
    expect(buildPrefixTsQuery("3 gaenger")).toBe("3:* & gaenger:*");
  });

  it("gibt null zurueck, wenn kein verwertbares Token bleibt", () => {
    expect(buildPrefixTsQuery("")).toBeNull();
    expect(buildPrefixTsQuery("   ")).toBeNull();
    expect(buildPrefixTsQuery("!!! ??? ...")).toBeNull();
  });

  it("laesst keine tsquery-Operatoren durch", () => {
    // Ohne Zerlegung wuerde "a & b | !c" zu einer eigenen Abfrage werden.
    const result = buildPrefixTsQuery("a & b | !c ( d )");
    expect(result).toBe("a:* & b:* & c:* & d:*");
    expect(result).not.toContain("|");
    expect(result).not.toContain("!");
    expect(result).not.toContain("(");
  });
});

describe("normalizeForSearch", () => {
  it("bildet Umlaute und Eszett auf die Ersatzschreibung ab", () => {
    expect(normalizeForSearch("Rösti")).toBe("roesti");
    expect(normalizeForSearch("Älplermagronen")).toBe("aelplermagronen");
    expect(normalizeForSearch("Müesli")).toBe("mueesli");
    expect(normalizeForSearch("Strasse")).toBe("strasse");
    expect(normalizeForSearch("Straße")).toBe("strasse");
  });

  it("ist idempotent — bereits ersetzte Schreibweisen bleiben gleich", () => {
    expect(normalizeForSearch("roesti")).toBe("roesti");
    expect(normalizeForSearch(normalizeForSearch("Rösti"))).toBe("roesti");
  });

  it("entspricht der SQL-Funktion rm_normalize (kleinschreiben inklusive)", () => {
    expect(normalizeForSearch("ZOPF")).toBe("zopf");
  });
});

describe("escapeLike", () => {
  it("maskiert LIKE-Metazeichen", () => {
    expect(escapeLike("100%")).toBe("100!%");
    expect(escapeLike("a_b")).toBe("a!_b");
  });

  it("maskiert das Fluchtzeichen selbst zuerst", () => {
    // Sonst wuerde aus "!" plus maskiertem "%" ein unbeabsichtigtes Muster.
    expect(escapeLike("!%")).toBe("!!!%");
  });

  it("laesst gewoehnlichen Text unveraendert", () => {
    expect(escapeLike("Rösti")).toBe("Rösti");
  });
});

describe("Schwellenwerte", () => {
  it("liegen zwischen den an echten Daten gemessenen Werten", () => {
    // Tippfehler massen 0.50 bis 0.88, Fehltreffer hoechstens 0.40.
    expect(TITLE_SIMILARITY_THRESHOLD).toBeGreaterThan(0.4);
    expect(TITLE_SIMILARITY_THRESHOLD).toBeLessThan(0.5);
    expect(INGREDIENT_SIMILARITY_THRESHOLD).toBeGreaterThan(
      TITLE_SIMILARITY_THRESHOLD,
    );
  });
});
