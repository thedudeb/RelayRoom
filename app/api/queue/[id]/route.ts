import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import {
  getQueueItemsForDemo,
  getQueueItemsForUser
} from "@/lib/data/repository";
import { prisma } from "@/lib/db/prisma";
import type { QueueItem } from "@/lib/domain/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await getApiAccess(request.nextUrl.searchParams, request);

  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const ownerFilter =
    !access.isDemo && access.authMethod === "api_key" ? { userId: access.userId } : undefined;

  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId, ownerFilter);
  const item = queueItems.find((queueItem) => queueItem.id === id);
  if (!item) {
    return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
  }

  const evaluation = persistedEvaluationForItem(item);
  const details = access.isDemo ? getDemoQueueDetails(item) : await getQueueDetails(id, ownerFilter);

  return NextResponse.json({
    item,
    evaluation,
    ...details
  });
}

async function getQueueDetails(queueItemId: string, ownerFilter?: { userId: string }) {
  const [activityLog, attempts] = await Promise.all([
    prisma.activityLogEntry.findMany({
      where: {
        ...(ownerFilter ? { queueItem: ownerFilter } : {}),
        queueItemId
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        actorType: true,
        createdAt: true,
        message: true,
        metadata: true
      }
    }),
    prisma.uploadAttempt.findMany({
      where: {
        ...(ownerFilter ? { queueItem: ownerFilter } : {}),
        queueItemId
      },
      orderBy: { attemptNumber: "desc" },
      take: 8,
      select: {
        attemptNumber: true,
        failureReason: true,
        finishedAt: true,
        rawError: true,
        startedAt: true,
        success: true,
        youtubeVideoId: true
      }
    })
  ]);

  return {
    activityLog: activityLog.map((entry) => ({
      actor: entry.actorType,
      at: entry.createdAt.toISOString(),
      message: entry.message,
      metadata: entry.metadata
    })),
    attempts: attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      failureReason: attempt.failureReason?.toLowerCase(),
      finishedAt: attempt.finishedAt?.toISOString(),
      rawError: attempt.rawError,
      startedAt: attempt.startedAt.toISOString(),
      success: attempt.success,
      youtubeVideoId: attempt.youtubeVideoId
    }))
  };
}

function getDemoQueueDetails(item: Awaited<ReturnType<typeof getQueueItemsForDemo>>[number]) {
  const attempts =
    item.status === "failed"
      ? [
          {
            attemptNumber: 1,
            failureReason: item.failureReason,
            finishedAt: item.lastActionAt,
            rawError: item.lastError,
            startedAt: item.detectedAt,
            success: false,
            youtubeVideoId: item.youtubeVideoId
          }
        ]
      : item.status === "uploaded"
        ? [
            {
              attemptNumber: 1,
              finishedAt: item.lastActionAt,
              rawError: undefined,
              startedAt: item.detectedAt,
              success: true,
              youtubeVideoId: item.youtubeVideoId
            }
          ]
        : [];

  return {
    activityLog: [
      {
        actor: "system",
        at: item.detectedAt,
        message: "Detected file in watched Drive folder."
      },
      {
        actor: item.status === "externally_handled" ? "user" : "system",
        at: item.lastActionAt,
        message:
          item.status === "failed"
            ? item.lastError || "Upload failed."
            : `Current status: ${item.status.replaceAll("_", " ")}.`
      }
    ],
    attempts
  };
}

function persistedEvaluationForItem(item: QueueItem) {
  if (!item.ruleEvaluationTrace) {
    return undefined;
  }

  return {
    description: item.renderedDescription || "",
    matchedRule:
      item.matchedRuleId && item.matchedRuleName
        ? { id: item.matchedRuleId, name: item.matchedRuleName }
        : undefined,
    playlist:
      item.intendedPlaylistId && item.intendedPlaylistName
        ? { id: item.intendedPlaylistId, name: item.intendedPlaylistName }
        : undefined,
    ruleTraces: item.ruleEvaluationTrace,
    title: item.renderedTitle || item.filename
  };
}
