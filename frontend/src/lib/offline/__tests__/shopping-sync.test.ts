import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  applyIdMap,
  collapsePendingOps,
  isNetworkError,
  isPermanentFailure,
  opItemId,
  opToRequest,
  pendingChangesLabel,
  runFlush,
  type QueueAdapter,
} from "../shopping-sync";
import type { PendingOp, PendingOpKind } from "../db";

// -- Helpers ---------------------------------------------------------------

let nextId = 1;

const op = (kind: PendingOpKind, payload: unknown): PendingOp => ({
  id: nextId++,
  userId: "user-1",
  kind,
  payload,
  createdAt: Date.now(),
});

const toggle = (itemId: string, isChecked: boolean) =>
  op("toggle", { itemId, isChecked });
const del = (itemId: string) => op("delete", { itemId });
const add = (tempId: string, ingredientName = "Reis") =>
  op("add", { tempId, ingredientName });
const checkAll = (action: "check-all" | "uncheck-all" = "check-all") =>
  op("checkAll", { action });
const clear = () => op("clear", {});

/** Minimal in-memory queue so the flush loop is testable without IndexedDB. */
function memoryAdapter(ops: PendingOp[]): QueueAdapter & { rows: PendingOp[] } {
  const rows = [...ops];
  return {
    rows,
    list: async () => [...rows],
    remove: async (id: number) => {
      const i = rows.findIndex((o) => o.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
    update: async (updated: PendingOp) => {
      const i = rows.findIndex((o) => o.id === updated.id);
      if (i >= 0) rows[i] = updated;
    },
  };
}

const res = (status: number, body: unknown = {}): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

beforeEach(() => {
  nextId = 1;
});

// -- Netzfehler vs. HTTP-Fehler -------------------------------------------

describe("isNetworkError", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("erkennt den TypeError von fetch als Netzfehler", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("behandelt andere Fehler nicht als Netzfehler", () => {
    expect(isNetworkError(new Error("kaputt"))).toBe(false);
    expect(isNetworkError({ status: 500 })).toBe(false);
  });

  it("erkennt navigator.onLine === false als offline", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });
    expect(isNetworkError(new Error("kaputt"))).toBe(true);
  });
});

describe("isPermanentFailure", () => {
  it("verwirft 404 (Eintrag serverseitig weg)", () => {
    expect(isPermanentFailure(404)).toBe(true);
  });

  it("verwirft Validierungsfehler", () => {
    expect(isPermanentFailure(400)).toBe(true);
    expect(isPermanentFailure(403)).toBe(true);
  });

  it("wiederholt Serverfehler, Rate-Limit und abgelaufene Session", () => {
    expect(isPermanentFailure(500)).toBe(false);
    expect(isPermanentFailure(429)).toBe(false);
    expect(isPermanentFailure(401)).toBe(false);
    expect(isPermanentFailure(408)).toBe(false);
  });
});

// -- Request-Mapping -------------------------------------------------------

describe("opToRequest", () => {
  it("bildet jede Op-Art auf ihre Route ab", () => {
    expect(opToRequest("toggle", { itemId: "abc", isChecked: true })).toEqual({
      url: "/api/shopping-list/abc",
      method: "PUT",
      body: JSON.stringify({ isChecked: true }),
    });
    expect(opToRequest("delete", { itemId: "abc" })).toEqual({
      url: "/api/shopping-list/abc",
      method: "DELETE",
    });
    expect(opToRequest("checkAll", { action: "uncheck-all" })).toEqual({
      url: "/api/shopping-list/batch",
      method: "PATCH",
      body: JSON.stringify({ action: "uncheck-all" }),
    });
    expect(opToRequest("clear", {})).toEqual({
      url: "/api/shopping-list/batch",
      method: "DELETE",
    });
    expect(
      opToRequest("add", { tempId: "offline-1", ingredientName: "Reis" }),
    ).toMatchObject({ url: "/api/shopping-list", method: "POST" });
  });

  it("liest die Item-ID je nach Op-Art", () => {
    expect(opItemId(toggle("a", true))).toBe("a");
    expect(opItemId(del("a"))).toBe("a");
    expect(opItemId(add("offline-x"))).toBe("offline-x");
    expect(opItemId(checkAll())).toBeNull();
    expect(opItemId(clear())).toBeNull();
  });
});

