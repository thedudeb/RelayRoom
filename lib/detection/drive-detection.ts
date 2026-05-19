import {
  ConnectionKind,
  ConnectionStatus,
  FailureReason,
  PipelineMode,
  PipelineStatus,
  Prisma,
  QueueStatus
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { DriveFileMetadata, Pipeline } from "@/lib/domain/types";
import { markConnectionRefreshFailed } from "@/lib/oauth/connection-health";
import { logGoogleApiError } from "@/lib/oauth/google-errors";
import { evaluatePipelineRules } from "@/lib/rules/rule-engine";
import { decryptToken, encryptToken } from "@/lib/security/token-vault";
import { uploadQueueItemToYouTube } from "@/lib/upload/youtube-upload";
import {
  describeUnsupportedVideoFile,
  isYouTubeSupportedVideoFile
} from "./youtube-supported-formats";

interface DriveFile {
  createdTime?: string;
  id?: string;
  mimeType?: string;
  name?: string;
  size?: string;
}

interface DriveFilesResponse {
  error?: {
    message?: string;
  };
  files?: DriveFile[];
  nextPageToken?: string;
}

interface GoogleRefreshResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface YouTubeVideosListResponse {
  items?: Array<{ id?: string }>;
}

export interface DetectionResult {
  created: number;
  excludedByWatermark: number;
  ignored: number;
  ignoredFiles: DetectionIgnoredFile[];
  skippedExisting: number;
}

export interface DriveFolderProbeFile {
  createdTime?: string;
  id?: string;
  mimeType?: string;
  name?: string;
  size?: string;
}

export interface DetectionIgnoredFile {
  filename: string;
  mimeType: string;
  reason: string;
}

export async function runDriveDetectionForPipeline({
  pipelineId,
  userId
}: {
  pipelineId: string;
  userId: string;
}): Promise<DetectionResult> {
  const pipeline = await prisma.pipeline.findFirst({
    where: {
      archivedAt: null,
      id: pipelineId,
      userId
    },
    include: {
      driveConnection: true,
      rules: { orderBy: { priority: "asc" } },
      user: { select: { timezone: true } },
      youtubeConnection: true
    }
  });

  if (!pipeline) {
    throw new Error("PipelineNotFound");
  }

  if (pipeline.status !== PipelineStatus.ENABLED) {
    throw new Error("PipelineNotEnabled");
  }

  if (
    pipeline.driveConnection.kind !== ConnectionKind.DRIVE ||
    pipeline.driveConnection.status !== ConnectionStatus.ACTIVE
  ) {
    throw new Error("MissingActiveDriveConnection");
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    throw new Error("MissingTokenKey");
  }

  const accessToken = await getUsableDriveAccessToken(pipeline.driveConnection, tokenKey);
  if (!accessToken) {
    throw new Error("TokenRefreshFailed");
  }

  const watermark = pipeline.processedFromTime || pipeline.createdAt;
  const folderSnapshot = await listDriveFolderFiles({
    accessToken,
    folderId: pipeline.sourceFolderId
  });
  const excludedByWatermark = folderSnapshot.filter((file) => {
    if (
      !file.createdTime ||
      !isYouTubeSupportedVideoFile({ filename: file.name, mimeType: file.mimeType })
    ) {
      return false;
    }

    return new Date(file.createdTime) <= watermark;
  }).length;
  const files = await listDriveFolderFiles({
    accessToken,
    folderId: pipeline.sourceFolderId,
    newerThan: watermark
  });
  const driveFileIds = files.flatMap((file) => (file.id ? [file.id] : []));
  const existingItems = driveFileIds.length
    ? await prisma.queueItem.findMany({
        where: {
          driveFileId: { in: driveFileIds },
          pipelineId: pipeline.id
        },
        select: {
          driveFileId: true,
          id: true,
          status: true,
          youtubeVideoId: true
        }
      })
    : [];
  const existingByDriveFileId = new Map(existingItems.map((item) => [item.driveFileId, item]));

  let created = 0;
  let ignored = 0;
  const ignoredFiles: DetectionIgnoredFile[] = [];
  let skippedExisting = 0;
  const domainPipeline = mapPipelineForEvaluation(pipeline);
  const timezone = pipeline.user.timezone || "UTC";

  for (const file of files) {
    if (!file.id || !file.name || !file.mimeType || !file.createdTime) {
      ignored += 1;
      ignoredFiles.push({
        filename: file.name || file.id || "Untitled Drive file",
        mimeType: file.mimeType || "unknown",
        reason: "Drive did not return the id, name, MIME type, and created time needed for detection."
      });
      continue;
    }

    const existingItem = existingByDriveFileId.get(file.id);
    if (existingItem) {
      const reprocessed = await maybeReprocessExistingUpload({
        domainPipeline,
        existingItem,
        file,
        pipeline,
        tokenKey,
        timezone,
        userId
      });
      if (!reprocessed) {
        skippedExisting += 1;
      }
      existingByDriveFileId.set(file.id, existingItem);
      continue;
    }

    if (!isYouTubeSupportedVideoFile({ filename: file.name, mimeType: file.mimeType })) {
      ignored += 1;
      ignoredFiles.push({
        filename: file.name,
        mimeType: file.mimeType,
        reason: describeUnsupportedVideoFile({ filename: file.name, mimeType: file.mimeType })
      });
      continue;
    }

    const fileMetadata: DriveFileMetadata = {
      createdTime: file.createdTime,
      filename: file.name,
      id: file.id,
      mimeType: file.mimeType,
      sizeBytes: file.size ? Number(file.size) : undefined,
      sourceFolderId: pipeline.sourceFolderId
    };
    const evaluation = evaluatePipelineRules(domainPipeline, fileMetadata, timezone);
    const status = evaluation.playlist
      ? pipeline.mode === PipelineMode.MANUAL_APPROVAL
        ? QueueStatus.NEEDS_APPROVAL
        : QueueStatus.DETECTED
      : QueueStatus.NEEDS_ROUTING;

    try {
      const queueItem = await prisma.queueItem.create({
        data: {
          detectedAt: new Date(),
          driveCreatedTime: new Date(file.createdTime),
          driveFileId: file.id,
          failureReason: evaluation.playlist ? null : FailureReason.VALIDATION_ERROR,
          filename: file.name,
          intendedPlaylistId: evaluation.playlist?.id,
          intendedPlaylistName: evaluation.playlist?.name,
          lastActionAt: new Date(),
          lastError: evaluation.playlist ? null : "No routing rule matched this file.",
          matchedRuleId: evaluation.matchedRule?.id,
          matchedRuleName: evaluation.matchedRule?.name,
          mimeType: file.mimeType,
          pipelineId: pipeline.id,
          renderedDescription: evaluation.description,
          renderedTitle: evaluation.title,
          ruleEvaluationTrace: stripUndefined(evaluation.ruleTraces),
          sizeBytes: file.size ? BigInt(file.size) : undefined,
          status,
          userId
        },
        select: { id: true }
      });
      existingByDriveFileId.set(file.id, {
        driveFileId: file.id,
        id: queueItem.id,
        status,
        youtubeVideoId: null
      });
      created += 1;

      if (status === QueueStatus.DETECTED) {
        await uploadAutoQueueItem(queueItem.id, userId);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        existingByDriveFileId.set(file.id, {
          driveFileId: file.id,
          id: "",
          status,
          youtubeVideoId: null
        });
        skippedExisting += 1;
        continue;
      }

      throw error;
    }
  }

  await prisma.pipeline.update({
    where: { id: pipeline.id },
    data: { lastDetectionAt: new Date() }
  });

  return { created, excludedByWatermark, ignored, ignoredFiles, skippedExisting };
}

async function maybeReprocessExistingUpload({
  domainPipeline,
  existingItem,
  file,
  pipeline,
  tokenKey,
  timezone,
  userId
}: {
  domainPipeline: Pipeline;
  existingItem: {
    driveFileId: string;
    id: string;
    status: QueueStatus;
    youtubeVideoId: string | null;
  };
  file: DriveFile;
  pipeline: Prisma.PipelineGetPayload<{
    include: {
      driveConnection: true;
      rules: { orderBy: { priority: "asc" } };
      user: { select: { timezone: true } };
      youtubeConnection: true;
    };
  }>;
  tokenKey: string;
  timezone: string;
  userId: string;
}) {
  if (existingItem.status !== QueueStatus.UPLOADED || !existingItem.youtubeVideoId) {
    return false;
  }

  const youtubeAccessToken = await getUsableYouTubeAccessToken(pipeline.youtubeConnection, tokenKey);
  if (!youtubeAccessToken) {
    throw new Error("TokenRefreshFailed");
  }

  const videoExists = await verifyYouTubeVideoExists({
    accessToken: youtubeAccessToken,
    videoId: existingItem.youtubeVideoId
  });
  if (videoExists) {
    await prisma.activityLogEntry.create({
      data: {
        actorType: "system",
        message: "Verified duplicate detection against YouTube; existing upload is still present.",
        metadata: { youtubeVideoId: existingItem.youtubeVideoId },
        queueItemId: existingItem.id,
        userId
      }
    });
    return false;
  }

  if (!file.id || !file.name || !file.mimeType || !file.createdTime) {
    return false;
  }

  const fileMetadata: DriveFileMetadata = {
    createdTime: file.createdTime,
    filename: file.name,
    id: file.id,
    mimeType: file.mimeType,
    sizeBytes: file.size ? Number(file.size) : undefined,
    sourceFolderId: pipeline.sourceFolderId
  };
  const evaluation = evaluatePipelineRules(domainPipeline, fileMetadata, timezone);
  const status = evaluation.playlist
    ? pipeline.mode === PipelineMode.MANUAL_APPROVAL
      ? QueueStatus.NEEDS_APPROVAL
      : QueueStatus.DETECTED
    : QueueStatus.NEEDS_ROUTING;

  await prisma.$transaction([
    prisma.queueItem.update({
      where: { id: existingItem.id },
      data: {
        detectedAt: new Date(),
        failureReason: evaluation.playlist ? null : FailureReason.VALIDATION_ERROR,
        intendedPlaylistId: evaluation.playlist?.id,
        intendedPlaylistName: evaluation.playlist?.name,
        lastActionAt: new Date(),
        lastError: evaluation.playlist ? null : "No routing rule matched this file.",
        matchedRuleId: evaluation.matchedRule?.id,
        matchedRuleName: evaluation.matchedRule?.name,
        previousStatus: existingItem.status,
        renderedDescription: evaluation.description,
        renderedTitle: evaluation.title,
        ruleEvaluationTrace: stripUndefined(evaluation.ruleTraces),
        status,
        uploadedAt: null,
        youtubePlaylistId: null,
        youtubeUrl: null,
        youtubeVideoId: null
      }
    }),
    prisma.activityLogEntry.create({
      data: {
        actorType: "system",
        message: "Stored YouTube upload was missing; reprocessed this Drive file in place.",
        metadata: { previousYoutubeVideoId: existingItem.youtubeVideoId },
        queueItemId: existingItem.id,
        userId
      }
    })
  ]);

  if (status === QueueStatus.DETECTED) {
    await uploadAutoQueueItem(existingItem.id, userId);
  }

  return true;
}

async function uploadAutoQueueItem(queueItemId: string, userId: string) {
  try {
    await uploadQueueItemToYouTube({ queueItemId, userId });
  } catch {
    // uploadQueueItemToYouTube persists the failed state and attempt history.
  }
}

export async function probeDriveFolderForPipeline({
  pipelineId,
  userId
}: {
  pipelineId: string;
  userId: string;
}) {
  const pipeline = await prisma.pipeline.findFirst({
    where: {
      archivedAt: null,
      id: pipelineId,
      userId
    },
    include: {
      driveConnection: true
    }
  });

  if (!pipeline) {
    throw new Error("PipelineNotFound");
  }

  if (
    pipeline.driveConnection.kind !== ConnectionKind.DRIVE ||
    pipeline.driveConnection.status !== ConnectionStatus.ACTIVE
  ) {
    throw new Error("MissingActiveDriveConnection");
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    throw new Error("MissingTokenKey");
  }

  const accessToken = await getUsableDriveAccessToken(pipeline.driveConnection, tokenKey);
  if (!accessToken) {
    throw new Error("TokenRefreshFailed");
  }

  const files = await listDriveFolderFiles({
    accessToken,
    folderId: pipeline.sourceFolderId,
    limit: 10
  });

  return {
    files,
    folderId: pipeline.sourceFolderId,
    folderName: pipeline.sourceFolderName,
    processedFromTime: pipeline.processedFromTime
  };
}

async function listDriveFolderFiles({
  accessToken,
  folderId,
  limit,
  newerThan
}: {
  accessToken: string;
  folderId: string;
  limit?: number;
  newerThan?: Date;
}) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set(
      "fields",
      "nextPageToken,files(id,name,mimeType,size,createdTime)"
    );
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("orderBy", "createdTime desc");
    url.searchParams.set("pageSize", String(limit || 100));
    const queryParts = [`'${escapeDriveQueryValue(folderId)}' in parents`, "trashed = false"];
    if (newerThan) {
      queryParts.push(`createdTime > '${newerThan.toISOString()}'`);
    }
    url.searchParams.set("q", queryParts.join(" and "));
    url.searchParams.set("supportsAllDrives", "true");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = (await response.json()) as DriveFilesResponse;

    if (!response.ok || payload.error) {
      logGoogleApiError("Drive detection list failed.", response, payload);
      throw new Error("DriveListFailed");
    }

    files.push(...(payload.files || []));
    if (limit && files.length >= limit) {
      return files.slice(0, limit);
    }
    pageToken = payload.nextPageToken;
  } while (pageToken);

  return files;
}

