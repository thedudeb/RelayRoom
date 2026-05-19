import { NextRequest } from "next/server";
import { safeEqualText } from "@/lib/security/webhook-signature";

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

  if (!providedSecret || !safeEqualText(providedSecret, expectedSecret)) {
    return { error: "Unauthorized", ok: false, status: 401 };
  }

  return { ok: true };
}
