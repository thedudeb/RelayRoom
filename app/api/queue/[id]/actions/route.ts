import { QueueStatus as PrismaQueueStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { getUsableYouTubeAccessToken } from "@/lib/detection/drive-detection";
import {
  createChannelPlaylist,
  verifyChannelPlaylist,
  type YouTubePlaylistRef
} from "@/lib/oauth/youtube-playlists";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";
import { uploadQueueItemToYouTube } from "@/lib/upload/youtube-upload";

type QueueActionBody = {
  action?: "skip" | "restore" | "mark_externally_handled" | "route" | "upload";
  playlistId?: string;
  playlistName?: string;
  // When supplied (and playlistId is absent), the route flow creates a new
  // playlist with this title on the pipeline's destination channel before
  // routing. SPEC §4.8 Edit-and-route.
  createPlaylistName?: string;
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
  const originError = rejectCrossSiteMutation(request);
  if (originError) {
    return originError;
  }

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
      await preparePlaylistRecovery({
        playlistId: body.playlistId,
        playlistName: body.playlistName,
        queueItemId: id,
        userId: access.userId
      });

      const currentItem = await prisma.queueItem.findFirst({
        where: { id, userId: access.userId },
        select: { status: true }
      });
      if (!currentItem) {
        return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
      }
      const trigger =
        currentItem.status === PrismaQueueStatus.NEEDS_APPROVAL ? "approve" : "retry";

      const result = await uploadQueueItemToYouTube({
        queueItemId: id,
        trigger,
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

  // For the "route" action, resolve the destination playlist via the YouTube
  // channel itself. This lifts the prior restriction that the playlist had
  // to already be referenced by a rule on the pipeline (SPEC §4.8: edit-
  // and-route may pick any playlist on the destination channel or create
  // one inline).
  let resolvedPlaylist: YouTubePlaylistRef | undefined;
  if (body.action === "route") {
    try {
      resolvedPlaylist = await resolveRoutePlaylist({
        body,
        youtubeConnectionId: item.pipeline.youtubeConnectionId,
        userId: access.userId
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "PlaylistResolutionFailed" },
        { status: 400 }
      );
    }
  }

  try {
    const update = getActionUpdate({
      action: body.action,
      currentStatus: item.status,
      hasUploadedVideoMissingPlaylist: Boolean(item.youtubeVideoId && !item.youtubePlaylistId),
      intendedPlaylistId: item.intendedPlaylistId,
      matchedRuleId: item.matchedRuleId,
      playlistId: resolvedPlaylist?.id ?? body.playlistId,
      playlistName: resolvedPlaylist?.name ?? body.playlistName,
      previousStatus: item.previousStatus,
      rules: item.pipeline.rules,
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

async function preparePlaylistRecovery({
  playlistId,
  playlistName,
  queueItemId,
  userId
}: {
  playlistId?: string;
  playlistName?: string;
  queueItemId: string;
  userId: string;
}) {
  if (!playlistId) {
    return;
  }

  const item = await prisma.queueItem.findFirst({
    where: {
      id: queueItemId,
      userId
    },
    include: {
      pipeline: {
        select: {
          youtubeConnectionId: true
        }
      }
    }
  });

  if (!item) {
    throw new Error("Queue item not found.");
  }

  const isRecoveringPlaylistAssignment =
    item.status === PrismaQueueStatus.FAILED && item.youtubeVideoId && !item.youtubePlaylistId;

  if (!isRecoveringPlaylistAssignment) {
    return;
  }

  const rules = await getManualRouteRules({
    playlistId,
    userId,
    youtubeConnectionId: item.pipeline.youtubeConnectionId
  });
  const selectedRule = rules.find((rule) => rule.youtubePlaylistId === playlistId);

  if (!selectedRule) {
    throw new Error("Choose a valid playlist for this pipeline.");
  }

  const now = new Date();
  const selectedPlaylistName = playlistName?.trim() || selectedRule.youtubePlaylistName;

  await prisma.$transaction([
    prisma.queueItem.update({
      where: { id: item.id },
      data: {
        failureReason: null,
        intendedPlaylistId: selectedRule.youtubePlaylistId,
        intendedPlaylistName: selectedPlaylistName,
        lastActionAt: now,
        lastError: null,
        matchedRuleId: null,
        matchedRuleName: "Manual route",
        previousStatus: item.status
      }
    }),
    prisma.activityLogEntry.create({
      data: {
        actorType: "user",
        message: `Selected ${selectedPlaylistName} for playlist recovery.`,
        metadata: {
          fromStatus: item.status,
          playlistId: selectedRule.youtubePlaylistId,
          playlistName: selectedPlaylistName,
          recoveredPlaylistAssignment: true,
          youtubeVideoId: item.youtubeVideoId
        },
        queueItemId: item.id,
        userId
      }
    })
  ]);
}

async function resolveRoutePlaylist({
  body,
  youtubeConnectionId,
  userId
}: {
  body: QueueActionBody;
  youtubeConnectionId: string;
  userId: string;
}): Promise<YouTubePlaylistRef | undefined> {
  const createTitle = body.createPlaylistName?.trim();
  if (!createTitle && !body.playlistId) {
    return undefined;
  }

  const connection = await prisma.oAuthConnection.findFirst({
    where: { id: youtubeConnectionId, userId },
    select: {
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      expiresAt: true,
      id: true,
      kind: true,
      status: true
    }
  });
  if (!connection) {
    throw new Error("YouTube connection not found for this pipeline.");
  }
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    throw new Error("MissingTokenKey");
  }
  const accessToken = await getUsableYouTubeAccessToken(connection, tokenKey);
  if (!accessToken) {
    throw new Error("YouTube token refresh failed. Reconnect the channel and try again.");
  }

  if (createTitle) {
    return createChannelPlaylist({ accessToken, title: createTitle });
  }

  const verified = await verifyChannelPlaylist({ accessToken, playlistId: body.playlistId! });
  if (!verified) {
    throw new Error("That playlist isn't owned by the pipeline's destination channel.");
  }
  return verified;
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
        archivedAt: null,
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
  hasUploadedVideoMissingPlaylist,
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
  hasUploadedVideoMissingPlaylist: boolean;
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
    const isRecoveringPlaylistAssignment =
      currentStatus === PrismaQueueStatus.FAILED && hasUploadedVideoMissingPlaylist;

    if (currentStatus !== PrismaQueueStatus.NEEDS_ROUTING && !isRecoveringPlaylistAssignment) {
      throw new Error(`Manual routing is not allowed from ${formatStatus(currentStatus)}.`);
    }

    // The upstream resolver guarantees playlistId/playlistName come from a
    // verified-on-channel playlist (or a freshly created one). We still
    // surface a friendly name from an existing rule if one happens to
    // reference the same playlist, so the activity log reads naturally.
    if (!playlistId || !playlistName) {
      throw new Error("Choose a playlist or enter a new playlist name.");
    }
    const knownRule = rules.find((rule) => rule.youtubePlaylistId === playlistId);
    const friendlyName = knownRule?.youtubePlaylistName || playlistName;

    return {
      data: {
        failureReason: null,
        intendedPlaylistId: playlistId,
        intendedPlaylistName: friendlyName,
        lastActionAt: now,
        lastError: null,
        matchedRuleId: null,
        matchedRuleName: "Manual route",
        previousStatus: currentStatus,
        status: PrismaQueueStatus.NEEDS_APPROVAL
      },
      message: isRecoveringPlaylistAssignment
        ? `Recovered playlist assignment to ${friendlyName}.`
        : `Routed item to ${friendlyName}.`,
      metadata: {
        fromStatus: currentStatus,
        recoveredPlaylistAssignment: isRecoveringPlaylistAssignment,
        playlistId,
        playlistName: friendlyName
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
        lastActionAt: now,
        // Clear externally-handled link state so a restored item can't be
        // mistaken for a real upload. The audit trail in activityLog +
        // uploadAttempts preserves the historical link for forensics.
        ...(currentStatus === PrismaQueueStatus.EXTERNALLY_HANDLED
          ? { youtubeUrl: null, youtubeVideoId: null }
          : {})
      },
      message: `Restored item to ${formatStatus(restoreStatus)}.`,
      metadata: { fromStatus: currentStatus, toStatus: restoreStatus }
    };
  }

  throw new Error("Unsupported queue action.");
}

const ALLOWED_YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be"
]);

function normalizeOptionalUrl(rawUrl?: string): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid YouTube URL, or leave the field blank.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("YouTube link must be an http(s) URL.");
  }
  // Lock the host to known YouTube domains so the "marked externally
  // handled" field can't be repurposed as a phishing link (ISSUE-041).
  if (!ALLOWED_YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("YouTube link must point to youtube.com, m.youtube.com, or youtu.be.");
  }

  return parsed.toString();
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
