import { NextRequest } from "next/server";
import { safeEqualText } from "@/lib/security/webhook-signature";

/**
 * Authorizes a request to a cron endpoint by comparing a shared secret. Accepts
 * the secret either as a `Bearer` token (the form Vercel Cron sends) or via the
 * `x-relayroom-cron-secret` header for manual/self-hosted triggers.
 *
 * Returns a discriminated result rather than throwing so route handlers can map
 * it straight onto a response. A missing server-side secret is a 500 (misconfig),
 * not a 401, so it surfaces as an operator error rather than a silent reject.
 */
export function authorizeCronRequest(
  request: NextRequest
): { ok: true } | { error: string; ok: false; status: number } {
  const expectedSecret = process.env.CRON_SECRET || process.env.DETECTION_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return { error: "MissingCronSecret", ok: false, status: 500 };
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const fallbackHeaderSecret = request.headers.get("x-relayroom-cron-secret") || "";
  const providedSecret = headerSecret || fallbackHeaderSecret;

  // Constant-time compare to avoid leaking the secret via response timing.
  if (!providedSecret || !safeEqualText(providedSecret, expectedSecret)) {
    return { error: "Unauthorized", ok: false, status: 401 };
  }

  return { ok: true };
}
