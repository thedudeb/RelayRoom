import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const ivLength = 12;
// v2 = AES-256-GCM with AAD bound to caller-supplied context (e.g. connection id).
// Tokens without this prefix are legacy v1 and decrypt without AAD; once they
// refresh, they re-encrypt as v2 transparently. NIST SP 800-38D §5.2: associated
// data binds ciphertext to its expected context and prevents cross-paste reuse.
const V2_PREFIX = "v2.";

export function encryptToken(plainText: string, base64Key: string, aad?: string): string {
  const key = decodeKey(base64Key);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, "utf8"));
  }
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
  return aad ? `${V2_PREFIX}${payload}` : payload;
}

export function decryptToken(payload: string, base64Key: string, aad?: string): string {
  const key = decodeKey(base64Key);
  const versionedPayload = payload.startsWith(V2_PREFIX);
  const body = versionedPayload ? payload.slice(V2_PREFIX.length) : payload;
  const [ivPart, tagPart, encryptedPart] = body.split(".");

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Encrypted token payload is malformed.");
  }

  const decipher = createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  if (versionedPayload && aad) {
    decipher.setAAD(Buffer.from(aad, "utf8"));
  }

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

// Canonical AAD string for OAuth tokens. Always pass the connection id; if the
// connection id is rotated or a token is cross-pasted into another row, decrypt
// will fail with an auth-tag error instead of silently succeeding.
export function oauthTokenAad(connectionId: string): string {
  return `oauth:${connectionId}`;
}

export function assertTokenKey(base64Key: string): void {
  decodeKey(base64Key);
}

function decodeKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}
