import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

describe("mutation request guard", () => {
  it("allows same-origin browser mutations", () => {
    const request = new NextRequest("http://localhost:3000/api/pipelines/pipe/status", {
      headers: { origin: "http://localhost:3000" },
      method: "POST"
    });

    expect(rejectCrossSiteMutation(request)).toBeNull();
  });

  it("rejects cross-origin browser mutations", async () => {
    const request = new NextRequest("http://localhost:3000/api/pipelines/pipe/status", {
      headers: { origin: "https://evil.example" },
      method: "POST"
    });

    const response = rejectCrossSiteMutation(request);

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "InvalidRequestOrigin" });
  });

  it("rejects session-cookie mutations without browser origin metadata", async () => {
    const request = new NextRequest("http://localhost:3000/api/pipelines/pipe/status", {
      method: "POST"
    });

    const response = rejectCrossSiteMutation(request);

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "MissingRequestOrigin" });
  });

  it("allows bearer API-key mutations without browser origin metadata", () => {
    const request = new NextRequest("http://localhost:3000/api/pipelines/pipe/status", {
      headers: { authorization: "Bearer rrp_live_test" },
      method: "POST"
    });

    expect(rejectCrossSiteMutation(request)).toBeNull();
  });
});
