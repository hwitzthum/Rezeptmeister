import { describe, it, expect } from "vitest";
import {
  linkIngredients,
  ingredientPatterns,
  stemWord,
  normalizeText,
  type LinkableIngredient,
} from "../link-ingredients";

function ing(id: string, name: string, isOptional = false): LinkableIngredient {
  return { id, name, isOptional };
}

function link(step: string, ...ingredients: LinkableIngredient[]) {
  return linkIngredients([step], ingredients).steps[0];
}

describe("normalizeText", () => {
  it("bleibt gleich lang und faltet Umlaute/Akzente", () => {
    const input = "Crème fraîche mit Äpfeln, ÖL und Weißkohl";
    const out = normalizeText(input);
    expect(out).toHaveLength(input.length);
    expect(out).toBe("creme fraiche mit apfeln, ol und weiskohl");
  });
});

describe("stemWord", () => {
  it("fuehrt Singular und Plural auf denselben Stamm", () => {
    expect(stemWord("Zwiebeln")).toBe(stemWord("Zwiebel"));
    expect(stemWord("Tomaten")).toBe(stemWord("Tomate"));
    expect(stemWord("Karotten")).toBe(stemWord("Karotte"));
    expect(stemWord("Äpfel")).toBe(stemWord("Apfel"));
    expect(stemWord("Eier")).toBe(stemWord("Ei"));
    expect(stemWord("Nüsse")).toBe(stemWord("Nuss"));
    expect(stemWord("Kartoffeln")).toBe(stemWord("Kartoffel"));
  });
});

describe("ingredientPatterns", () => {
  it("entfernt Qualifier nach Komma und in Klammern", () => {
    expect(ingredientPatterns("Butter, weich")).toEqual([["butter"]]);
    expect(ingredientPatterns("Zwiebel (gross)")).toEqual([["zwiebel"]]);
  });

  it("splittet an «und» und liefert Phrase plus Kopfnomen, laengste zuerst", () => {
    expect(ingredientPatterns("Salz und Pfeffer")).toEqual([
      ["pfeffer"],
      ["salz"],
    ]);
    expect(ingredientPatterns("rote Zwiebel")).toEqual([
      ["rot", "zwiebel"],
      ["zwiebel"],
    ]);
  });

  it("ignoriert Einheiten und Mengenwoerter im Namen", () => {
    expect(ingredientPatterns("1 Stück Ingwer")).toEqual([[stemWord("Ingwer")]]);
    expect(ingredientPatterns("etwas")).toEqual([]);
  });
});

