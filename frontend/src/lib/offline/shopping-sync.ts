/**
 * Offline queue for the shopping list.
 *
 * Every mutation goes through `sendOrQueue()`: it tries the network first and,
 * only on a *network* failure, parks the operation in IndexedDB. HTTP errors
 * (4xx/5xx) are real errors and are thrown so the caller can roll back — a
 * queued operation would otherwise hide a genuine server rejection forever.
 *
 * The decision logic (what to queue, how to collapse a queue, what to discard)
 * is kept pure and IndexedDB-free so it can be unit-tested in a plain Node
 * environment; only the thin adapter at the bottom touches the database.
 */

import {
  addPendingOp,
  countPendingOps,
  deletePendingOp,
  getOfflineUserId,
  getPendingOps,
  putPendingOp,
  type PendingOp,
  type PendingOpKind,
  type ShoppingItem,
} from "./db";

// ── Operation payloads ───────────────────────────────────────────────────────

export interface TogglePayload {
  itemId: string;
  isChecked: boolean;
}

export interface AddPayload {
  /** Client-side placeholder id; replaced by the server id after sync. */
  tempId: string;
  ingredientName: string;
  amount?: number;
  unit?: string;
}

export interface DeletePayload {
  itemId: string;
}

export interface CheckAllPayload {
  action: "check-all" | "uncheck-all";
}

export interface OpInput {
  kind: PendingOpKind;
  payload: unknown;
}

/** Prefix marking an item that exists only locally until the queue is flushed. */
export const TEMP_ID_PREFIX = "offline-";