export async function getUsableDriveAccessToken(
  connection: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string;
    expiresAt: Date | null;
    id: string;
  },
  tokenKey: string
) {
  if (
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(connection.encryptedAccessToken, tokenKey);
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken, tokenKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = (await response.json()) as GoogleRefreshResponse;

  if (!response.ok || !payload.access_token || payload.error) {
    logGoogleApiError("Drive token refresh failed.", response, payload);
    await markConnectionRefreshFailed({
      connectionId: connection.id,
      kind: ConnectionKind.DRIVE,
      message: "Google Drive token refresh failed. Reconnect Drive and enable affected pipelines."
    });
    return null;
  }

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptToken(payload.access_token, tokenKey),
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : connection.expiresAt
    }
  });

  return payload.access_token;
}

async function getUsableYouTubeAccessToken(
  connection: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string;
    expiresAt: Date | null;
    id: string;
    kind: ConnectionKind;
    status: ConnectionStatus;
  },
  tokenKey: string
) {
  if (connection.kind !== ConnectionKind.YOUTUBE || connection.status !== ConnectionStatus.ACTIVE) {
    return null;
  }

  if (
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(connection.encryptedAccessToken, tokenKey);
  }

  const clientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken, tokenKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = (await response.json()) as GoogleRefreshResponse;

  if (!response.ok || !payload.access_token || payload.error) {
    logGoogleApiError("YouTube token refresh failed.", response, payload);
    await markConnectionRefreshFailed({
      connectionId: connection.id,
      kind: ConnectionKind.YOUTUBE,
      message: "YouTube token refresh failed. Reconnect YouTube and enable affected pipelines."
    });
    return null;
  }

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptToken(payload.access_token, tokenKey),
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : connection.expiresAt
    }
  });

  return payload.access_token;
}

