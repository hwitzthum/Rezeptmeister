/**
 * SSRF (Server-Side Request Forgery) protection for the Next.js frontend.
 *
 * Validates that a URL's hostname resolves only to public IP addresses,
 * blocking requests to private networks, localhost, link-local ranges, etc.
 *
 * This mirrors the backend's Python SSRF guard in:
 *   backend/app/services/url_import_service.py
 */

import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import net from "node:net";
import type { LookupFunction } from "node:net";
import http from "node:http";
import https from "node:https";

/** CIDR-style blocked ranges represented as [bigint network, bigint mask] pairs. */
const BLOCKED_RANGES_V4: [bigint, bigint][] = [
  ["10.0.0.0", "255.0.0.0"],
  ["172.16.0.0", "255.240.0.0"],
  ["192.168.0.0", "255.255.0.0"],
  ["127.0.0.0", "255.0.0.0"],
  ["169.254.0.0", "255.255.0.0"], // link-local / AWS metadata (169.254.169.254)
  ["100.64.0.0", "255.192.0.0"], // shared address space (RFC 6598)
  ["0.0.0.0", "255.0.0.0"], // "this" network
  ["192.0.2.0", "255.255.255.0"], // TEST-NET-1 (RFC 5737)
  ["198.51.100.0", "255.255.255.0"], // TEST-NET-2
  ["203.0.113.0", "255.255.255.0"], // TEST-NET-3
  ["240.0.0.0", "240.0.0.0"], // reserved
].map(([net, mask]) => [ipv4ToBigInt(net), ipv4ToBigInt(mask)]);

function ipv4ToBigInt(ip: string): bigint {
  return ip
    .split(".")
    .reduce(
      (acc, octet) => (acc << BigInt(8)) | BigInt(parseInt(octet, 10)),
      BigInt(0),
    );
}

export function isPrivateIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const addr = ipv4ToBigInt(ip);
  return BLOCKED_RANGES_V4.some(
    ([network, mask]) => (addr & mask) === (network & mask),
  );
}

/**
 * Expands any valid textual IPv6 representation into its 8 constituent
 * 16-bit hextets (as numbers), or returns null if the string cannot be
 * parsed. Handles "::" zero-compression and a trailing embedded IPv4
 * address in dotted-decimal form (e.g. "::ffff:127.0.0.1"), whichever
 * form the caller happens to receive.
 */
function expandIpv6ToHextets(ip: string): number[] | null {
  let addr = ip;

  // An embedded IPv4 address, if present, is always the final segment and
  // always written in dotted-decimal form when it appears in the *input*
  // string — but callers may hand us either that form or the fully-hex
  // form the WHATWG URL parser normalises to (see below), so this branch
  // only fires for the dotted form.
  const segments = addr.split(":");
  const last = segments[segments.length - 1];
  if (last.includes(".")) {
    if (!net.isIPv4(last)) return null;
    const octets = last.split(".").map(Number);
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    segments[segments.length - 1] = hi;
    segments.push(lo);
    addr = segments.join(":");
  }

  let hextetStrings: string[];
  if (addr.includes("::")) {
    // "::" may appear only once and denotes a run of one-or-more zero
    // hextets; split around it and pad the middle with zeros.
    const parts = addr.split("::");
    if (parts.length !== 2) return null;
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    hextetStrings = [...left, ...Array(missing).fill("0"), ...right];
  } else {
    hextetStrings = addr.split(":");
  }

  if (hextetStrings.length !== 8) return null;

  const hextets: number[] = [];
  for (const h of hextetStrings) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(h)) return null;
    hextets.push(parseInt(h, 16));
  }
  return hextets;
}

export function isPrivateIpv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;

  const hextets = expandIpv6ToHextets(ip);
  // Fail closed: if a syntactically-valid IPv6 address cannot be expanded
  // by our parser, do not treat it as safe.
  if (!hextets) return true;

  // Loopback ::1
  if (hextets.slice(0, 7).every((h) => h === 0) && hextets[7] === 1)
    return true;

  // Link-local fe80::/10 — top 10 bits of the first hextet are 1111111010
  if ((hextets[0] & 0xffc0) === 0xfe80) return true;

  // Unique Local fc00::/7
  if ((hextets[0] & 0xfe00) === 0xfc00) return true;

  // IPv4-mapped ::ffff:0:0/96 and the deprecated IPv4-compatible ::0:0/96
  // form. Both embed an IPv4 address in the low 32 bits; the WHATWG URL
  // parser (used by `new URL()`) always normalises literals like
  // "::ffff:169.254.169.254" to the fully-hex form "::ffff:a9fe:a9fe" —
  // never to dotted-decimal — so the embedded address must be recovered
  // from the hextets themselves rather than by string-matching a dotted
  // suffix, or this check silently never fires for URL-sourced hostnames.
  if (hextets.slice(0, 5).every((h) => h === 0)) {
    const isMapped = hextets[5] === 0xffff;
    const isCompatible = hextets[5] === 0 && (hextets[6] !== 0 || hextets[7] !== 0);
    if (isMapped || isCompatible) {
      const a = (hextets[6] >> 8) & 0xff;
      const b = hextets[6] & 0xff;
      const c = (hextets[7] >> 8) & 0xff;
      const d = hextets[7] & 0xff;
      if (isPrivateIpv4(`${a}.${b}.${c}.${d}`)) return true;
    }
  }

  return false;
}