// -- Last-Write-Wins -------------------------------------------------------

describe("collapsePendingOps", () => {
  it("behält bei mehrfachem Umschalten nur den letzten Stand", () => {
    const ops = [toggle("a", true), toggle("a", false), toggle("a", true)];
    const { send, drop } = collapsePendingOps(ops);
    expect(send).toHaveLength(1);
    expect(send[0].payload).toEqual({ itemId: "a", isChecked: true });
    expect(drop).toEqual([1, 2]);
  });

  it("fasst pro Item-ID getrennt zusammen", () => {
    const ops = [toggle("a", true), toggle("b", true), toggle("a", false)];
    const { send } = collapsePendingOps(ops);
    expect(send.map((o) => opItemId(o))).toEqual(["b", "a"]);
    expect(send[1].payload).toEqual({ itemId: "a", isChecked: false });
  });

  it("verwirft Umschalten, das ein späteres Löschen überholt", () => {
    const ops = [toggle("a", true), del("a")];
    const { send, drop } = collapsePendingOps(ops);
    expect(send).toHaveLength(1);
    expect(send[0].kind).toBe("delete");
    expect(drop).toEqual([1]);
  });

  it("lässt 'Alle abhaken' frühere Umschaltungen überschreiben", () => {
    const ops = [toggle("a", true), toggle("b", false), checkAll()];
    const { send } = collapsePendingOps(ops);
    expect(send).toHaveLength(1);
    expect(send[0].kind).toBe("checkAll");
  });

  it("behält Umschaltungen nach 'Alle abhaken'", () => {
    const first = checkAll();
    const after = toggle("a", false);
    const { send } = collapsePendingOps([first, after]);
    expect(send.map((o) => o.kind)).toEqual(["checkAll", "toggle"]);
  });

  it("hebt Anlegen + Löschen desselben Offline-Eintrags gegenseitig auf", () => {
    const ops = [add("offline-1"), toggle("offline-1", true), del("offline-1")];
    const { send, drop } = collapsePendingOps(ops);
    expect(send).toHaveLength(0);
    expect(drop.sort()).toEqual([1, 2, 3]);
  });

  it("fasst mehrere Anlegen-Ops nie zusammen", () => {
    const ops = [add("offline-1", "Reis"), add("offline-2", "Salz")];
    const { send, drop } = collapsePendingOps(ops);
    expect(send).toHaveLength(2);
    expect(drop).toEqual([]);
  });
});

// -- ID-Remapping ----------------------------------------------------------

describe("applyIdMap", () => {
  it("ersetzt die temporäre ID durch die Server-ID", () => {
    const map = new Map([["offline-1", "real-1"]]);
    const mapped = applyIdMap(toggle("offline-1", true), map);
    expect(mapped.payload).toEqual({ itemId: "real-1", isChecked: true });
  });

  it("lässt unbekannte IDs unverändert", () => {
    const original = toggle("real-9", true);
    expect(applyIdMap(original, new Map())).toBe(original);
  });
});

// -- Replay ----------------------------------------------------------------

