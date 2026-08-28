import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  watchForUpdates,
  type SwContainer,
  type SwRegistration,
  type SwWorker,
} from "../sw-update";

// ── Attrappen ────────────────────────────────────────────────────────────────

function makeWorker(state = "installing"): SwWorker & { fire(): void; messages: unknown[] } {
  const listeners: (() => void)[] = [];
  const messages: unknown[] = [];
  return {
    state,
    messages,
    postMessage: (m: unknown) => messages.push(m),
    addEventListener: (_t: "statechange", l: () => void) => listeners.push(l),
    removeEventListener: (_t: "statechange", l: () => void) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    fire: () => listeners.slice().forEach((l) => l()),
  };
}

function makeRegistration(): SwRegistration & { fireUpdateFound(): void; updateCalls: number } {
  const listeners: (() => void)[] = [];
  const reg = {
    waiting: null as SwWorker | null,
    installing: null as SwWorker | null,
    updateCalls: 0,
    update: vi.fn(async () => {
      reg.updateCalls += 1;
    }),
    addEventListener: (_t: "updatefound", l: () => void) => listeners.push(l),
    removeEventListener: (_t: "updatefound", l: () => void) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    fireUpdateFound: () => listeners.slice().forEach((l) => l()),
  };
  return reg;
}

function makeContainer(registration: SwRegistration, hasController = true) {
  const listeners: (() => void)[] = [];
  return {
    container: {
      controller: hasController ? {} : null,
      register: vi.fn(async () => registration),
      addEventListener: (_t: "controllerchange", l: () => void) => listeners.push(l),
      removeEventListener: (_t: "controllerchange", l: () => void) => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      },
    } satisfies SwContainer,
    fireControllerChange: () => listeners.slice().forEach((l) => l()),
  };
}

// Die Registrierung ist ein Promise — einmal die Microtask-Queue leeren.
const settle = () => new Promise((r) => setTimeout(r, 0));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("watchForUpdates", () => {
  let onUpdateReady: Mock<() => void>;
  let onActivated: Mock<() => void>;

  beforeEach(() => {
    onUpdateReady = vi.fn<() => void>();
    onActivated = vi.fn<() => void>();
  });

  it("meldet eine bereits wartende Fassung sofort", async () => {
    const reg = makeRegistration();
    reg.waiting = makeWorker("installed");
    const { container } = makeContainer(reg);

    watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("meldet eine Fassung, die waehrend der Sitzung fertig installiert", async () => {
    const reg = makeRegistration();
    const { container } = makeContainer(reg);

    watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();
    expect(onUpdateReady).not.toHaveBeenCalled();

    const neu = makeWorker("installing");
    reg.installing = neu;
    reg.fireUpdateFound();
    expect(onUpdateReady).not.toHaveBeenCalled(); // noch nicht fertig

    neu.state = "installed";
    neu.fire();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("meldet beim allerersten Besuch nichts", async () => {
    // Ohne Controller ist die Installation kein Update, sondern der Erstbezug.
    const reg = makeRegistration();
    reg.waiting = makeWorker("installed");
    const { container } = makeContainer(reg, false);

    watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();

    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("schickt SKIP_WAITING erst auf ausdruecklichen Wunsch", async () => {
    const reg = makeRegistration();
    const wartend = makeWorker("installed");
    reg.waiting = wartend;
    const { container } = makeContainer(reg);

    const watcher = watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();

    expect(wartend.messages).toEqual([]);
    watcher.applyUpdate();
    expect(wartend.messages).toEqual([{ type: "SKIP_WAITING" }]);
  });

  it("laedt erst neu, nachdem die Uebernahme angefordert wurde", async () => {
    const reg = makeRegistration();
    reg.waiting = makeWorker("installed");
    const { container, fireControllerChange } = makeContainer(reg);

    const watcher = watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();

    // Ein Controllerwechsel ohne Anforderung — etwa beim Erstbezug in einem
    // anderen Tab — darf kein Neuladen ausloesen.
    fireControllerChange();
    expect(onActivated).not.toHaveBeenCalled();

    watcher.applyUpdate();
    fireControllerChange();
    expect(onActivated).toHaveBeenCalledTimes(1);
  });

  it("fragt nicht oefter nach als erlaubt", async () => {
    const reg = makeRegistration();
    const { container } = makeContainer(reg);
    let jetzt = 1_000;

    const watcher = watchForUpdates({
      container,
      onUpdateReady,
      onActivated,
      throttleMs: 60_000,
      now: () => jetzt,
    });
    await settle();

    watcher.checkForUpdate();
    watcher.checkForUpdate();
    watcher.checkForUpdate();
    expect(reg.updateCalls).toBe(1);

    jetzt += 60_001;
    watcher.checkForUpdate();
    expect(reg.updateCalls).toBe(2);
  });

  it("uebersteht eine gescheiterte Suche", async () => {
    const reg = makeRegistration();
    reg.update = vi.fn(async () => {
      throw new Error("offline");
    });
    const { container } = makeContainer(reg);

    const watcher = watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();

    expect(() => watcher.checkForUpdate()).not.toThrow();
    await settle();
  });

  it("meldet einen Registrierungsfehler statt zu werfen", async () => {
    const reg = makeRegistration();
    const { container } = makeContainer(reg);
    container.register = vi.fn(async () => {
      throw new Error("kein HTTPS");
    });
    const onError = vi.fn<(e: unknown) => void>();

    watchForUpdates({ container, onUpdateReady, onActivated, onError });
    await settle();

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("meldet nach stop() nichts mehr", async () => {
    const reg = makeRegistration();
    const { container, fireControllerChange } = makeContainer(reg);

    const watcher = watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();
    watcher.applyUpdate();
    watcher.stop();

    fireControllerChange();
    expect(onActivated).not.toHaveBeenCalled();

    const neu = makeWorker("installed");
    reg.installing = neu;
    reg.fireUpdateFound();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("sucht nach stop() nicht weiter", async () => {
    const reg = makeRegistration();
    const { container } = makeContainer(reg);

    const watcher = watchForUpdates({ container, onUpdateReady, onActivated });
    await settle();
    watcher.stop();
    watcher.checkForUpdate();

    expect(reg.updateCalls).toBe(0);
  });
});
