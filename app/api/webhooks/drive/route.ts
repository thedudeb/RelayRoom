import { PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { safeEqualText } from "@/lib/security/webhook-signature";

export const dynamic = "force-dynamic";

// Drive push notification receiver. Per SPEC §4.5 we verify
// X-Goog-Channel-Token against the value we stored at subscribe time so
// random callers can't fabricate detection events. The notification body
// is empty; the headers carry channel id and resource state.
//
// We don't run detection inline — we just flip the pipeline to "due now"
// by clearing lastDetectionAt, and the cron worker picks it up on the next
// tick. Keeps the webhook fast (Google retries on slow responses) and lets
// the existing rate/quota logic apply uniformly to push and poll alike.
export async function POST(request: NextRequest) {
  const channelId = request.headers.get("x-goog-channel-id");
  const channelToken = request.headers.get("x-goog-channel-token") || "";
  const resourceState = request.headers.get("x-goog-resource-state");

  if (!channelId) {
    return NextResponse.json({ error: "MissingChannelId" }, { status: 400 });
  }

  // Drive's first message on a fresh subscription is a "sync" handshake.
  // Acknowledge and ignore — there's no actual file event yet.
  if (resourceState === "sync") {
    return NextResponse.json({ ok: true, ignored: "sync" });
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: { driveChannelId: channelId },
    select: {
      id: true,
      driveChannelToken: true,
      status: true,
      archivedAt: true
    }
  });

  if (!pipeline) {
    // Unknown channel id — either a stale subscription or a forgery. 404
    // signals Google to stop sending, which is the desired outcome for
    // both legitimate-stale and malicious cases.
    return NextResponse.json({ error: "UnknownChannel" }, { status: 404 });
  }

  if (!pipeline.driveChannelToken || !safeEqualText(channelToken, pipeline.driveChannelToken)) {
    return NextResponse.json({ error: "InvalidChannelToken" }, { status: 401 });
  }

  if (pipeline.archivedAt || pipeline.status !== PipelineStatus.ENABLED) {
    // Pipeline disabled or archived since the channel was created. Ack so
    // Google stops retrying; a separate code path stops the channel.
    return NextResponse.json({ ok: true, ignored: "pipeline-inactive" });
  }

  // Mark the pipeline due for the next worker tick. The cron worker reads
  // ENABLED pipelines ordered by lastDetectionAt asc, so nulling this
  // promotes the pipeline to the head of the queue.
  await prisma.pipeline.update({
    where: { id: pipeline.id },
    data: { lastDetectionAt: null }
  });

  return NextResponse.json({ ok: true, scheduled: true });
}
