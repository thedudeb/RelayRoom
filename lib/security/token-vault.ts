import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";
const ivLength = 12;

export function encryptToken(plainText: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(payload: string, base64Key: string): string {
  const key = decodeKey(base64Key);
  const [ivPart, tagPart, encryptedPart] = payload.split(".");

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Encrypted token payload is malformed.");
  }

  const decipher = createDecipheriv(
    algorithm,
    key,
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
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
