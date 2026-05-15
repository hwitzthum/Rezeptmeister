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
import net from "node:net";

/** CIDR-style blocked ranges represented as [bigint network, bigint mask] pairs. */
const BLOCKED_RANGES_V4: [bigint, bigint][] = [
  ["10.0.0.0", "255.0.0.0"],
  ["172.16.0.0", "255.240.0.0"],
  ["192.168.0.0", "255.255.0.0"],
  ["127.0.0.0", "255.0.0.0"],
  ["169.254.0.0", "255.255.0.0"], // link-local / AWS metadata (169.254.169.254)
  ["100.64.0.0", "255.192.0.0"],  // shared address space (RFC 6598)
  ["0.0.0.0", "255.0.0.0"],       // "this" network
  ["192.0.2.0", "255.255.255.0"], // TEST-NET-1 (RFC 5737)
  ["198.51.100.0", "255.255.255.0"], // TEST-NET-2
  ["203.0.113.0", "255.255.255.0"],  // TEST-NET-3
  ["240.0.0.0", "240.0.0.0"],    // reserved
].map(([net, mask]) => [ipv4ToBigInt(net), ipv4ToBigInt(mask)]);

function ipv4ToBigInt(ip: string): bigint {
  return ip.split(".").reduce((acc, octet) => (acc << 8n) | BigInt(parseInt(octet, 10)), 0n);
}

function isPrivateIpv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const addr = ipv4ToBigInt(ip);
  return BLOCKED_RANGES_V4.some(([network, mask]) => (addr & mask) === (network & mask));
}

function isPrivateIpv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === "::1") return true;
  // Link-local fe80::/10
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
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

  let records: dns.LookupAddress[];
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
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
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
