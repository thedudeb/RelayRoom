import {
  ConnectionKind as DbConnectionKind,
  ConnectionStatus as DbConnectionStatus,
  FailureReason as DbFailureReason,
  PipelineMode as DbPipelineMode,
  PipelineStatus as DbPipelineStatus,
  Prisma,
  PrismaClient,
  PrivacyStatus as DbPrivacyStatus,
  QueueStatus as DbQueueStatus
} from "@prisma/client";
import { demoConnections, demoPipelines, demoQueueItems } from "../lib/data/seed";
import type {
  ConnectionKind,
  ConnectionStatus,
  FailureReason,
  PipelineMode,
  PipelineStatus,
  PrivacyStatus,
  QueueItem,
  QueueStatus
} from "../lib/domain/types";

const prisma = new PrismaClient();
const demoUserId = "user-demo-relayroom";
const demoUserEmail = "demo@relayroom.local";

const connectionKindMap: Record<ConnectionKind, DbConnectionKind> = {
  drive: DbConnectionKind.DRIVE,
  youtube: DbConnectionKind.YOUTUBE
};

const connectionStatusMap: Record<ConnectionStatus, DbConnectionStatus> = {
  active: DbConnectionStatus.ACTIVE,
  expired: DbConnectionStatus.EXPIRED,
  errored: DbConnectionStatus.ERRORED
};

const pipelineModeMap: Record<PipelineMode, DbPipelineMode> = {
  auto: DbPipelineMode.AUTO,
  manual_approval: DbPipelineMode.MANUAL_APPROVAL
};

const pipelineStatusMap: Record<PipelineStatus, DbPipelineStatus> = {
  enabled: DbPipelineStatus.ENABLED,
  disabled: DbPipelineStatus.DISABLED,
  errored: DbPipelineStatus.ERRORED
};

const privacyStatusMap: Record<PrivacyStatus, DbPrivacyStatus> = {
  unlisted: DbPrivacyStatus.UNLISTED,
  public: DbPrivacyStatus.PUBLIC
};

const queueStatusMap: Record<QueueStatus, DbQueueStatus> = {
  detected: DbQueueStatus.DETECTED,
  needs_routing: DbQueueStatus.NEEDS_ROUTING,
  needs_approval: DbQueueStatus.NEEDS_APPROVAL,
  uploading: DbQueueStatus.UPLOADING,
  uploaded: DbQueueStatus.UPLOADED,
  failed: DbQueueStatus.FAILED,
  skipped: DbQueueStatus.SKIPPED,
  externally_handled: DbQueueStatus.EXTERNALLY_HANDLED
};

