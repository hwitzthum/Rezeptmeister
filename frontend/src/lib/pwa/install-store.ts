"use client";

import {
  INSTALL_SPEICHERSCHLUESSEL,
  erkennePlattform,
  laeuftInstalliert,
  leseWeggetippt,
  zeigeInstallHinweis,
  type Plattform,
} from "@/lib/pwa/install-hint";

/**
 * Externer Zustand fuer den Installationshinweis.
 *
 * Ob die App installiert laeuft, steht erst im Browser fest — auf dem Server
 * ist die Frage unbeantwortbar. `useSyncExternalStore` ist dafuer der richtige
 * Griff: es trennt Server- und Client-Aufnahme sauber, statt nach dem Einhaengen
 * einen Zustand nachzuschieben. Dieselbe Bauart nutzt bereits
 * `lib/offline/shopping-sync`.
 *
 * Die Anzeigeart kann sich waehrend der Sitzung aendern — wer die App
 * installiert, waehrend sie offen ist, wechselt in den Standalone-Modus.
 * Deshalb haengt der Store an der Medienabfrage.
 */

export interface InstallZustand {
  installiert: boolean;
  plattform: Plattform;
  hinweisZeigen: boolean;
}

const SERVER_ZUSTAND: InstallZustand = {
  installiert: false,
  plattform: "desktop",
  hinweisZeigen: false,
};

let zwischenspeicher: InstallZustand | null = null;
const horcher = new Set<() => void>();

function medienabfrage(): MediaQueryList | null {
  return typeof window === "undefined" || !window.matchMedia
    ? null
    : window.matchMedia("(display-mode: standalone)");
}

function ermitteln(): InstallZustand {
  const installiert = laeuftInstalliert({
    displayModeStandalone: medienabfrage()?.matches ?? false,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean })
      .standalone,
  });
  const plattform = erkennePlattform(
    navigator.userAgent,
    navigator.maxTouchPoints,
  );
  return {
    installiert,
    plattform,
    hinweisZeigen: zeigeInstallHinweis({
      installiert,
      plattform,
      weggetipptAm: leseWeggetippt(
        typeof localStorage === "undefined" ? null : localStorage,
      ),
      jetzt: Date.now(),
    }),
  };
}

/**
 * `useSyncExternalStore` vergleicht die Aufnahme mit `Object.is` — ein bei
 * jedem Aufruf frisch gebautes Objekt loeste eine Endlosschleife aus. Deshalb
 * bleibt dieselbe Referenz bestehen, solange sich nichts geaendert hat.
 */
export function getInstallSnapshot(): InstallZustand {
  const frisch = ermitteln();
  if (
    !zwischenspeicher ||
    zwischenspeicher.installiert !== frisch.installiert ||
    zwischenspeicher.plattform !== frisch.plattform ||
    zwischenspeicher.hinweisZeigen !== frisch.hinweisZeigen
  ) {
    zwischenspeicher = frisch;
  }
  return zwischenspeicher;
}

export function getInstallServerSnapshot(): InstallZustand {
  return SERVER_ZUSTAND;
}

export function subscribeInstall(rueckruf: () => void): () => void {
  horcher.add(rueckruf);
  const mq = medienabfrage();
  mq?.addEventListener("change", rueckruf);
  return () => {
    horcher.delete(rueckruf);
    mq?.removeEventListener("change", rueckruf);
  };
}

/** Hinweis fuer die Pausendauer stummschalten. */
export function hinweisWegtippen(): void {
  try {
    localStorage.setItem(INSTALL_SPEICHERSCHLUESSEL, String(Date.now()));
  } catch {
    // Privater Modus: dann kommt der Hinweis beim naechsten Besuch wieder —
    // die harmlosere Richtung.
  }
  zwischenspeicher = null;
  for (const r of horcher) r();
}
