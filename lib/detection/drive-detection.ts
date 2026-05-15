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
import { evaluatePipelineRules } from "@/lib/rules/rule-engine";
import { decryptToken, encryptToken } from "@/lib/security/token-vault";

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

export interface DetectionResult {
  created: number;
  excludedByWatermark: number;
  ignored: number;
  skippedExisting: number;
}

export interface DriveFolderProbeFile {
  createdTime?: string;
  id?: string;
  mimeType?: string;
  name?: string;
  size?: string;
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
      id: pipelineId,
      userId
    },
    include: {
      driveConnection: true,
      rules: { orderBy: { priority: "asc" } },
      user: { select: { timezone: true } }
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
    if (!file.createdTime || !file.mimeType?.startsWith("video/")) {
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
        select: { driveFileId: true }
      })
    : [];
  const existingIds = new Set(existingItems.map((item) => item.driveFileId));

  let created = 0;
  let ignored = 0;
  let skippedExisting = 0;
  const domainPipeline = mapPipelineForEvaluation(pipeline);
  const timezone = pipeline.user.timezone || "UTC";

  for (const file of files) {
    if (!file.id || !file.name || !file.mimeType || !file.createdTime) {
      ignored += 1;
      continue;
    }

    if (existingIds.has(file.id)) {
      skippedExisting += 1;
      continue;
    }

    if (!file.mimeType.startsWith("video/")) {
      ignored += 1;
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

    await prisma.queueItem.create({
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
      }
    });
    existingIds.add(file.id);
    created += 1;
  }

  await prisma.pipeline.update({
    where: { id: pipeline.id },
    data: { lastDetectionAt: new Date() }
  });

  return { created, excludedByWatermark, ignored, skippedExisting };
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
      console.error("Drive detection list failed.", payload);
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

async function getUsableDriveAccessToken(
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
    console.error("Drive token refresh failed.", payload);
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
