/**
 * Erkennung neuer App-Versionen.
 *
 * Der Service Worker holt sich eine neue Fassung im Hintergrund, aber die
 * laufende Seite merkt davon nichts: sie zeigt weiter den Stand, mit dem sie
 * geladen wurde. Auf einer vom Home-Bildschirm gestarteten App faellt das
 * besonders auf, weil iOS sie schlafen legt statt sie zu beenden — sie kann
 * tagelang auf demselben Stand stehen bleiben.
 *
 * Dieses Modul beobachtet die Registrierung, meldet eine bereitstehende
 * Fassung und uebernimmt sie erst auf ausdruecklichen Wunsch. Die
 * Browser-Schnittstelle wird hereingereicht, damit der Ablauf ohne Browser
 * pruefbar bleibt.
 */

/** Der Teil von `navigator.serviceWorker`, den dieses Modul braucht. */
export interface SwContainer {
  controller: unknown | null;
  register(url: string): Promise<SwRegistration>;
  addEventListener(type: "controllerchange", listener: () => void): void;
  removeEventListener(type: "controllerchange", listener: () => void): void;
}

export interface SwWorker {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
  removeEventListener(type: "statechange", listener: () => void): void;
}

export interface SwRegistration {
  waiting: SwWorker | null;
  installing: SwWorker | null;
  update(): Promise<unknown>;
  addEventListener(type: "updatefound", listener: () => void): void;
  removeEventListener(type: "updatefound", listener: () => void): void;
}

export interface WatchOptions {
  container: SwContainer;
  /** Eine neue Fassung wartet auf Uebernahme. */
  onUpdateReady: () => void;
  /** Die neue Fassung hat uebernommen — jetzt darf neu geladen werden. */
  onActivated: () => void;
  /** Fehler bei der Registrierung (z. B. kein HTTPS). */
  onError?: (error: unknown) => void;
  /** Kuerzester Abstand zwischen zwei Suchlaeufen. */
  throttleMs?: number;
  now?: () => number;
}

export interface UpdateWatcher {
  /** Nach einer neuen Fassung suchen — beim Start und bei jeder Rueckkehr. */
  checkForUpdate(): void;
  /** Die wartende Fassung uebernehmen lassen. */
  applyUpdate(): void;
  /** Beobachtung beenden. */
  stop(): void;
}

/**
 * Zwei Suchlaeufe direkt hintereinander bringen nichts und kosten eine
 * Netzanfrage — iOS feuert beim Zurueckholen der App gern mehrere Ereignisse
 * gleichzeitig.
 */
const DEFAULT_THROTTLE_MS = 60_000;

export function watchForUpdates({
  container,
  onUpdateReady,
  onActivated,
  onError,
  throttleMs = DEFAULT_THROTTLE_MS,
  now = () => Date.now(),
}: WatchOptions): UpdateWatcher {
  let registration: SwRegistration | null = null;
  let waitingWorker: SwWorker | null = null;
  // -Infinity, damit die erste Suche nie an der Drosselung haengen bleibt.
  let lastCheck = Number.NEGATIVE_INFINITY;
  let stopped = false;
  let updateRequested = false;
  const cleanups: (() => void)[] = [];

  /**
   * Beim allerersten Besuch gibt es noch keinen Controller: der Service Worker
   * uebernimmt sofort und es gibt nichts zu melden. Erst wenn schon einer
   * laeuft, ist eine wartende Fassung wirklich eine *neue* Version.
   */
  function considerWaiting(worker: SwWorker | null) {
    if (!worker || stopped || !container.controller) return;
    waitingWorker = worker;
    onUpdateReady();
  }

  function trackInstalling(worker: SwWorker | null) {
    if (!worker) return;
    const onStateChange = () => {
      if (worker.state === "installed") considerWaiting(worker);
    };
    worker.addEventListener("statechange", onStateChange);
    cleanups.push(() =>
      worker.removeEventListener("statechange", onStateChange),
    );
    // Der Zustand kann schon erreicht sein, bevor wir zuhoeren konnten.
    onStateChange();
  }

  const onControllerChange = () => {
    // Nur nach ausdruecklicher Uebernahme neu laden. Beim ersten Besuch
    // wechselt der Controller ebenfalls — ein Neuladen waere dort sinnlos.
    if (updateRequested && !stopped) onActivated();
  };
  container.addEventListener("controllerchange", onControllerChange);
  cleanups.push(() =>
    container.removeEventListener("controllerchange", onControllerChange),
  );

  container
    .register("/sw.js")
    .then((reg) => {
      if (stopped) return;
      // `register()` erfuellt sich nicht in jeder Umgebung mit einer
      // Registrierung: unterdrueckt der Browser Service Worker (Playwright
      // `serviceWorkers: "block"`, manche Privatmodi), kommt `undefined`
      // zurueck statt einer Ablehnung. Ohne diese Pruefung wirft der Zugriff
      // auf `reg.waiting` — die Aktualisierungspruefung faellt dann still aus.
      if (!reg) return;
      registration = reg;

      // Beim Laden kann bereits eine Fassung warten — etwa weil die App
      // zwischendurch geschlossen war.
      considerWaiting(reg.waiting);
      trackInstalling(reg.installing);

      const onUpdateFound = () => trackInstalling(reg.installing);
      reg.addEventListener("updatefound", onUpdateFound);
      cleanups.push(() =>
        reg.removeEventListener("updatefound", onUpdateFound),
      );
    })
    .catch((err) => onError?.(err));

  return {
    checkForUpdate() {
      if (stopped || !registration) return;
      const t = now();
      if (t - lastCheck < throttleMs) return;
      lastCheck = t;
      registration.update().catch(() => {
        // Ohne Netz schlaegt die Suche fehl — beim naechsten Mal wieder.
      });
    },

    applyUpdate() {
      if (!waitingWorker) return;
      updateRequested = true;
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    },

    stop() {
      stopped = true;
      for (const c of cleanups.splice(0)) c();
    },
  };
}
