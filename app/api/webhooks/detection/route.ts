import { createHash } from "node:crypto";
import { PipelineStatus, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { usesSeedTokenPlaceholder } from "@/lib/cron/scheduler";
import { prisma } from "@/lib/db/prisma";
import { areGoogleIntegrationsPaused, googleIntegrationsPausedResponse } from "@/lib/google/integrations";
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
  if (areGoogleIntegrationsPaused()) {
    return googleIntegrationsPausedResponse();
  }

  const rawBody = await request.text();
  const auth = verifyWebhookSignature({
    body: rawBody,
    headers: request.headers,
    // Trust domains stay separate: detection webhooks must not be verifiable
    // with the cron secret. Operators who want unified trust must set both
    // env vars to the same value explicitly.
    secret: process.env.DETECTION_WEBHOOK_SECRET
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

  const replay = await reserveWebhookEvent({
    body: rawBody,
    eventId: payload.eventId,
    signature: request.headers.get("x-relayroom-signature"),
    timestamp: request.headers.get("x-relayroom-timestamp")
  });
  if (!replay.ok) {
    return NextResponse.json(
      {
        eventId: payload.eventId || null,
        ignored: true,
        reason: replay.reason
      },
      { status: 202 }
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

async function reserveWebhookEvent({
  body,
  eventId,
  signature,
  timestamp
}: {
  body: string;
  eventId?: string;
  signature: string | null;
  timestamp: string | null;
}) {
  const now = new Date();
  // Replay key falls back to the verified (timestamp, signature, body) tuple
  // when no eventId is supplied. Signature verification ran upstream, so
  // both timestamp and signature are guaranteed non-empty here — but assert
  // explicitly to avoid a constant key from any future refactor.
  let replayKey: string;
  if (eventId?.trim()) {
    replayKey = `event:${eventId.trim()}`;
  } else {
    if (!timestamp || !signature) {
      return { ok: false as const, reason: "MissingReplayKeyComponents" };
    }
    replayKey = `signature:${hashText(`${timestamp}.${signature}.${body}`)}`;
  }

  try {
    await prisma.$transaction([
      prisma.webhookEvent.deleteMany({
        where: { expiresAt: { lt: now } }
      }),
      prisma.webhookEvent.create({
        data: {
          eventId: eventId?.trim() || null,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
          replayKey,
          signatureHash: hashText(signature || "")
        }
      })
    ]);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, reason: "ReplayDetected" };
    }

    throw error;
  }
}

function hashText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
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
