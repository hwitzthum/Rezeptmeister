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

export function isPrivateIpv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === "::1") return true;
  // Link-local fe80::/10
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  )
    return true;
  // Unique Local fc00::/7 (fc:: and fd::)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped ::ffff:x.x.x.x
  if (lower.startsWith("::ffff:")) {
    const v4Part = lower.slice(7);
    if (net.isIPv4(v4Part) && isPrivateIpv4(v4Part)) return true;
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
