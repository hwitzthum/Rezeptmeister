import { describe, expect, it } from "vitest";
import { matchesPath, resolveActiveHref } from "@/components/layout/Sidebar";
import { bottomNavItems } from "@/components/layout/nav-items";

describe("matchesPath", () => {
  it("trifft das Dashboard nur exakt", () => {
    expect(matchesPath("/", "/")).toBe(true);
    expect(matchesPath("/rezepte", "/")).toBe(false);
  });

  it("trifft Seite und Unterseiten", () => {
    expect(matchesPath("/rezepte", "/rezepte")).toBe(true);
    expect(matchesPath("/rezepte/abc", "/rezepte")).toBe(true);
  });

  it("trifft keine Geschwister mit gleichem Präfix", () => {
    expect(matchesPath("/rezepten", "/rezepte")).toBe(false);
  });
});

describe("resolveActiveHref", () => {
  it("hebt den Bereich der aktuellen Seite hervor", () => {
    expect(resolveActiveHref("/rezepte", bottomNavItems)).toBe("/rezepte");
    expect(resolveActiveHref("/einkaufsliste", bottomNavItems)).toBe(
      "/einkaufsliste",
    );
    expect(resolveActiveHref("/mehr", bottomNavItems)).toBe("/mehr");
  });

  it("hebt auf einer Detailseite den Elternbereich hervor", () => {
    expect(resolveActiveHref("/rezepte/abc", bottomNavItems)).toBe("/rezepte");
  });

  it("lässt den CTA aussen vor — /rezepte/neu bleibt bei Rezepte", () => {
    expect(resolveActiveHref("/rezepte/neu", bottomNavItems)).toBe("/rezepte");
  });

  it("hebt nichts hervor, wenn die Seite in keiner Rubrik liegt", () => {
    expect(resolveActiveHref("/wochenplan", bottomNavItems)).toBeNull();
  });

  it("liefert nie mehr als einen aktiven Eintrag", () => {
    for (const pathname of [
      "/",
      "/rezepte",
      "/rezepte/neu",
      "/rezepte/scannen",
      "/suche",
      "/einkaufsliste",
      "/mehr",
      "/wochenplan",
    ]) {
      const active = resolveActiveHref(pathname, bottomNavItems);
      const hits = bottomNavItems.filter((item) => item.href === active);
      expect(hits.length).toBeLessThanOrEqual(1);
    }
  });
});
