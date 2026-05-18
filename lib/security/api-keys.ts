import { createHash, randomBytes } from "node:crypto";

const keyPrefix = "rrp_live_";

export function generateApiKey() {
  return `${keyPrefix}${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

export function isRelayRoomApiKey(value: string | undefined) {
  return Boolean(value?.startsWith(keyPrefix));
}
