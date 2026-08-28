import { describe, it, expect } from "vitest";
import {
  ANLEITUNGEN,
  HINWEIS_PAUSE_MS,
  INSTALL_SPEICHERSCHLUESSEL,
  erkennePlattform,
  laeuftInstalliert,
  leseWeggetippt,
  zeigeInstallHinweis,
} from "../install-hint";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_ALS_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

describe("erkennePlattform", () => {
  it("erkennt iPhone und Android", () => {
    expect(erkennePlattform(IPHONE)).toBe("ios");
    expect(erkennePlattform(ANDROID)).toBe("android");
  });

  it("erkennt das iPad, das sich als Mac ausgibt", () => {
    // iPadOS meldet seit Version 13 "Macintosh" — nur die Tastpunkte verraten es.
    expect(erkennePlattform(IPAD_ALS_MAC, 5)).toBe("ios");
    expect(erkennePlattform(MAC, 0)).toBe("desktop");
  });

  it("haelt einen Mac mit angeschlossenem Touchscreen nicht fuer ein iPad", () => {
    // Chrome auf dem Mac meldet nie WebKit-Version-Kennung plus Tastpunkte.
    expect(erkennePlattform(MAC, 0)).toBe("desktop");
  });
});

describe("laeuftInstalliert", () => {
  it("erkennt den Standalone-Modus ueber die Medienabfrage", () => {
    expect(laeuftInstalliert({ displayModeStandalone: true })).toBe(true);
  });

  it("erkennt Safaris eigenes Merkmal auf iOS", () => {
    // iOS setzt display-mode nicht zuverlaessig, dafuer navigator.standalone.
    expect(
      laeuftInstalliert({
        displayModeStandalone: false,
        navigatorStandalone: true,
      }),
    ).toBe(true);
  });

  it("meldet den Browser als nicht installiert", () => {
    expect(
      laeuftInstalliert({
        displayModeStandalone: false,
        navigatorStandalone: false,
      }),
    ).toBe(false);
    expect(laeuftInstalliert({ displayModeStandalone: false })).toBe(false);
  });
});

describe("zeigeInstallHinweis", () => {
  const basis = {
    installiert: false,
    plattform: "ios" as const,
    weggetipptAm: null,
    jetzt: 1_000_000_000_000,
  };

  it("zeigt den Hinweis im Browser auf dem Handy", () => {
    expect(zeigeInstallHinweis(basis)).toBe(true);
    expect(zeigeInstallHinweis({ ...basis, plattform: "android" })).toBe(true);
  });

  it("schweigt in der installierten App", () => {
    expect(zeigeInstallHinweis({ ...basis, installiert: true })).toBe(false);
  });

  it("schweigt auf dem Schreibtisch", () => {
    // Dort ist der Home-Bildschirm kein Thema.
    expect(zeigeInstallHinweis({ ...basis, plattform: "desktop" })).toBe(false);
  });

  it("bleibt nach dem Wegtippen still — aber nicht ewig", () => {
    const gerade = { ...basis, weggetipptAm: basis.jetzt - 1000 };
    expect(zeigeInstallHinweis(gerade)).toBe(false);

    const lange = {
      ...basis,
      weggetipptAm: basis.jetzt - HINWEIS_PAUSE_MS - 1,
    };
    expect(zeigeInstallHinweis(lange)).toBe(true);
  });
});

describe("leseWeggetippt", () => {
  function speicher(wert: string | null) {
    return { getItem: () => wert };
  }

  it("liest einen gespeicherten Zeitpunkt", () => {
    expect(leseWeggetippt(speicher("1712345678901"))).toBe(1712345678901);
  });

  it("wertet Fehlendes und Unsinn als «nie»", () => {
    expect(leseWeggetippt(speicher(null))).toBeNull();
    expect(leseWeggetippt(speicher("morgen"))).toBeNull();
    expect(leseWeggetippt(null)).toBeNull();
  });

  it("uebersteht einen blockierten Speicher", () => {
    // Privater Modus wirft beim Zugriff, statt null zu liefern.
    const blockiert = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(leseWeggetippt(blockiert)).toBeNull();
  });

  it("nutzt einen eindeutigen Schluessel", () => {
    expect(INSTALL_SPEICHERSCHLUESSEL).toContain("rezeptmeister");
  });
});

describe("ANLEITUNGEN", () => {
  it("hat fuer jede Plattform vollstaendige Schritte", () => {
    for (const plattform of ["ios", "android", "desktop"] as const) {
      const a = ANLEITUNGEN[plattform];
      expect(a.titel.length).toBeGreaterThan(0);
      expect(a.schritte.length).toBeGreaterThanOrEqual(3);
      expect(a.schritte.every((s) => s.trim().length > 0)).toBe(true);
    }
  });

  it("nennt auf iOS Safari ausdruecklich und erklaert das Verschwinden", () => {
    const ios = ANLEITUNGEN.ios;
    expect(ios.schritte[0]).toContain("Safari");
    expect(ios.hinweis).toContain("Websitedaten");
    // Die wichtigste Beruhigung: die Daten liegen auf dem Server.
    expect(ios.hinweis).toContain("gehen dabei nicht verloren");
  });
});
