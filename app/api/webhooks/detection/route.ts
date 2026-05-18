import { PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { usesSeedTokenPlaceholder } from "@/lib/cron/scheduler";
import { prisma } from "@/lib/db/prisma";
import { runDriveDetectionForPipeline } from "@/lib/detection/drive-detection";
import { verifyWebhookSignature } from "@/lib/security/webhook-signature";

export const dynamic = "force-dynamic";

interface DetectionWebhookPayload {
  driveFileId?: string;
  eventId?: string;
  pipelineId?: string;
  sourceFolderId?: string;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const auth = verifyWebhookSignature({
    body: rawBody,
    headers: request.headers,
    secret: process.env.DETECTION_WEBHOOK_SECRET || process.env.CRON_SECRET
  });

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let payload: DetectionWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as DetectionWebhookPayload;
  } catch {
    return NextResponse.json({ error: "InvalidWebhookPayload" }, { status: 400 });
  }

  if (!payload.pipelineId && !payload.sourceFolderId) {
    return NextResponse.json(
      { error: "MissingPipelineOrSourceFolder" },
      { status: 400 }
    );
  }

  const pipelines = await findWebhookPipelines(payload);
  if (!pipelines.length) {
    return NextResponse.json(
      {
        eventId: payload.eventId || null,
        ignored: true,
        reason: "NoEnabledPipelinesForWebhook",
        results: [],
        sourceFolderId: payload.sourceFolderId || null
      },
      { status: 202 }
    );
  }

  const results = [];
  let skippedSeedData = 0;

  for (const pipeline of pipelines) {
    if (usesSeedTokenPlaceholder(pipeline)) {
      skippedSeedData += 1;
      results.push({
        pipelineId: pipeline.id,
        pipelineName: pipeline.name,
        status: "skipped_seed_data"
      });
      continue;
    }

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

      await prisma.pipeline.update({
        data: { errorMessage: message },
        where: { id: pipeline.id }
      });
    }
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    driveFileId: payload.driveFileId || null,
    eventId: payload.eventId || null,
    matchedPipelines: pipelines.length,
    results,
    skippedSeedData,
    sourceFolderId: payload.sourceFolderId || pipelines[0]?.sourceFolderId || null
  });
}

async function findWebhookPipelines(payload: DetectionWebhookPayload) {
  const where = payload.pipelineId
    ? { archivedAt: null, id: payload.pipelineId, status: PipelineStatus.ENABLED }
    : {
        archivedAt: null,
        sourceFolderId: payload.sourceFolderId || "",
        status: PipelineStatus.ENABLED
      };

  return prisma.pipeline.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: {
      driveConnection: { select: { encryptedRefreshToken: true } },
      id: true,
      name: true,
      sourceFolderId: true,
      userId: true,
      youtubeConnection: { select: { encryptedRefreshToken: true } }
    },
    where
  });
}
