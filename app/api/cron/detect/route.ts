import { PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { selectDuePipelines } from "@/lib/cron/scheduler";
import { runDriveDetectionForPipeline } from "@/lib/detection/drive-detection";

export const dynamic = "force-dynamic";

const DEFAULT_PIPELINE_LIMIT = 20;
const MAX_PIPELINE_LIMIT = 50;

export async function GET(request: NextRequest) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const now = new Date();
  const limit = pipelineLimit(request);
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

      await prisma.pipeline.update({
        data: { errorMessage: message },
        where: { id: pipeline.id }
      });
    }
  }

  return NextResponse.json({
    checkedAt: now.toISOString(),
    due: duePipelines.length,
    enabledPipelines: runnablePipelines.length,
    limit,
    results,
    skippedNotDue,
    skippedSeedData
  });
}

function authorizeCronRequest(request: NextRequest):
  | { ok: true }
  | { error: string; ok: false; status: number } {
  const expectedSecret = process.env.CRON_SECRET || process.env.DETECTION_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return { error: "MissingCronSecret", ok: false, status: 500 };
  }

  const authHeader = request.headers.get("authorization");
  const headerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const fallbackHeaderSecret = request.headers.get("x-relayroom-cron-secret") || "";
  const providedSecret = headerSecret || fallbackHeaderSecret;

  if (providedSecret !== expectedSecret) {
    return { error: "Unauthorized", ok: false, status: 401 };
  }

  return { ok: true };
}

function pipelineLimit(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") || DEFAULT_PIPELINE_LIMIT);

  if (!Number.isFinite(limit)) {
    return DEFAULT_PIPELINE_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_PIPELINE_LIMIT);
}
