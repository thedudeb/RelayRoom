import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import {
  signWebhookPayload,
  verifyWebhookSignature
} from "@/lib/security/webhook-signature";

export async function POST(request: NextRequest) {
  const access = await getApiAccess(request.nextUrl.searchParams);
  if (!access || access.isDemo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.DETECTION_WEBHOOK_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "MissingWebhookSecret", message: "Set DETECTION_WEBHOOK_SECRET or CRON_SECRET." },
      { status: 500 }
    );
  }

  const timestamp = new Date().toISOString();
  const body = JSON.stringify({
    eventId: "settings-smoke-test",
    sourceFolderId: "DRIVE_FOLDER_ID"
  });
  const signature = signWebhookPayload({ body, secret, timestamp });
  const headers = new Headers({
    "x-relayroom-signature": signature,
    "x-relayroom-timestamp": timestamp
  });
  const verification = verifyWebhookSignature({
    body,
    headers,
    now: new Date(timestamp),
    secret
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: verification.error, message: "RelayRoom could not verify its own test signature." },
      { status: verification.status }
    );
  }

  return NextResponse.json({
    message: "Signed webhook smoke test passed. External automation can use this HMAC pattern.",
    sample: {
      body,
      signaturePreview: `${signature.slice(0, 18)}...${signature.slice(-8)}`,
      timestamp
    }
  });
}