describe("linkIngredients", () => {
  it("findet den Singular im Text", () => {
    const r = link("Die Zwiebel hacken.", ing("z", "Zwiebel"));
    expect(r.ingredientIds).toEqual(["z"]);
    expect(r.spans[0].matchedText).toBe("Zwiebel");
  });

  it("findet Plural im Text bei Singular in der Zutat — und umgekehrt", () => {
    expect(
      link("Zwiebeln andünsten", ing("z", "Zwiebel")).spans[0].matchedText,
    ).toBe("Zwiebeln");
    expect(
      link("die Zwiebel hacken", ing("z", "Zwiebeln")).ingredientIds,
    ).toEqual(["z"]);
    expect(link("Tomaten würfeln", ing("t", "Tomate")).ingredientIds).toEqual([
      "t",
    ]);
    expect(
      link("die Tomate würfeln", ing("t", "Tomaten")).ingredientIds,
    ).toEqual(["t"]);
  });

  it("kennt unregelmaessige Plurale", () => {
    expect(link("Ei verquirlen", ing("e", "Eier")).ingredientIds).toEqual([
      "e",
    ]);
    expect(link("die Eier verquirlen", ing("e", "Ei")).ingredientIds).toEqual([
      "e",
    ]);
    expect(link("Eierlikör dazugeben", ing("e", "Ei")).ingredientIds).toEqual(
      [],
    );
  });

  it("faltet Umlaut-Plurale", () => {
    expect(link("Äpfel schälen", ing("a", "Apfel")).spans[0].matchedText).toBe(
      "Äpfel",
    );
  });

  it("trifft Komposita am Wortende und -anfang", () => {
    expect(
      link("Vollkornmehl einrühren", ing("m", "Mehl")).spans[0].matchedText,
    ).toBe("Vollkornmehl");
    expect(
      link("Knoblauchzehen pressen", ing("k", "Knoblauch")).spans[0]
        .matchedText,
    ).toBe("Knoblauchzehen");
  });

  it("nutzt nur den Kern des Zutatennamens", () => {
    expect(
      link("Butter schmelzen", ing("b", "Butter, weich")).ingredientIds,
    ).toEqual(["b"]);
    expect(
      link("Zwiebeln hacken", ing("z", "Zwiebel (gross)")).ingredientIds,
    ).toEqual(["z"]);
  });

  it("liefert bei «Salz und Pfeffer» zwei Spans, aber eine Zutat", () => {
    const r = link(
      "mit Salz und Pfeffer würzen",
      ing("sp", "Salz und Pfeffer"),
    );
    expect(r.spans.map((s) => s.matchedText)).toEqual(["Salz", "Pfeffer"]);
    expect(r.ingredientIds).toEqual(["sp"]);
  });

  it("laesst den laengeren Treffer gewinnen", () => {
    const oel = ing("oel", "Öl");
    const olivenoel = ing("oliv", "Olivenöl");
    expect(link("Olivenöl erhitzen", oel, olivenoel).ingredientIds).toEqual([
      "oliv",
    ]);
    expect(link("etwas Öl erhitzen", oel, olivenoel).ingredientIds).toEqual([
      "oel",
    ]);
  });

  it("bevorzugt die Mehrwort-Phrase vor dem Kopfnomen", () => {
    const r = link(
      "rote Zwiebeln schneiden",
      ing("z", "Zwiebel"),
      ing("rz", "rote Zwiebel"),
    );
    expect(r.ingredientIds).toEqual(["rz"]);
    expect(r.spans[0].matchedText).toBe("rote Zwiebeln");
  });

  it("vergibt kein Wort doppelt: exakt schlaegt Kompositum", () => {
    const r = link(
      "Tomatenmark einrühren",
      ing("t", "Tomate"),
      ing("tm", "Tomatenmark"),
    );
    expect(r.ingredientIds).toEqual(["tm"]);
  });

  it("respektiert Wortgrenzen", () => {
    expect(
      link("Eingemachtes servieren", ing("e", "Ei")).ingredientIds,
    ).toEqual([]);
    expect(link("Reis kochen", ing("e", "Ei")).ingredientIds).toEqual([]);
  });

  it("ist unabhaengig von Gross-/Kleinschreibung und Akzenten", () => {
    expect(
      link("CREME FRAICHE unterziehen", ing("c", "Crème fraîche")).spans[0]
        .matchedText,
    ).toBe("CREME FRAICHE");
  });

  it("liefert Span-Indizes, die auf den Originaltext passen", () => {
    const text = "Zuerst die Zwiebeln, dann Knoblauch und zuletzt die Tomaten.";
    const r = link(
      text,
      ing("z", "Zwiebel"),
      ing("k", "Knoblauch"),
      ing("t", "Tomate"),
    );
    expect(r.spans).toHaveLength(3);
    for (const s of r.spans) {
      expect(text.slice(s.startIndex, s.endIndex)).toBe(s.matchedText);
    }
    expect(r.spans.map((s) => s.matchedText)).toEqual([
      "Zwiebeln",
      "Knoblauch",
      "Tomaten",
    ]);
  });

  it("meldet nicht erwaehnte Zutaten als unmatched", () => {
    const r = linkIngredients(
      ["Zwiebeln hacken."],
      [ing("z", "Zwiebel"), ing("p", "Petersilie")],
    );
    expect(r.unmatchedIngredientIds).toEqual(["p"]);
    expect(r.steps[0].ingredientIds).toEqual(["z"]);
  });

  it("kommt mit leeren Eingaben zurecht", () => {
    expect(linkIngredients([], [ing("z", "Zwiebel")])).toEqual({
      steps: [],
      unmatchedIngredientIds: ["z"],
    });
    expect(linkIngredients(["Kochen."], []).steps[0]).toEqual({
      ingredientIds: [],
      spans: [],
    });
  });

  it("matcht Namen ohne brauchbares Wort nie", () => {
    const r = linkIngredients(["etwas Salz"], [ing("x", "etwas")]);
    expect(r.unmatchedIngredientIds).toEqual(["x"]);
  });

  it("verknuepft ueber mehrere Schritte und haelt die Reihenfolge des ersten Vorkommens", () => {
    const r = linkIngredients(
      [
        "Butter schmelzen, Mehl einrühren.",
        "Milch zugiessen, mit Salz abschmecken.",
      ],
      [
        ing("s", "Salz"),
        ing("m", "Mehl"),
        ing("b", "Butter"),
        ing("mi", "Milch"),
      ],
    );
    expect(r.steps[0].ingredientIds).toEqual(["b", "m"]);
    expect(r.steps[1].ingredientIds).toEqual(["mi", "s"]);
    expect(r.unmatchedIngredientIds).toEqual([]);
  });
});
