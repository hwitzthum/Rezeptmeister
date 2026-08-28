import { describe, it, expect } from "vitest";
import {
  computeTargetSize,
  DEFAULT_MAX_EDGE,
  DEFAULT_QUALITY,
} from "../downscale";

describe("computeTargetSize", () => {
  it("lässt Bilder unterhalb der Maximalkante unverändert", () => {
    expect(computeTargetSize(1200, 800, 2000)).toEqual({
      width: 1200,
      height: 800,
      resized: false,
    });
  });

  it("skaliert nicht hoch", () => {
    const result = computeTargetSize(300, 200, 2000);
    expect(result.resized).toBe(false);
    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
  });

  it("behandelt exakte Maximalkante als unverändert", () => {
    expect(computeTargetSize(2000, 1500, 2000).resized).toBe(false);
  });

  it("verkleinert Querformat auf die längere Kante", () => {
    expect(computeTargetSize(4032, 3024, 2000)).toEqual({
      width: 2000,
      height: 1500,
      resized: true,
    });
  });

  it("verkleinert Hochformat auf die längere Kante", () => {
    // Typisches iPhone-Foto einer Kochbuchseite, hochkant
    expect(computeTargetSize(3024, 4032, 2000)).toEqual({
      width: 1500,
      height: 2000,
      resized: true,
    });
  });

  it("behält das Seitenverhältnis innerhalb eines Pixels", () => {
    const original = 4032 / 3024;
    const { width, height } = computeTargetSize(4032, 3024, 2000);
    expect(Math.abs(width / height - original)).toBeLessThan(0.01);
  });

  it("erzeugt bei extremen Seitenverhältnissen keine 0-px-Kante", () => {
    const result = computeTargetSize(10000, 3, 2000);
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1);
    expect(result.resized).toBe(true);
  });

  it("respektiert eine abweichende Maximalkante", () => {
    expect(computeTargetSize(4000, 2000, 1000)).toEqual({
      width: 1000,
      height: 500,
      resized: true,
    });
  });

  it("nutzt 2000 px als Vorgabe", () => {
    expect(computeTargetSize(6000, 3000)).toEqual({
      width: 2000,
      height: 1000,
      resized: true,
    });
  });

  it("gibt unbrauchbare Masse unverändert zurück", () => {
    expect(computeTargetSize(0, 0, 2000)).toEqual({
      width: 0,
      height: 0,
      resized: false,
    });
    expect(computeTargetSize(Number.NaN, 100, 2000).resized).toBe(false);
    expect(computeTargetSize(100, -5, 2000).resized).toBe(false);
    expect(computeTargetSize(4000, 3000, 0).resized).toBe(false);
  });
});

describe("Vorgabewerte", () => {
  it("entsprechen dem Vertrag aus SPEC_1 (2000 px, JPEG q0.85)", () => {
    expect(DEFAULT_MAX_EDGE).toBe(2000);
    expect(DEFAULT_QUALITY).toBe(0.85);
  });
});