const failureReasonMap: Record<FailureReason, DbFailureReason> = {
  quota_exceeded: DbFailureReason.QUOTA_EXCEEDED,
  auth_revoked: DbFailureReason.AUTH_REVOKED,
  playlist_deleted: DbFailureReason.PLAYLIST_DELETED,
  file_not_found: DbFailureReason.FILE_NOT_FOUND,
  file_too_large: DbFailureReason.FILE_TOO_LARGE,
  not_video: DbFailureReason.NOT_VIDEO,
  rate_limited: DbFailureReason.RATE_LIMITED,
  network_timeout: DbFailureReason.NETWORK_TIMEOUT,
  validation_error: DbFailureReason.VALIDATION_ERROR,
  unknown: DbFailureReason.UNKNOWN
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set. Skipping database seed.");
    return;
  }

  const user = await prisma.user.upsert({
    where: { email: demoUserEmail },
    update: {
      name: "RelayRoom Demo Operator",
      timezone: "America/Halifax"
    },
    create: {
      id: demoUserId,
      email: demoUserEmail,
      name: "RelayRoom Demo Operator",
      timezone: "America/Halifax"
    }
  });

  for (const connection of demoConnections) {
    await prisma.oAuthConnection.upsert({
      where: { id: connection.id },
      update: {
        label: connection.label,
        accountEmail: connection.accountEmail,
        scopes: connection.scopes,
        status: connectionStatusMap[connection.status],
        connectedAt: new Date(connection.connectedAt)
      },
      create: {
        id: connection.id,
        userId: user.id,
        kind: connectionKindMap[connection.kind],
        label: connection.label,
        accountEmail: connection.accountEmail,
        channelName: connection.kind === "youtube" ? connection.label : undefined,
        encryptedRefreshToken: "seed-token-placeholder",
        scopes: connection.scopes,
        status: connectionStatusMap[connection.status],
        connectedAt: new Date(connection.connectedAt)
      }
    });
  }

  for (const pipeline of demoPipelines) {
    await prisma.pipeline.upsert({
      where: { id: pipeline.id },
      update: {
        name: pipeline.name,
        sourceFolderId: pipeline.sourceFolderId,
        sourceFolderName: pipeline.sourceFolderName,
        destinationChannelName: pipeline.destinationChannelName,
        mode: pipelineModeMap[pipeline.mode],
        status: pipelineStatusMap[pipeline.status],
        privacyStatus: privacyStatusMap[pipeline.privacyStatus],
        processedFromTime: new Date(pipeline.processedFromTime),
        lastDetectionAt: pipeline.lastDetectionAt ? new Date(pipeline.lastDetectionAt) : undefined,
        defaultTitleTemplate: pipeline.defaultTitleTemplate,
        defaultDescriptionTemplate: pipeline.defaultDescriptionTemplate
      },
      create: {
        id: pipeline.id,
        userId: user.id,
        name: pipeline.name,
        driveConnectionId: pipeline.driveConnectionId,
        youtubeConnectionId: pipeline.youtubeConnectionId,
        sourceFolderId: pipeline.sourceFolderId,
        sourceFolderName: pipeline.sourceFolderName,
        destinationChannelName: pipeline.destinationChannelName,
        mode: pipelineModeMap[pipeline.mode],
        status: pipelineStatusMap[pipeline.status],
        privacyStatus: privacyStatusMap[pipeline.privacyStatus],
        processedFromTime: new Date(pipeline.processedFromTime),
        lastDetectionAt: pipeline.lastDetectionAt ? new Date(pipeline.lastDetectionAt) : undefined,
        defaultTitleTemplate: pipeline.defaultTitleTemplate,
        defaultDescriptionTemplate: pipeline.defaultDescriptionTemplate
      }
    });

    for (const rule of pipeline.rules) {
      await prisma.rule.upsert({
        where: { id: rule.id },
        update: {
          name: rule.name,
          priority: rule.priority,
          conditionTree: rule.conditions as unknown as Prisma.InputJsonValue,
          youtubePlaylistId: rule.playlist.id,
          youtubePlaylistName: rule.playlist.name,
          titleTemplateOverride: rule.titleTemplate,
          descriptionTemplateOverride: rule.descriptionTemplate
        },
        create: {
          id: rule.id,
          pipelineId: pipeline.id,
          name: rule.name,
          priority: rule.priority,
          conditionTree: rule.conditions as unknown as Prisma.InputJsonValue,
          youtubePlaylistId: rule.playlist.id,
          youtubePlaylistName: rule.playlist.name,
          titleTemplateOverride: rule.titleTemplate,
          descriptionTemplateOverride: rule.descriptionTemplate
        }
      });
    }
  }

  await prisma.activityLogEntry.deleteMany({
    where: { queueItemId: { in: demoQueueItems.map((item) => item.id) } }
  });

  for (const item of demoQueueItems) {
    await prisma.queueItem.upsert({
      where: {
        pipelineId_driveFileId: {
          pipelineId: item.pipelineId,
          driveFileId: item.driveFileId
        }
      },
      update: queueItemData(item, user.id),
      create: {
        id: item.id,
        ...queueItemData(item, user.id)
      }
    });

    await prisma.activityLogEntry.create({
      data: {
        userId: user.id,
        queueItemId: item.id,
        actorType: "system",
        message: `Seeded demo item as ${item.status}.`,
        metadata: { seed: true }
      }
    });
  }

  console.log("Seeded RelayRoom demo data.");
  console.log({
    user: demoUserEmail,
    connections: demoConnections.length,
    pipelines: demoPipelines.length,
    queueItems: demoQueueItems.length
  });
}

function queueItemData(item: QueueItem, userId: string) {
  return {
    userId,
    pipelineId: item.pipelineId,
    driveFileId: item.driveFileId,
    filename: item.filename,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes ? BigInt(item.sizeBytes) : undefined,
    driveCreatedTime: new Date(item.driveCreatedTime),
    detectedAt: new Date(item.detectedAt),
    status: queueStatusMap[item.status],
    previousStatus: item.previousStatus ? queueStatusMap[item.previousStatus] : undefined,
    matchedRuleName: item.matchedRuleName,
    intendedPlaylistName: item.intendedPlaylistName,
    renderedTitle: item.filename,
    renderedDescription: "Seeded RelayRoom demo queue item.",
    youtubeVideoId: item.youtubeVideoId,
    youtubePlaylistId: item.intendedPlaylistName ? `seed-${slug(item.intendedPlaylistName)}` : undefined,
    youtubeUrl: item.youtubeUrl,
    uploadedAt: item.status === "uploaded" ? new Date(item.lastActionAt) : undefined,
    failureReason: item.failureReason ? failureReasonMap[item.failureReason] : undefined,
    lastError: item.lastError,
    lastActionAt: new Date(item.lastActionAt),
    isSeedData: true
  };
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
