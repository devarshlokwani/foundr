import crypto from "node:crypto";

/**
 * Encryption for third-party access tokens at rest.
 *
 * A Shopify Admin API token can read a merchant's entire order and
 * customer history. Storing it as plain text in the database would mean a
 * single read of one collection hands over live access to every connected
 * store, so it gets encrypted with a key that lives outside the database.
 *
 * AES-256-GCM, chosen because it authenticates as well as encrypts: a
 * tampered ciphertext fails to decrypt instead of quietly producing
 * garbage that then gets sent to Shopify as a token.
 *
 * Format stored: "v1:<iv>:<authTag>:<ciphertext>", all base64. The version
 * prefix means a future key rotation or algorithm change can recognise and
 * migrate old values rather than guessing at them.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is defined around

/**
 * Reads the key at call time rather than at import time, so a server
 * missing the variable still boots and serves every other route. Only the
 * Shopify routes fail, and they fail with a clear message, instead of the
 * whole API refusing to start over a feature most requests never touch.
 */
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded (256 bits for AES-256).");
  }
  return key;
}

/** True when a key is configured and usable, for surfacing setup problems before a founder hits them. */
export function isEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptToken(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Stored token is not in the expected encrypted format.");
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
