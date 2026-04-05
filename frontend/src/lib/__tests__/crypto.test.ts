import { describe, it, expect, beforeAll } from "vitest";

// Set up test ENCRYPTION_KEY before importing the module
beforeAll(() => {
  process.env.ENCRYPTION_KEY = "0".repeat(64); // 32 zero-bytes as hex
});

// Dynamic import so env is set before module loads
const getCrypto = async () => import("../crypto");

describe("crypto – encrypt/decrypt", () => {
  it("round-trips a short string", async () => {
    const { encrypt, decrypt } = await getCrypto();
    const plaintext = "sk-test-12345";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("round-trips a long API key string", async () => {
    const { encrypt, decrypt } = await getCrypto();
    const key = "sk-" + "x".repeat(200);
    expect(decrypt(encrypt(key))).toBe(key);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const { encrypt } = await getCrypto();
    const a = encrypt("same-secret");
    const b = encrypt("same-secret");
    expect(a).not.toBe(b);
  });

  it("throws when ciphertext is tampered with", async () => {
    const { encrypt, decrypt } = await getCrypto();
    const ciphertext = encrypt("secret");
    const tampered = Buffer.from(ciphertext, "base64");
    // Flip a byte in the ciphertext region
    tampered[15] ^= 0xff;
    expect(() => decrypt(tampered.toString("base64"))).toThrow();
  });

  it("throws for ciphertext that is too short", async () => {
    const { decrypt } = await getCrypto();
    expect(() => decrypt(Buffer.from("tooshort").toString("base64"))).toThrow(
      "Ungültiger Chiffretext.",
    );
  });
});

describe("crypto – maskApiKey", () => {
  it("shows first 3 and last 4 chars", async () => {
    const { maskApiKey } = await getCrypto();
    expect(maskApiKey("sk-abcdefgh1234")).toBe("sk-...1234");
  });

  it("hides very short keys entirely", async () => {
    const { maskApiKey } = await getCrypto();
    expect(maskApiKey("short")).toBe("•••");
  });

  it("handles exactly 8-char key", async () => {
    const { maskApiKey } = await getCrypto();
    expect(maskApiKey("abcdefgh")).toBe("•••");
  });

  it("handles 9-char key", async () => {
    const { maskApiKey } = await getCrypto();
    expect(maskApiKey("abcdefghi")).toBe("abc...fghi");
  });
});

describe("crypto – missing ENCRYPTION_KEY", () => {
  it("throws when ENCRYPTION_KEY is missing", async () => {
    const orig = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    const { encrypt } = await getCrypto();
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = orig;
  });

  it("throws when ENCRYPTION_KEY is wrong length", async () => {
    const orig = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = "tooshort";
    const { encrypt } = await getCrypto();
    expect(() => encrypt("test")).toThrow("ENCRYPTION_KEY");
    process.env.ENCRYPTION_KEY = orig;
  });
});
