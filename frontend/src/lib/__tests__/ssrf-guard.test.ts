import { describe, it, expect } from "vitest";
import http from "node:http";
import {
  isPrivateIpv4,
  isPrivateIpv6,
  isSafeExternalUrl,
  pinnedGet,
} from "../ssrf-guard";

describe("isPrivateIpv4", () => {
  it("flags RFC1918 and loopback ranges as private", () => {
    expect(isPrivateIpv4("10.0.0.5")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("169.254.169.254")).toBe(true); // cloud metadata
  });

  it("does not flag public addresses", () => {
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("1.1.1.1")).toBe(false);
  });
});

describe("isPrivateIpv6", () => {
  it("flags loopback and unique-local addresses", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("fd00::1")).toBe(true);
    expect(isPrivateIpv6("fe80::1")).toBe(true);
  });

  it("does not flag public addresses", () => {
    expect(isPrivateIpv6("2606:4700:4700::1111")).toBe(false);
  });

  it("flags IPv4-mapped addresses regardless of textual form", () => {
    // Dotted-decimal embedded form, as RFC 4291 examples typically show it.
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true); // cloud metadata
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
    // Fully-hex compressed form — this is what the WHATWG URL parser
    // normalises a bracketed IPv6 literal to (new URL() never preserves
    // the dotted-decimal suffix), so the guard must catch this form too.
    expect(isPrivateIpv6("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254
    expect(isPrivateIpv6("::ffff:7f00:1")).toBe(true); // 127.0.0.1
    expect(isPrivateIpv6("::ffff:a00:1")).toBe(true); // 10.0.0.1
  });

  it("does not flag IPv4-mapped public addresses", () => {
    expect(isPrivateIpv6("::ffff:808:808")).toBe(false); // 8.8.8.8
  });
});

describe("isSafeExternalUrl", () => {
  it("rejects private IP literals without a network call", async () => {
    expect(await isSafeExternalUrl("http://127.0.0.1/x")).toBe(false);
    expect(await isSafeExternalUrl("http://169.254.169.254/latest")).toBe(false);
    expect(await isSafeExternalUrl("http://10.0.0.5/x")).toBe(false);
  });

  it("rejects non-http(s) schemes", async () => {
    expect(await isSafeExternalUrl("file:///etc/passwd")).toBe(false);
    expect(await isSafeExternalUrl("ftp://example.com/x")).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 literals used to smuggle a private address", async () => {
    // `new URL()` normalises a bracketed IPv6 literal like
    // "[::ffff:169.254.169.254]" to the fully-hex form "[::ffff:a9fe:a9fe]"
    // before .hostname is ever read, so a check that only recognises the
    // dotted-decimal suffix silently lets these through.
    expect(
      await isSafeExternalUrl("https://[::ffff:169.254.169.254]/latest/meta-data/"),
    ).toBe(false);
    expect(await isSafeExternalUrl("http://[::ffff:127.0.0.1]/x")).toBe(false);
    expect(await isSafeExternalUrl("http://[0:0:0:0:0:ffff:10.0.0.5]/x")).toBe(
      false,
    );
  });
});

describe("pinnedGet", () => {
  it("refuses to connect to a private IP literal even though it is the literal request target", async () => {
    await expect(
      pinnedGet("http://127.0.0.1:1/unreachable", {}, 1_000),
    ).rejects.toThrow();
  });

  it("pins DNS resolution for the real connection to a validated address (loopback test server via 'localhost')", async () => {
    // "localhost" resolves to 127.0.0.1/::1 — both private — so pinnedGet's
    // own lookup must reject the connection before ever reaching the
    // in-process test server, proving the guard runs at actual connect time
    // (not just against the literal string in the URL).
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("should never be reached");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;

    try {
      await expect(
        pinnedGet(`http://localhost:${port}/`, {}, 1_000),
      ).rejects.toThrow();
    } finally {
      server.close();
    }
  });
});
