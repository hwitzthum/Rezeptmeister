/**
 * Dateibasierter Mutex für Ressourcen, die sich mehrere Spec-Dateien teilen.
 *
 * Playwright fährt **Dateien** parallel (`workers: 3`), der KI-Schlüssel hängt
 * aber an *einem* Konto. `phase-2` speichert dort einen Testwert und `phase-7`
 * löscht ihn für „ohne Schlüssel"-Fälle, während `phase-6/8` live gegen Gemini
 * laufen — die Live-Tests bekamen dann 400 „Kein Schlüssel hinterlegt" von
 * einer Datei, die sie nie gesehen hatten. Reproduzierbar, sobald die Dateien
 * zusammen laufen; `mode: "serial"` hilft nicht, es wirkt nur innerhalb einer
 * Datei.
 *
 * Drei Eigenschaften, jede aus einem gemessenen Fehlschlag:
 *
 * - **Besitz.** Freigabe und Aufräumen dürfen nur, wer die Sperre wirklich
 *   bekommen hat. Scheitert `beforeAll`, läuft Playwright `afterAll` trotzdem
 *   — ohne diese Prüfung löschte der Hook einen Schlüssel, den gerade eine
 *   andere Datei benutzte, und riss deren Sperre gleich mit.
 * - **Verwaist = Halter tot**, nicht „älter als n Minuten". Ein Live-Block
 *   hält die Sperre problemlos länger als jede Altersgrenze; ein abgestürzter
 *   Worker führt sein `afterAll` dagegen nie aus. `process.kill(pid, 0)`
 *   unterscheidet die beiden.
 * - **Hook-Timeout.** Playwright gibt einem Hook 30 s; warten dauert länger.
 *   `acquireLock` hebt das Budget des laufenden Hooks selbst an.
 */

import fs from "fs";
import path from "path";
import { test } from "@playwright/test";

const LOCK_ROOT = path.resolve(__dirname, "../../.auth/locks");

/** Name der Ressource, um die sich die Spec-Dateien streiten. */
export const GEMINI_KEY_LOCK = "gemini-api-key";

/** Längstes Warten auf eine Sperre. Ein Live-Block braucht wenige Minuten. */
const WAIT_MS = 10 * 60_000;
const POLL_MS = 100;

interface Owner {
  pid: number;
  token: string;
}

/** Sperren, die *dieser* Prozess gerade hält. */
const held = new Map<string, string>();

function lockDir(name: string) {
  return path.join(LOCK_ROOT, name);
}

function ownerFile(name: string) {
  return path.join(lockDir(name), "owner.json");
}

function readOwner(name: string): Owner | null {
  try {
    return JSON.parse(fs.readFileSync(ownerFile(name), "utf-8")) as Owner;
  } catch {
    return null;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: existiert, gehört aber jemand anderem — lebt also.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Gerade erst angelegt, Halter hat `owner.json` noch nicht geschrieben. */
function freshlyCreated(name: string): boolean {
  try {
    return Date.now() - fs.statSync(lockDir(name)).mtimeMs < 2_000;
  } catch {
    return false;
  }
}

export async function acquireLock(name: string): Promise<void> {
  if (held.has(name)) return;
  // Das Warten darf länger dauern als die 30 s eines Hooks.
  test.setTimeout(WAIT_MS + 30_000);

  fs.mkdirSync(LOCK_ROOT, { recursive: true });
  const dir = lockDir(name);
  const token = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + WAIT_MS;

  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(ownerFile(name), JSON.stringify({ pid: process.pid, token }));
      held.set(name, token);
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const owner = readOwner(name);
      const orphaned = owner
        ? !processAlive(owner.pid)
        : !freshlyCreated(name); // Verzeichnis ohne Besitzer, und nicht brandneu.
      if (orphaned) {
        fs.rmSync(dir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Sperre „${name}" nach ${WAIT_MS} ms nicht bekommen — ` +
            `gehalten von PID ${owner?.pid ?? "?"} (${dir}).`,
        );
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

/** true, wenn dieser Prozess die Sperre gerade hält. */
export function holdsLock(name: string): boolean {
  return held.has(name);
}

/** Gibt die Sperre frei — nur, wenn dieser Prozess sie hält. Sonst ein No-op. */
export function releaseLock(name: string): void {
  const token = held.get(name);
  if (!token) return;
  held.delete(name);
  // Nie das Verzeichnis eines fremden Halters entfernen.
  if (readOwner(name)?.token === token) {
    fs.rmSync(lockDir(name), { recursive: true, force: true });
  }
}