async function verifyYouTubeVideoExists({
  accessToken,
  videoId
}: {
  accessToken: string;
  videoId: string;
}) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  url.searchParams.set("part", "id");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as YouTubeVideosListResponse;

  if (!response.ok) {
    logGoogleApiError("YouTube duplicate verification failed.", response, payload);
    throw new Error("YouTubeVerificationFailed");
  }

  return Boolean(payload.items?.some((item) => item.id === videoId));
}

function mapPipelineForEvaluation(
  pipeline: Prisma.PipelineGetPayload<{
    include: { rules: { orderBy: { priority: "asc" } } };
  }>
): Pipeline {
  return {
    defaultDescriptionTemplate: pipeline.defaultDescriptionTemplate,
    defaultTitleTemplate: pipeline.defaultTitleTemplate,
    destinationChannelName: pipeline.destinationChannelName,
    driveConnectionId: pipeline.driveConnectionId,
    id: pipeline.id,
    lastDetectionAt: pipeline.lastDetectionAt?.toISOString(),
    mode: pipeline.mode.toLowerCase() as Pipeline["mode"],
    name: pipeline.name,
    owner: {
      email: "",
      id: pipeline.userId
    },
    pollingIntervalMinutes: pipeline.pollingIntervalMinutes,
    privacyStatus: pipeline.privacyStatus.toLowerCase() as Pipeline["privacyStatus"],
    processedFromTime: pipeline.processedFromTime?.toISOString() || "",
    rules: pipeline.rules.map((rule) => ({
      conditions: rule.conditionTree as unknown as Pipeline["rules"][number]["conditions"],
      descriptionTemplate: rule.descriptionTemplateOverride || undefined,
      id: rule.id,
      name: rule.name,
      playlist: {
        id: rule.youtubePlaylistId,
        name: rule.youtubePlaylistName
      },
      priority: rule.priority,
      titleTemplate: rule.titleTemplateOverride || undefined
    })),
    sourceFolderId: pipeline.sourceFolderId,
    sourceFolderName: pipeline.sourceFolderName,
    status: pipeline.status.toLowerCase() as Pipeline["status"],
    youtubeConnectionId: pipeline.youtubeConnectionId
  };
}

function stripUndefined(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function escapeDriveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
