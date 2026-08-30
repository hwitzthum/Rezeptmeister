import { describe, it, expect } from "vitest";
import { buildStepSegments } from "../step-segments";
import { parseTimers } from "../parse-timers";
import { linkIngredients } from "../link-ingredients";

describe("buildStepSegments", () => {
  it("verschraenkt Timer und Zutaten in Textreihenfolge", () => {
    const text = "Wasser 10 Minuten kochen, dann Nudeln zugeben.";
    const timers = parseTimers(text);
    const { steps } = linkIngredients(
      [text],
      [
        { id: "w", name: "Wasser" },
        { id: "n", name: "Nudeln" },
      ],
    );
    const segments = buildStepSegments(text, timers, steps[0].spans);
    expect(segments.map((s) => s.kind)).toEqual([
      "ingredient",
      "text",
      "timer",
      "text",
      "ingredient",
      "text",
    ]);
    expect(segments.map((s) => s.text).join("")).toBe(text);
    const timer = segments.find((s) => s.kind === "timer");
    expect(timer && timer.kind === "timer" ? timer.timerIndex : null).toBe(0);
  });

  it("laesst Timer gewinnen, wenn ein Zutaten-Span ueberlappt", () => {
    const text = "5 Minuten ruhen lassen";
    const timers = parseTimers(text);
    const segments = buildStepSegments(text, timers, [
      { ingredientId: "x", startIndex: 2, endIndex: 9, matchedText: "Minuten" },
    ]);
    expect(segments.filter((s) => s.kind === "ingredient")).toHaveLength(0);
    expect(segments.filter((s) => s.kind === "timer")).toHaveLength(1);
  });

  it("gibt bei nichts zu markieren ein einzelnes Textsegment zurueck", () => {
    expect(buildStepSegments("Servieren.", [], [])).toEqual([
      { kind: "text", text: "Servieren." },
    ]);
  });

  it("behaelt die Timer-Indizes trotz Zutaten dazwischen", () => {
    const text = "Zwiebeln 5 Minuten dünsten, Sauce 20 Minuten köcheln.";
    const timers = parseTimers(text);
    const { steps } = linkIngredients(
      [text],
      [
        { id: "z", name: "Zwiebel" },
        { id: "s", name: "Sauce" },
      ],
    );
    const indices = buildStepSegments(text, timers, steps[0].spans)
      .filter((s) => s.kind === "timer")
      .map((s) => (s.kind === "timer" ? s.timerIndex : -1));
    expect(indices).toEqual([0, 1]);
  });
});
