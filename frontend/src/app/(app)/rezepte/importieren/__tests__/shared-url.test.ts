import { describe, it, expect } from "vitest";
import { extractSharedUrl } from "../shared-url";

describe("extractSharedUrl", () => {
  it("liest den url-Parameter des Share-Targets", () => {
    expect(
      extractSharedUrl("?url=https%3A%2F%2Fwww.beispiel.ch%2Frezept"),
    ).toBe("https://www.beispiel.ch/rezept");
  });

  it("kommt ohne führendes Fragezeichen aus", () => {
    expect(extractSharedUrl("url=https%3A%2F%2Fbeispiel.ch%2Fa")).toBe(
      "https://beispiel.ch/a",
    );
  });

  it("setzt eine an Parametergrenzen zerfallene Adresse wieder zusammen", () => {
    expect(
      extractSharedUrl(
        "?url=https%3A%2F%2Fbeispiel.ch%2Fr%3Fid%3D7&seite=2&druck=1",
      ),
    ).toBe("https://beispiel.ch/r?id=7&seite=2&druck=1");
  });

  it("hängt keine echten Share-Parameter an die Adresse an", () => {
    expect(
      extractSharedUrl(
        "?url=https%3A%2F%2Fbeispiel.ch%2Fr%3Fid%3D7&title=Znacht",
      ),
    ).toBe("https://beispiel.ch/r?id=7");
  });

  it("hängt nichts an, wenn die Adresse gar keine Abfrage hat", () => {
    expect(extractSharedUrl("?url=https%3A%2F%2Fbeispiel.ch%2Fr&fremd=1")).toBe(
      "https://beispiel.ch/r",
    );
  });

  it("holt die Adresse aus text, wenn url fehlt", () => {
    expect(
      extractSharedUrl(
        "?title=Znacht&text=Rezept%20des%20Tages%20https%3A%2F%2Fbeispiel.ch%2Fr",
      ),
    ).toBe("https://beispiel.ch/r");
  });

  it("holt die Adresse aus text, wenn url leer bleibt", () => {
    expect(extractSharedUrl("?url=&text=https%3A%2F%2Fbeispiel.ch%2Fr")).toBe(
      "https://beispiel.ch/r",
    );
  });

  it("holt die Adresse notfalls aus title", () => {
    expect(extractSharedUrl("?title=https%3A%2F%2Fbeispiel.ch%2Fr")).toBe(
      "https://beispiel.ch/r",
    );
  });

  it("entfernt Satzzeichen am Ende einer Adresse im Freitext", () => {
    expect(
      extractSharedUrl("?text=Schau%20mal%20https%3A%2F%2Fbeispiel.ch%2Fr."),
    ).toBe("https://beispiel.ch/r");
  });

  it("weist andere Protokolle ab", () => {
    expect(extractSharedUrl("?url=javascript%3Aalert(1)")).toBeNull();
    expect(extractSharedUrl("?url=file%3A%2F%2F%2Fetc%2Fpasswd")).toBeNull();
  });

  it("weist unvollständige Adressen ab", () => {
    expect(extractSharedUrl("?url=beispiel.ch%2Frezept")).toBeNull();
  });

  it("weist überlange Adressen ab", () => {
    const lang = `https://beispiel.ch/${"a".repeat(2100)}`;
    expect(extractSharedUrl(`?url=${encodeURIComponent(lang)}`)).toBeNull();
  });

  it("gibt bei leerer Query null zurück", () => {
    expect(extractSharedUrl("")).toBeNull();
    expect(extractSharedUrl("?")).toBeNull();
  });

  it("übersteht kaputte Prozent-Kodierung", () => {
    expect(extractSharedUrl("?url=%E0%A4%A")).toBeNull();
  });
});
