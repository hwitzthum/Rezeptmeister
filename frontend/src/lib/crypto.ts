/**
 * AES-256-GCM encryption for API keys at rest.
 * Uses Node.js built-in crypto — no external dependencies.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit IV is the GCM recommendation
const TAG_BYTES = 16; // 128-bit authentication tag

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY muss ein 64-Zeichen-Hex-String (32 Bytes) sein.",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt plaintext → base64(iv ‖ ciphertext ‖ tag).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/**
 * Decrypt base64-encoded ciphertext → plaintext.
 * Throws if the key or ciphertext is invalid (GCM auth tag mismatch).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const packed = Buffer.from(ciphertext, "base64");

  if (packed.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Ungültiger Chiffretext.");
  }

  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(packed.length - TAG_BYTES);
  const encrypted = packed.subarray(IV_BYTES, packed.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Mask an API key for safe display: shows first 3 and last 4 characters.
 * e.g. "sk-abcdef...xyz9"
 */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return "•••";
  return `${plaintext.slice(0, 3)}...${plaintext.slice(-4)}`;
}
