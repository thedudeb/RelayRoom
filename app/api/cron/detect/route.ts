import { PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { selectDuePipelines } from "@/lib/cron/scheduler";
import { runDriveDetectionForPipeline } from "@/lib/detection/drive-detection";
import { renewDriveWatchSubscriptions } from "@/lib/drive/renewal";
import { authorizeCronRequest } from "@/lib/security/cron-auth";
import { reapStaleUploads } from "@/lib/upload/youtube-upload";

// Detection cron entry point. Invoked on a schedule (Vercel Cron) to poll every
// enabled pipeline's Drive folder for new files and enqueue them. Each tick also
// performs housekeeping: reaping stale in-flight uploads and renewing Drive
// push-notification watches before they expire.

// force-dynamic: never cache — this must run fresh on every cron invocation.
export const dynamic = "force-dynamic";

const DEFAULT_PIPELINE_LIMIT = 20;
const MAX_PIPELINE_LIMIT = 50;

export async function GET(request: NextRequest) {
  // Reject anything without the shared cron secret before touching the DB.
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const limit = pipelineLimit(request);
  // Housekeeping that runs every tick regardless of which pipelines are due.
  const reapResult = await reapStaleUploads();
  const renewalResult = await renewDriveWatchSubscriptions({
    webhookUrl:
      process.env.DRIVE_WATCH_WEBHOOK_URL || `${request.nextUrl.origin}/api/webhooks/drive`
  });
  const pipelines = await prisma.pipeline.findMany({
    orderBy: [{ lastDetectionAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      driveConnection: { select: { encryptedRefreshToken: true } },
      lastDetectionAt: true,
      name: true,
      pollingIntervalMinutes: true,
      userId: true,
      youtubeConnection: { select: { encryptedRefreshToken: true } }
    },
    where: { archivedAt: null, status: PipelineStatus.ENABLED }
  });
  const { duePipelines, runnablePipelines, skippedNotDue, skippedSeedData } =
    selectDuePipelines(pipelines, now, limit);
  const results = [];

  // Run pipelines sequentially rather than in parallel to keep load on the
  // Google APIs predictable and stay within per-tick quota. One pipeline's
  // failure is isolated and recorded; it doesn't abort the rest.
  for (const pipeline of duePipelines) {
    try {
      const result = await runDriveDetectionForPipeline({
        pipelineId: pipeline.id,
        userId: pipeline.userId
      });

      results.push({
        created: result.created,
        excludedByWatermark: result.excludedByWatermark,
        ignored: result.ignored,
        ignoredFiles: result.ignoredFiles,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        skippedExisting: result.skippedExisting,
        status: "ok"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "DetectionFailed";
      results.push({
        error: message,
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        status: "failed"
      });

      // Persist the failure on the pipeline so it surfaces in the UI rather
      // than being lost when this response is discarded.
      await prisma.pipeline.update({
        data: { errorMessage: message },
        where: { id: pipeline.id }
      });
    }
  }

  // Echo back a per-pipeline + aggregate summary; the cron platform logs this
  // body, making it the primary observability surface for detection runs.
  return NextResponse.json({
    checkedAt: now.toISOString(),
    due: duePipelines.length,
    enabledPipelines: runnablePipelines.length,
    limit,
    reapedStaleUploads: reapResult.reaped,
    results,
    renewedDriveWatches: renewalResult.renewed,
    renewalFailures: renewalResult.failed,
    skippedNotDue,
    skippedSeedData
  });
}

// Parses an optional ?limit override, clamping to [1, MAX] and falling back to
// the default on garbage input so the per-tick batch size is always sane.
function pipelineLimit(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_PIPELINE_LIMIT);

  if (!Number.isFinite(limit)) {
    return DEFAULT_PIPELINE_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_PIPELINE_LIMIT);
}