export function createTempId(): string {
  return `${TEMP_ID_PREFIX}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * A fetch rejection means the request never reached the server (DNS, radio
 * off, aeroplane mode) — the browser signals that as a `TypeError`. Anything
 * else is a programming error and must not be swallowed into the queue.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  return false;
}

/**
 * Whether a failed op must be discarded instead of retried forever.
 * 404 = the item is gone server-side. Other client errors are equally
 * permanent; 401 (session expired), 408 and 429 can succeed on a later try.
 */
export function isPermanentFailure(status: number): boolean {
  if (status === 401 || status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

// ── Request mapping ──────────────────────────────────────────────────────────

export interface QueuedRequest {
  url: string;
  method: string;
  body?: string;
}

export function opToRequest(
  kind: PendingOpKind,
  payload: unknown,
): QueuedRequest {
  switch (kind) {
    case "toggle": {
      const p = payload as TogglePayload;
      return {
        url: `/api/shopping-list/${p.itemId}`,
        method: "PUT",
        body: JSON.stringify({ isChecked: p.isChecked }),
      };
    }
    case "add": {
      const p = payload as AddPayload;
      return {
        url: "/api/shopping-list",
        method: "POST",
        body: JSON.stringify({
          ingredientName: p.ingredientName,
          amount: p.amount,
          unit: p.unit,
        }),
      };
    }
    case "delete": {
      const p = payload as DeletePayload;
      return { url: `/api/shopping-list/${p.itemId}`, method: "DELETE" };
    }
    case "checkAll": {
      const p = payload as CheckAllPayload;
      return {
        url: "/api/shopping-list/batch",
        method: "PATCH",
        body: JSON.stringify({ action: p.action }),
      };
    }
    case "clear":
      return { url: "/api/shopping-list/batch", method: "DELETE" };
  }
}

/** The item id an op refers to, or null for list-wide operations. */
export function opItemId(op: OpInput): string | null {
  switch (op.kind) {
    case "toggle":
      return (op.payload as TogglePayload).itemId;
    case "delete":
      return (op.payload as DeletePayload).itemId;
    case "add":
      return (op.payload as AddPayload).tempId;
    default:
      return null;
  }
}

/** Rewrites a temp id to the server id an earlier `add` returned. */
export function applyIdMap<T extends OpInput>(
  op: T,
  idMap: Map<string, string>,
): T {
  const current = opItemId(op);
  if (!current || op.kind === "add") return op;
  const mapped = idMap.get(current);
  if (!mapped) return op;
  return {
    ...op,
    payload: { ...(op.payload as object), itemId: mapped },
  };
}

// ── Queue collapsing (Last-Write-Wins per item id) ───────────────────────────

export interface CollapseResult<T> {
  /** Ops to replay, in order. */
  send: T[];
  /** Ids of superseded ops — delete them without sending. */
  drop: number[];
}

/**
 * Collapses a replay queue:
 *  - repeated toggles of the same item → only the last one survives (LWW),
 *  - toggles superseded by a later delete of the same item are dropped,
 *  - a later check-all/uncheck-all overwrites every earlier toggle,
 *  - deleting an item that was only added offline cancels both ops.
 * Adds and clears are never collapsed — each is a distinct intent.
 */
export function collapsePendingOps<T extends PendingOp>(
  ops: T[],
): CollapseResult<T> {
  const send: T[] = [];

  const dropFrom = (predicate: (op: T) => boolean) => {
    for (let i = send.length - 1; i >= 0; i--) {
      if (predicate(send[i])) send.splice(i, 1);
    }
  };

  for (const op of ops) {
    const itemId = opItemId(op);

    if (op.kind === "toggle") {
      dropFrom((o) => o.kind === "toggle" && opItemId(o) === itemId);
      send.push(op);
      continue;
    }

    if (op.kind === "delete") {
      const cancelsPendingAdd =
        itemId !== null &&
        isTempId(itemId) &&
        send.some((o) => o.kind === "add" && opItemId(o) === itemId);
      dropFrom((o) => opItemId(o) === itemId && o.kind !== "delete");
      // An item that never reached the server does not need a DELETE call.
      if (!cancelsPendingAdd) send.push(op);
      continue;
    }

    if (op.kind === "checkAll") {
      dropFrom((o) => o.kind === "toggle");
      send.push(op);
      continue;
    }

    send.push(op);
  }

  const kept = new Set(send.map((o) => o.id));
  return { send, drop: ops.filter((o) => !kept.has(o.id)).map((o) => o.id) };
}

// ── Flush ────────────────────────────────────────────────────────────────────

export interface QueueAdapter {
  list(): Promise<PendingOp[]>;
  remove(id: number): Promise<void>;
  /** Persists a rewritten op (temp id → server id) so a broken-off replay
   *  can resume without losing the reference. */
  update(op: PendingOp): Promise<void>;
}

export interface FlushResult {
  sent: number;
  /** Permanently failed ops that were discarded instead of retried. */
  dropped: number;
  /** Ops still queued afterwards (network gave out mid-flush). */
  remaining: number;
  /** Temp id → server id for items created while offline. */
  idMap: Map<string, string>;
}

/**
 * Replays the queue in order against `fetchFn`. Stops at the first network or
 * transient (5xx) failure and keeps the rest for the next attempt.
 */
export async function runFlush(
  adapter: QueueAdapter,
  fetchFn: typeof fetch,
): Promise<FlushResult> {
  const ops = await adapter.list();
  const { send, drop } = collapsePendingOps(ops);

  for (const id of drop) await adapter.remove(id);

  const idMap = new Map<string, string>();
  const deadTempIds = new Set<string>();
  let sent = 0;
  let dropped = 0;
  let stoppedAt = -1;

  for (let i = 0; i < send.length; i++) {
    const queued = send[i];
    const itemId = opItemId(queued);

    // The item this op belongs to never made it to the server — nothing to do.
    if (itemId && deadTempIds.has(itemId)) {
      await adapter.remove(queued.id);
      dropped++;
      continue;
    }

    const op = applyIdMap(queued, idMap);
    const effectiveItemId = opItemId(op);
    if (effectiveItemId && isTempId(effectiveItemId) && op.kind !== "add") {
      // Its `add` was collapsed away or already dropped — no server row exists.
      await adapter.remove(queued.id);
      dropped++;
      continue;
    }

    const req = opToRequest(op.kind, op.payload);

    let res: Response;
    try {
      res = await fetchFn(req.url, {
        method: req.method,
        headers: req.body ? { "Content-Type": "application/json" } : undefined,
        body: req.body,
      });
    } catch {
      stoppedAt = i;
      break;
    }

    if (res.ok) {
      if (op.kind === "add") {
        const created = (await res
          .json()
          .catch(() => null)) as ShoppingItem | null;
        const tempId = (op.payload as AddPayload).tempId;
        if (created?.id) {
          idMap.set(tempId, created.id);
          // Write the new id into the ops still queued behind this one. If the
          // connection drops before they are sent, the next run still knows
          // which server row they belong to.
          for (let j = i + 1; j < send.length; j++) {
            if (opItemId(send[j]) !== tempId) continue;
            send[j] = applyIdMap(send[j], idMap);
            await adapter.update(send[j]);
          }
        } else {
          deadTempIds.add(tempId);
        }
      }
      await adapter.remove(queued.id);
      sent++;
      continue;
    }

    if (isPermanentFailure(res.status)) {
      if (op.kind === "add") deadTempIds.add((op.payload as AddPayload).tempId);
      await adapter.remove(queued.id);
      dropped++;
      continue;
    }

    // 5xx / 401 / 429 — transient, try again later.
    stoppedAt = i;
    break;
  }

  const remaining = stoppedAt === -1 ? 0 : send.length - stoppedAt;
  return { sent, dropped, remaining, idMap };
}

// ── Pending-op count (subscribable for the offline indicator) ────────────────

let pendingCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribePendingOps(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getPendingOpsSnapshot(): number {
  return pendingCount;
}

/** Server render never has a queue — avoids a hydration mismatch. */
export function getPendingOpsServerSnapshot(): number {
  return 0;
}

export async function refreshPendingCount(userId?: string): Promise<number> {
  const uid = userId ?? getOfflineUserId();
  if (!uid) return pendingCount;
  let next = pendingCount;
  try {
    next = await countPendingOps(uid);
  } catch {
    return pendingCount;
  }
  if (next !== pendingCount) {
    pendingCount = next;
    emit();
  }
  return next;
}

/** German label with correct singular/plural. */
export function pendingChangesLabel(count: number): string {
  return count === 1
    ? "1 Änderung wird synchronisiert"
    : `${count} Änderungen werden synchronisiert`;
}

// ── Public API (IndexedDB-backed) ────────────────────────────────────────────

export async function queueOp(userId: string, op: OpInput): Promise<void> {
  writeEpoch++;
  await addPendingOp({
    userId,
    kind: op.kind,
    payload: op.payload,
    createdAt: Date.now(),
  });
  await refreshPendingCount(userId);
}

/**
 * Zaehlt jede *begonnene* Schreiboperation — direkt gesendet oder eingereiht.
 *
 * Eine Aktualisierung der Liste (`GET /api/shopping-list`) darf ihre Antwort
 * nur anwenden, wenn seit dem Absenden der Anfrage nichts geschrieben wurde.
 * Sonst ueberschreibt eine Antwort, die vor dem Abhaken losgeschickt wurde,
 * genau diesen Haken wieder — sichtbar als Zurueckspringen auf langsamen
 * Verbindungen. Die Warteschlange allein reicht als Waechter nicht: online und
 * mit leerer Schlange geht die Aenderung direkt raus und taucht dort nie auf.
 */
let writeEpoch = 0;

/** Stand des Schreibzaehlers; vor und nach einer Abfrage vergleichen. */
export function getWriteEpoch(): number {
  return writeEpoch;
}

let inflightWrites = 0;

/** true, solange eine direkt gesendete Schreiboperation noch unterwegs ist. */
export function hasInflightWrites(): boolean {
  return inflightWrites > 0;
}

export type SendResult<T> = { status: "sent"; data: T } | { status: "queued" };

/**
 * Sends an operation; queues it instead of failing when the device is offline.
 * Throws `HttpError` for real server rejections so the caller can roll back.
 */
export async function sendOrQueue<T = unknown>(
  userId: string,
  op: OpInput,
): Promise<SendResult<T>> {
  const itemId = opItemId(op);
  writeEpoch++;

  // Ordering guard: while anything is still queued, a directly sent request
  // would overtake it and a later replay would then overwrite the newer state.
  // The same holds for an item whose `add` has not reached the server yet —
  // its id does not exist there. Both cases go to the back of the queue.
  const mustQueue =
    getPendingOpsSnapshot() > 0 ||
    (itemId !== null && isTempId(itemId) && op.kind !== "add");

  if (mustQueue) {
    await queueOp(userId, op);
    void flushQueue(userId);
    return { status: "queued" };
  }

  const req = opToRequest(op.kind, op.payload);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    await queueOp(userId, op);
    return { status: "queued" };
  }

  let res: Response;
  inflightWrites++;
  try {
    try {
      res = await fetch(req.url, {
        method: req.method,
        headers: req.body ? { "Content-Type": "application/json" } : undefined,
        body: req.body,
      });
    } catch (err) {
      if (isNetworkError(err)) {
        await queueOp(userId, op);
        return { status: "queued" };
      }
      throw err;
    }

    if (!res.ok) throw new HttpError(res.status);

    const data = (await res.json().catch(() => undefined)) as T;
    return { status: "sent", data };
  } finally {
    inflightWrites--;
  }
}

let inflight: Promise<FlushResult> | null = null;

/**
 * Replays the queue. Concurrent callers (online event + visibilitychange
 * firing together) share one run instead of double-sending.
 */
export function flushQueue(userId?: string): Promise<FlushResult> {
  if (inflight) return inflight;

  const uid = userId ?? getOfflineUserId();
  const empty: FlushResult = {
    sent: 0,
    dropped: 0,
    remaining: 0,
    idMap: new Map(),
  };
  if (!uid) return Promise.resolve(empty);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve(empty);
  }

  const adapter: QueueAdapter = {
    list: () => getPendingOps(uid),
    remove: (id) => deletePendingOp(id),
    update: (op) => putPendingOp(op),
  };

  inflight = runFlush(adapter, fetch)
    .catch(() => empty)
    .then(async (result) => {
      await refreshPendingCount(uid);
      // Every replay path notifies — not just the event listeners — so a flush
      // kicked off by `sendOrQueue` also lets the UI adopt new server ids.
      if (result.sent > 0 || result.dropped > 0) {
        for (const listener of flushListeners) listener(result);
      }
      return result;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

// ── Replay triggers ──────────────────────────────────────────────────────────

let listenersAttached = false;
const flushListeners = new Set<(result: FlushResult) => void>();

/** Notified after every replay that actually changed something server-side. */
export function subscribeFlush(
  onFlushed: (result: FlushResult) => void,
): () => void {
  flushListeners.add(onFlushed);
  return () => {
    flushListeners.delete(onFlushed);
  };
}

function replay(): void {
  void flushQueue();
}

/**
 * Replays on reconnect and whenever the page comes back to the foreground
 * (iOS Safari often restores a backgrounded tab without firing `online`).
 * Idempotent — safe to call from every mounted consumer.
 */
export function startSyncListeners(): void {
  if (typeof window === "undefined") return;

  void refreshPendingCount();

  if (!listenersAttached) {
    listenersAttached = true;
    window.addEventListener("online", replay);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") replay();
    });
  }

  replay();
}
