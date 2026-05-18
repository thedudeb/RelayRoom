import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/security/webhook-signature";

const body = JSON.stringify({ sourceFolderId: "folder-123" });
const secret = "test-webhook-secret";
const timestamp = "2026-05-18T12:00:00.000Z";
const now = new Date(timestamp);

function headers(signature = signWebhookPayload({ body, secret, timestamp })) {
  return new Headers({
    "x-relayroom-signature": signature,
    "x-relayroom-timestamp": timestamp
  });
}

describe("webhook signatures", () => {
  it("accepts a matching HMAC signature", () => {
    expect(
      verifyWebhookSignature({
        body,
        headers: headers(),
        now,
        secret
      })
    ).toEqual({ ok: true, status: 200 });
  });

  it("rejects mismatched payloads", () => {
    const result = verifyWebhookSignature({
      body: JSON.stringify({ sourceFolderId: "other-folder" }),
      headers: headers(),
      now,
      secret
    });

    expect(result).toEqual({
      error: "InvalidWebhookSignature",
      ok: false,
      status: 401
    });
  });

  it("rejects stale timestamps", () => {
    const result = verifyWebhookSignature({
      body,
      headers: headers(),
      now: new Date("2026-05-18T12:06:00.000Z"),
      secret
    });

    expect(result).toEqual({
      error: "StaleWebhookTimestamp",
      ok: false,
      status: 401
    });
  });

  it("requires a configured secret", () => {
    const result = verifyWebhookSignature({
      body,
      headers: headers(),
      now
    });

    expect(result).toEqual({
      error: "MissingWebhookSecret",
      ok: false,
      status: 500
    });
  });
});
