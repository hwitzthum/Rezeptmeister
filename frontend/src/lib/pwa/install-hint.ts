/**
 * Erkennung, ob die App installiert laeuft — und wenn nicht, wie sie
 * installiert wird.
 *
 * Ein Symbol auf dem Home-Bildschirm kann verschwinden, ohne dass die App
 * etwas dafuer kann: iOS entfernt die Web-App zum Beispiel, wenn unter
 * Einstellungen > Safari "Verlauf und Websitedaten loeschen" gewaehlt wird,
 * und der Home-Bildschirm gleicht sich ueber iCloud zwischen Geraeten ab.
 * Passiert das, steht man vor einer Adresse im Browser und findet keinen Weg
 * zurueck — es sei denn, die App erklaert ihn.
 */

export type Plattform = "ios" | "android" | "desktop";

/** Wie lange ein weggetippter Hinweis wegbleibt. */
export const HINWEIS_PAUSE_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

export const INSTALL_SPEICHERSCHLUESSEL = "rezeptmeister-install-hinweis";

/**
 * iPadOS meldet sich seit Version 13 als "Macintosh". Das Tastverhalten
 * unterscheidet die beiden zuverlaessiger als die Kennung.
 */
export function erkennePlattform(
  userAgent: string,
  maxTouchPoints = 0,
): Plattform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/macintosh/.test(ua) && maxTouchPoints > 1) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

export interface StandaloneQuellen {
  /** `window.matchMedia("(display-mode: standalone)").matches` */
  displayModeStandalone: boolean;
  /** `navigator.standalone` — nur Safari auf iOS setzt das. */
  navigatorStandalone?: boolean;
}

/** Laeuft die Seite als installierte App und nicht im Browser? */
export function laeuftInstalliert({
  displayModeStandalone,
  navigatorStandalone,
}: StandaloneQuellen): boolean {
  return Boolean(displayModeStandalone || navigatorStandalone);
}

export interface HinweisEntscheidung {
  installiert: boolean;
  plattform: Plattform;
  /** Zeitpunkt des letzten Wegtippens, aus dem Speicher gelesen. */
  weggetipptAm: number | null;
  jetzt: number;
}

/**
 * Der Hinweis erscheint nur, wenn er etwas nuetzt: nicht in der installierten
 * App, nicht auf dem Schreibtisch — dort ist der Home-Bildschirm kein Thema —
 * und nicht, solange er weggetippt ist.
 */
export function zeigeInstallHinweis({
  installiert,
  plattform,
  weggetipptAm,
  jetzt,
}: HinweisEntscheidung): boolean {
  if (installiert) return false;
  if (plattform === "desktop") return false;
  if (weggetipptAm !== null && jetzt - weggetipptAm < HINWEIS_PAUSE_MS) {
    return false;
  }
  return true;
}

/** Liest den Zeitpunkt des Wegtippens; ein defekter Wert gilt als "nie". */
export function leseWeggetippt(
  speicher: Pick<Storage, "getItem"> | null,
): number | null {
  try {
    const roh = speicher?.getItem(INSTALL_SPEICHERSCHLUESSEL);
    if (!roh) return null;
    const wert = Number(roh);
    return Number.isFinite(wert) ? wert : null;
  } catch {
    // Privater Modus oder blockierter Speicher — dann eben kein Gedaechtnis.
    return null;
  }
}

export interface InstallAnleitung {
  titel: string;
  schritte: string[];
  hinweis?: string;
}

export const ANLEITUNGEN: Record<Plattform, InstallAnleitung> = {
  ios: {
    titel: "Auf dem Home-Bildschirm ablegen (iPhone, iPad)",
    schritte: [
      "Diese Seite in **Safari** öffnen — Chrome und Firefox können auf iOS keine Web-Apps ablegen.",
      "Unten in der Mitte auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).",
      "In der Liste nach unten scrollen und «Zum Home-Bildschirm» wählen.",
      "Oben rechts auf «Hinzufügen» tippen. Rezeptmeister erscheint als eigenes Symbol.",
    ],
    hinweis:
      "Das Symbol kann verschwinden, wenn unter Einstellungen › Safari «Verlauf und Websitedaten löschen» gewählt wird — iOS entfernt dabei auch abgelegte Web-Apps. Über diese Anleitung ist es in einer halben Minute wieder da; Rezepte und Einkaufsliste liegen auf dem Server und gehen dabei nicht verloren.",
  },
  android: {
    titel: "Auf dem Startbildschirm ablegen (Android)",
    schritte: [
      "Diese Seite in Chrome öffnen.",
      "Oben rechts auf das Menü mit den drei Punkten tippen.",
      "«App installieren» oder «Zum Startbildschirm hinzufügen» wählen.",
      "Mit «Installieren» bestätigen.",
    ],
  },
  desktop: {
    titel: "Als App installieren (Desktop)",
    schritte: [
      "Chrome oder Edge öffnen.",
      "In der Adressleiste rechts auf das Installieren-Symbol klicken.",
      "Mit «Installieren» bestätigen.",
    ],
  },
};
