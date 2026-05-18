import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_MS = 5 * 60_000;

export type WebhookSignatureVerification =
  | { ok: true; status: 200 }
  | {
      error:
        | "InvalidWebhookSignature"
        | "MissingWebhookSecret"
        | "StaleWebhookTimestamp";
      ok: false;
      status: number;
    };

export function signWebhookPayload({
  body,
  secret,
  timestamp
}: {
  body: string;
  secret: string;
  timestamp: string;
}) {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

  return `sha256=${digest}`;
}

export function verifyWebhookSignature({
  body,
  headers,
  now = new Date(),
  secret,
  toleranceMs = DEFAULT_TOLERANCE_MS
}: {
  body: string;
  headers: Headers;
  now?: Date;
  secret?: string;
  toleranceMs?: number;
}): WebhookSignatureVerification {
  if (!secret) {
    return { error: "MissingWebhookSecret", ok: false, status: 500 };
  }

  const timestamp = headers.get("x-relayroom-timestamp")?.trim();
  const providedSignature = normalizeSignature(headers.get("x-relayroom-signature"));
  if (!timestamp || !providedSignature) {
    return { error: "InvalidWebhookSignature", ok: false, status: 401 };
  }

  const parsedTimestamp = parseWebhookTimestamp(timestamp);
  if (!parsedTimestamp) {
    return { error: "InvalidWebhookSignature", ok: false, status: 401 };
  }

  if (Math.abs(now.getTime() - parsedTimestamp.getTime()) > toleranceMs) {
    return { error: "StaleWebhookTimestamp", ok: false, status: 401 };
  }

  const expectedSignature = normalizeSignature(signWebhookPayload({ body, secret, timestamp }));
  if (!expectedSignature || !safeEqualHex(providedSignature, expectedSignature)) {
    return { error: "InvalidWebhookSignature", ok: false, status: 401 };
  }

  return { ok: true, status: 200 };
}

function normalizeSignature(signature: string | null) {
  const value = signature?.trim() || "";
  const hex = value.startsWith("sha256=") ? value.slice("sha256=".length) : value;
  return /^[a-f0-9]{64}$/i.test(hex) ? hex.toLowerCase() : "";
}

function parseWebhookTimestamp(timestamp: string) {
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    return new Date(milliseconds);
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function safeEqualText(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}
