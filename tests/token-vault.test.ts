import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "@/lib/security/token-vault";

describe("token vault", () => {
  it("round trips encrypted OAuth tokens", () => {
    const key = randomBytes(32).toString("base64");
    const encrypted = encryptToken("refresh-token-secret", key);

    expect(encrypted).not.toContain("refresh-token-secret");
    expect(decryptToken(encrypted, key)).toBe("refresh-token-secret");
  });

  it("rejects invalid key lengths", () => {
    expect(() => encryptToken("token", Buffer.from("short").toString("base64"))).toThrow(
      "32 bytes"
    );
  });
});
