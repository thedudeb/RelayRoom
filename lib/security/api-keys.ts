import { createHash, createHmac, randomBytes } from "node:crypto";

const keyPrefix = "rrp_live_";
const hmacPrefix = "h1:";

export function generateApiKey() {
  return `${keyPrefix}${randomBytes(32).toString("base64url")}`;
}

// Hash for writing. With API_KEY_PEPPER set, use HMAC-SHA256 with an
// env-scoped pepper so a DB leak alone is not enough to recover keys via
// precomputation against the known rrp_live_ prefix (ISSUE-036). Without
// the pepper, fall back to the legacy plain SHA-256 so existing keys keep
// working in dev/staging where the pepper hasn't been provisioned.
export function hashApiKey(apiKey: string) {
  const pepper = process.env.API_KEY_PEPPER;
  if (pepper) {
    return `${hmacPrefix}${createHmac("sha256", pepper).update(apiKey, "utf8").digest("hex")}`;
  }
  return legacyHash(apiKey);
}

// Candidates for lookup: when the pepper is set we accept both the new HMAC
// form (new keys) and the legacy SHA-256 form (keys minted before the pepper
// was added). Rotating keys naturally migrates rows forward.
export function candidateApiKeyHashes(apiKey: string): string[] {
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper) {
    return [legacyHash(apiKey)];
  }
  return [
    `${hmacPrefix}${createHmac("sha256", pepper).update(apiKey, "utf8").digest("hex")}`,
    legacyHash(apiKey)
  ];
}

export function isRelayRoomApiKey(value: string | undefined) {
  return Boolean(value?.startsWith(keyPrefix));
}

function legacyHash(apiKey: string) {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}