/**
 * Returns true if ALL resolved IP addresses for the hostname are public.
 * Returns false if any address is private/internal (SSRF guard).
 */
async function isHostnameSafe(hostname: string): Promise<boolean> {
  // Reject raw IP literals that are private without a DNS lookup
  if (net.isIPv4(hostname)) return !isPrivateIpv4(hostname);
  if (net.isIPv6(hostname)) return !isPrivateIpv6(hostname);

  let records: LookupAddress[];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    // DNS failure — treat as unsafe (could be internal hostname)
    return false;
  }

  if (!records || records.length === 0) return false;

  for (const { address, family } of records) {
    if (family === 4 && isPrivateIpv4(address)) return false;
    if (family === 6 && isPrivateIpv6(address)) return false;
  }
  return true;
}

/**
 * Returns true if the URL is safe to fetch externally:
 *   - scheme must be http or https
 *   - hostname must resolve only to public IP addresses
 */
export async function isSafeExternalUrl(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return false;
    let hostname = parsed.hostname;
    // Strip IPv6 brackets
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }
    if (!hostname) return false;
    return await isHostnameSafe(hostname);
  } catch {
    return false;
  }
}

// ── DNS-pinned fetch (closes the TOCTOU / DNS-rebinding gap) ────────────────
//
// isSafeExternalUrl() above resolves DNS once to decide whether a URL is
// safe, but if the caller then makes a *separate* request (e.g. via the
// global fetch()), that second call triggers its own independent DNS
// resolution. An attacker who controls the target's authoritative DNS
// server can answer the first (validation) lookup with a public address and
// the second (connection) lookup — served moments later, with a 0-second
// TTL — with an internal address (169.254.169.254, 127.0.0.1, RFC1918,
// etc.). This is the classic "DNS rebinding" bypass of a validate-then-fetch
// SSRF guard.
//
// pinnedGet() closes that window by using a custom `lookup` function (a
// stable, documented option on Node's http.request/https.request — not a
// third-party API) that performs exactly ONE resolution, validates every
// returned address, and hands the already-validated address straight to the
// TCP connector. There is no second, independently-answerable DNS query for
// an attacker's nameserver to flip.

const MAX_PINNED_RESPONSE_BYTES = 10 * 1024 * 1024; // matches MAX_IMAGE_BYTES

/**
 * Node-compatible `lookup` function (see http.request options) that resolves
 * a hostname, rejects the connection if any returned address is private, and
 * otherwise hands back an already-validated address for the real TCP
 * connect — the same resolution used for validation is the one used to
 * connect, eliminating the DNS-rebinding TOCTOU window.
 */
function createPinnedLookup(): LookupFunction {
  return (hostname, options, callback): void => {
    void options;
    (async () => {
      try {
        if (net.isIPv4(hostname)) {
          if (isPrivateIpv4(hostname)) {
            throw new Error(`SSRF-Schutz: private Adresse blockiert: ${hostname}`);
          }
          callback(null, hostname, 4);
          return;
        }
        if (net.isIPv6(hostname)) {
          if (isPrivateIpv6(hostname)) {
            throw new Error(`SSRF-Schutz: private Adresse blockiert: ${hostname}`);
          }
          callback(null, hostname, 6);
          return;
        }

        const records = await dns.lookup(hostname, { all: true });
        if (!records || records.length === 0) {
          throw new Error(`Hostname nicht auflösbar: ${hostname}`);
        }
        for (const { address, family } of records) {
          if (family === 4 && isPrivateIpv4(address)) {
            throw new Error(`SSRF-Schutz: private Adresse blockiert: ${address}`);
          }
          if (family === 6 && isPrivateIpv6(address)) {
            throw new Error(`SSRF-Schutz: private Adresse blockiert: ${address}`);
          }
        }
        // Use the validated record directly for the real connection.
        const chosen = records[0];
        callback(null, chosen.address, chosen.family);
      } catch (err) {
        callback(err as NodeJS.ErrnoException, "", 0);
      }
    })();
  };
}

export interface PinnedResponse {
  ok: boolean;
  status: number;
  getHeader(name: string): string | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * DNS-rebinding-safe GET request. Behaves like a minimal subset of fetch()
 * (manual redirect handling — 3xx responses are returned as-is, never
 * auto-followed) but pins DNS resolution to the addresses validated at
 * connect time via createPinnedLookup(), instead of trusting a separate,
 * earlier isSafeExternalUrl() check that a rebinding attacker could answer
 * differently on the real connection.
 */
export function pinnedGet(
  urlString: string,
  headers: Record<string, string>,
  timeoutMs = 10_000,
): Promise<PinnedResponse> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      reject(new Error(`Ungültiges Schema: ${url.protocol}`));
      return;
    }

    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        method: "GET",
        headers,
        lookup: createPinnedLookup(),
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_PINNED_RESPONSE_BYTES) {
            res.destroy();
            reject(new Error("Antwort überschreitet die maximale Grösse."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const body = Buffer.concat(chunks);
          resolve({
            ok: status >= 200 && status < 300,
            status,
            getHeader: (name: string) => {
              const value = res.headers[name.toLowerCase()];
              if (Array.isArray(value)) return value[0] ?? null;
              return value ?? null;
            },
            arrayBuffer: async () =>
              body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Zeitüberschreitung der Anfrage.")));
    req.on("error", reject);
    req.end();
  });
}
