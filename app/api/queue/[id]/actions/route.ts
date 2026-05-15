import { QueueStatus as PrismaQueueStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { uploadQueueItemToYouTube } from "@/lib/upload/youtube-upload";

type QueueActionBody = {
  action?: "skip" | "restore" | "mark_externally_handled" | "route" | "upload";
  playlistId?: string;
  playlistName?: string;
  youtubeUrl?: string;
};

const restorableStatuses = new Set<PrismaQueueStatus>([
  PrismaQueueStatus.NEEDS_ROUTING,
  PrismaQueueStatus.NEEDS_APPROVAL,
  PrismaQueueStatus.FAILED
]);

const manuallyClosableStatuses = new Set<PrismaQueueStatus>([
  PrismaQueueStatus.NEEDS_ROUTING,
  PrismaQueueStatus.NEEDS_APPROVAL,
  PrismaQueueStatus.FAILED
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await getApiAccess(request.nextUrl.searchParams);
  if (!access || access.isDemo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as QueueActionBody;
  if (!id || !body.action) {
    return NextResponse.json({ error: "Missing queue action." }, { status: 400 });
  }

  if (body.action === "upload") {
    try {
      const result = await uploadQueueItemToYouTube({
        queueItemId: id,
        userId: access.userId
      });

      revalidatePath("/dashboard");
      revalidatePath("/pipelines");
      return NextResponse.json(result);
    } catch (error) {
      revalidatePath("/dashboard");
      revalidatePath("/pipelines");
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "YouTube upload failed." },
        { status: 400 }
      );
    }
  }

  const item = await prisma.queueItem.findFirst({
    where: {
      id,
      userId: access.userId
    },
    include: {
      pipeline: {
        include: {
          rules: {
            orderBy: { priority: "asc" },
            select: {
              id: true,
              name: true,
              youtubePlaylistId: true,
              youtubePlaylistName: true
            }
          }
        }
      }
    }
  });

  if (!item) {
    return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
  }

  const now = new Date();
  const youtubeUrl = normalizeOptionalUrl(body.youtubeUrl);
  const routeRules =
    body.action === "route"
      ? await getManualRouteRules({
          playlistId: body.playlistId,
          userId: access.userId,
          youtubeConnectionId: item.pipeline.youtubeConnectionId
        })
      : item.pipeline.rules;

  try {
    const update = getActionUpdate({
      action: body.action,
      currentStatus: item.status,
      intendedPlaylistId: item.intendedPlaylistId,
      matchedRuleId: item.matchedRuleId,
      playlistId: body.playlistId,
      playlistName: body.playlistName,
      previousStatus: item.previousStatus,
      rules: routeRules.length ? routeRules : item.pipeline.rules,
      youtubeUrl,
      now
    });

    const updated = await prisma.$transaction(async (tx) => {
      const queueItem = await tx.queueItem.update({
        where: { id: item.id },
        data: update.data,
        select: {
          id: true,
          status: true,
          previousStatus: true,
          youtubeUrl: true,
          lastActionAt: true
        }
      });

      await tx.activityLogEntry.create({
        data: {
          userId: access.userId,
          queueItemId: item.id,
          actorType: "user",
          message: update.message,
          metadata: update.metadata
        }
      });

      return queueItem;
    });

    revalidatePath("/dashboard");
    revalidatePath("/pipelines");

    return NextResponse.json({
      item: {
        ...updated,
        status: updated.status.toLowerCase(),
        previousStatus: updated.previousStatus?.toLowerCase() || null,
        lastActionAt: updated.lastActionAt.toISOString()
      },
      message: update.message
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Queue action failed." },
      { status: 400 }
    );
  }
}

async function getManualRouteRules({
  playlistId,
  userId,
  youtubeConnectionId
}: {
  playlistId?: string;
  userId: string;
  youtubeConnectionId: string;
}) {
  if (!playlistId) {
    return [];
  }

  return prisma.rule.findMany({
    where: {
      youtubePlaylistId: playlistId,
      pipeline: {
        userId,
        youtubeConnectionId
      }
    },
    orderBy: { priority: "asc" },
    select: {
      id: true,
      name: true,
      youtubePlaylistId: true,
      youtubePlaylistName: true
    }
  });
}

function getActionUpdate({
  action,
  currentStatus,
  intendedPlaylistId,
  matchedRuleId,
  now,
  playlistId,
  playlistName,
  previousStatus,
  rules,
  youtubeUrl
}: {
  action: NonNullable<QueueActionBody["action"]>;
  currentStatus: PrismaQueueStatus;
  intendedPlaylistId: string | null;
  matchedRuleId: string | null;
  now: Date;
  playlistId?: string;
  playlistName?: string;
  previousStatus: PrismaQueueStatus | null;
  rules: Array<{
    id: string;
    name: string;
    youtubePlaylistId: string;
    youtubePlaylistName: string;
  }>;
  youtubeUrl?: string;
}) {
  if (action === "route") {
    if (currentStatus !== PrismaQueueStatus.NEEDS_ROUTING) {
      throw new Error(`Manual routing is not allowed from ${formatStatus(currentStatus)}.`);
    }

    const selectedRule = rules.find((rule) => rule.youtubePlaylistId === playlistId);
    if (!playlistId || !selectedRule) {
      throw new Error("Choose a valid playlist for this pipeline.");
    }

    return {
      data: {
        failureReason: null,
        intendedPlaylistId: selectedRule.youtubePlaylistId,
        intendedPlaylistName: playlistName?.trim() || selectedRule.youtubePlaylistName,
        lastActionAt: now,
        lastError: null,
        matchedRuleId: null,
        matchedRuleName: "Manual route",
        previousStatus: currentStatus,
        status: PrismaQueueStatus.NEEDS_APPROVAL
      },
      message: `Routed item to ${playlistName?.trim() || selectedRule.youtubePlaylistName}.`,
      metadata: {
        fromStatus: currentStatus,
        playlistId: selectedRule.youtubePlaylistId,
        playlistName: playlistName?.trim() || selectedRule.youtubePlaylistName
      }
    };
  }

  if (action === "skip") {
    if (!manuallyClosableStatuses.has(currentStatus)) {
      throw new Error(`Skip is not allowed from ${formatStatus(currentStatus)}.`);
    }

    return {
      data: {
        status: PrismaQueueStatus.SKIPPED,
        previousStatus: currentStatus,
        lastActionAt: now
      },
      message: "Skipped item.",
      metadata: { fromStatus: currentStatus }
    };
  }

  if (action === "mark_externally_handled") {
    if (!manuallyClosableStatuses.has(currentStatus)) {
      throw new Error(`Mark already uploaded is not allowed from ${formatStatus(currentStatus)}.`);
    }

    const youtubeVideoId = youtubeUrl ? extractYouTubeVideoId(youtubeUrl) : undefined;

    return {
      data: {
        status: PrismaQueueStatus.EXTERNALLY_HANDLED,
        previousStatus: currentStatus,
        youtubeUrl,
        youtubeVideoId,
        failureReason: null,
        lastError: null,
        lastActionAt: now
      },
      message: youtubeUrl
        ? "Marked item as already uploaded with a YouTube link."
        : "Marked item as already uploaded.",
      metadata: { fromStatus: currentStatus, youtubeUrl }
    };
  }

  if (action === "restore") {
    if (
      currentStatus !== PrismaQueueStatus.SKIPPED &&
      currentStatus !== PrismaQueueStatus.EXTERNALLY_HANDLED
    ) {
      throw new Error(`Restore is not allowed from ${formatStatus(currentStatus)}.`);
    }

    const restoreStatus =
      previousStatus && restorableStatuses.has(previousStatus)
        ? previousStatus
        : matchedRuleId || intendedPlaylistId
          ? PrismaQueueStatus.NEEDS_APPROVAL
          : PrismaQueueStatus.NEEDS_ROUTING;

    return {
      data: {
        status: restoreStatus,
        previousStatus: null,
        lastActionAt: now
      },
      message: `Restored item to ${formatStatus(restoreStatus)}.`,
      metadata: { fromStatus: currentStatus, toStatus: restoreStatus }
    };
  }

  throw new Error("Unsupported queue action.");
}

function normalizeOptionalUrl(rawUrl?: string): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;

  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error("Enter a valid YouTube URL, or leave the field blank.");
  }
}

function extractYouTubeVideoId(youtubeUrl: string): string | undefined {
  const url = new URL(youtubeUrl);
  if (url.hostname.includes("youtu.be")) {
    return url.pathname.split("/").filter(Boolean)[0];
  }

  if (url.hostname.includes("youtube.com")) {
    return url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).at(-1);
  }

  return undefined;
}

function formatStatus(status: PrismaQueueStatus): string {
  return status.toLowerCase().replaceAll("_", " ");
}