describe("runFlush", () => {
  it("sendet in Reihenfolge und leert die Queue", async () => {
    const adapter = memoryAdapter([toggle("a", true), del("b")]);
    const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => res(200),
    );

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result).toMatchObject({ sent: 2, dropped: 0, remaining: 0 });
    expect(adapter.rows).toHaveLength(0);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual([
      "/api/shopping-list/a",
      "/api/shopping-list/b",
    ]);
  });

  it("verwirft 404-Ops statt sie endlos zu wiederholen", async () => {
    const adapter = memoryAdapter([toggle("weg", true), toggle("da", true)]);
    const fetchFn = vi.fn(async (url: string) =>
      url.endsWith("/weg") ? res(404) : res(200),
    );

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result).toMatchObject({ sent: 1, dropped: 1, remaining: 0 });
    expect(adapter.rows).toHaveLength(0);
  });

  it("stoppt beim Netzfehler und behält den Rest", async () => {
    const adapter = memoryAdapter([
      toggle("a", true),
      toggle("b", true),
      toggle("c", true),
    ]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url.endsWith("/b")) throw new TypeError("Failed to fetch");
      return res(200);
    });

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result).toMatchObject({ sent: 1, remaining: 2 });
    expect(adapter.rows.map((o) => opItemId(o))).toEqual(["b", "c"]);
  });

  it("stoppt bei 500 (vorübergehend) statt zu verwerfen", async () => {
    const adapter = memoryAdapter([toggle("a", true), toggle("b", true)]);
    const fetchFn = vi.fn(async () => res(500));

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result).toMatchObject({ sent: 0, dropped: 0, remaining: 2 });
    expect(adapter.rows).toHaveLength(2);
  });

  it("überträgt die Server-ID auf Folge-Ops desselben Offline-Eintrags", async () => {
    const adapter = memoryAdapter([
      add("offline-1", "Reis"),
      toggle("offline-1", true),
    ]);
    const fetchFn = vi.fn(async (url: string) =>
      url === "/api/shopping-list" ? res(201, { id: "real-1" }) : res(200),
    );

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result.sent).toBe(2);
    expect(result.idMap.get("offline-1")).toBe("real-1");
    expect(fetchFn.mock.calls[1][0]).toBe("/api/shopping-list/real-1");
  });

  it("schreibt die Server-ID in noch wartende Ops, wenn der Replay abbricht", async () => {
    const adapter = memoryAdapter([
      add("offline-1", "Reis"),
      toggle("offline-1", true),
    ]);
    const fetchFn = vi.fn(async (url: string) => {
      if (url === "/api/shopping-list") return res(201, { id: "real-1" });
      throw new TypeError("Failed to fetch");
    });

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result).toMatchObject({ sent: 1, remaining: 1 });
    // Die verbliebene Op zeigt jetzt auf die echte ID — der nächste Lauf
    // verwirft sie nicht mehr als "temporär und ohne Server-Zeile".
    expect(adapter.rows).toHaveLength(1);
    expect(opItemId(adapter.rows[0])).toBe("real-1");
  });

  it("verwirft Folge-Ops, wenn das Anlegen dauerhaft fehlschlägt", async () => {
    const adapter = memoryAdapter([
      add("offline-1", "Reis"),
      toggle("offline-1", true),
    ]);
    const fetchFn = vi.fn(async () => res(400));

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(result).toMatchObject({ sent: 0, dropped: 2, remaining: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(adapter.rows).toHaveLength(0);
  });

  it("sendet zusammengefasste Ops nur einmal und räumt die Queue auf", async () => {
    const adapter = memoryAdapter([
      toggle("a", true),
      toggle("a", false),
      toggle("a", true),
    ]);
    const fetchFn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => res(200),
    );

    const result = await runFlush(adapter, fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify({ isChecked: true }),
    });
    expect(result.sent).toBe(1);
    expect(adapter.rows).toHaveLength(0);
  });
});

// -- Anzeigetext -----------------------------------------------------------

describe("pendingChangesLabel", () => {
  it("verwendet den Singular bei genau einer Änderung", () => {
    expect(pendingChangesLabel(1)).toBe("1 Änderung wird synchronisiert");
  });

  it("verwendet den Plural sonst", () => {
    expect(pendingChangesLabel(3)).toBe("3 Änderungen werden synchronisiert");
    expect(pendingChangesLabel(0)).toBe("0 Änderungen werden synchronisiert");
  });
});
