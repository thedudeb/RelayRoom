import type { Prisma } from "@prisma/client";
import type { ConnectionSummary, Pipeline, QueueItem, RoutingRule } from "@/lib/domain/types";
import { demoConnections, demoPipelines, demoQueueItems } from "@/lib/data/seed";
import { hasDatabaseUrl, prisma } from "@/lib/db/prisma";

type PipelineWithRules = Prisma.PipelineGetPayload<{
  include: { rules: { orderBy: { priority: "asc" } } };
}>;

type QueueItemWithPipeline = Prisma.QueueItemGetPayload<{
  include: { pipeline: { include: { rules: { orderBy: { priority: "asc" } } } } };
}>;

type RoutingOption = NonNullable<QueueItem["routingOptions"]>[number];

type ConnectionWithPipelines = Prisma.OAuthConnectionGetPayload<{
  include: { drivePipelines: true; youtubePipelines: true };
}>;

export async function getQueueItemsForDemo(): Promise<QueueItem[]> {
  if (!hasDatabaseUrl()) {
    return demoQueueItems;
  }

  try {
    const items = await prisma.queueItem.findMany({
      where: { isSeedData: true },
      include: { pipeline: { include: { rules: { orderBy: { priority: "asc" } } } } },
      orderBy: { detectedAt: "desc" }
    });

    return items.length > 0 ? items.map((item) => mapQueueItem(item)) : demoQueueItems;
  } catch (error) {
    console.warn("Falling back to in-memory queue demo data.", error);
    return demoQueueItems;
  }
}

export async function getQueueItemsForUser(userId: string): Promise<QueueItem[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }

  try {
    const items = await prisma.queueItem.findMany({
      where: { userId },
      include: { pipeline: { include: { rules: { orderBy: { priority: "asc" } } } } },
      orderBy: { detectedAt: "desc" }
    });
    const fallbackOptions = await getRoutingOptionsByYouTubeConnection(userId);

    return items.map((item) => mapQueueItem(item, fallbackOptions));
  } catch (error) {
    console.warn("Unable to load user queue data.", error);
    return [];
  }
}

export async function getConnectionsForDemo(): Promise<ConnectionSummary[]> {
  if (!hasDatabaseUrl()) {
    return demoConnections;
  }

  try {
    const connections = await prisma.oAuthConnection.findMany({
      where: { user: { email: "demo@relayroom.local" } },
      include: { drivePipelines: true, youtubePipelines: true },
      orderBy: { connectedAt: "asc" }
    });

    return connections.length > 0 ? connections.map(mapConnection) : demoConnections;
  } catch (error) {
    console.warn("Falling back to in-memory connection demo data.", error);
    return demoConnections;
  }
}

export async function getConnectionsForUser(userId: string): Promise<ConnectionSummary[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }

  try {
    const connections = await prisma.oAuthConnection.findMany({
      where: { userId },
      include: { drivePipelines: true, youtubePipelines: true },
      orderBy: { connectedAt: "asc" }
    });

    return connections.map(mapConnection);
  } catch (error) {
    console.warn("Unable to load user connection data.", error);
    return [];
  }
}

export async function getPipelinesForDemo(): Promise<Pipeline[]> {
  if (!hasDatabaseUrl()) {
    return demoPipelines;
  }

  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { user: { email: "demo@relayroom.local" } },
      include: { rules: { orderBy: { priority: "asc" } } },
      orderBy: { createdAt: "asc" }
    });

    return pipelines.length > 0 ? pipelines.map(mapPipeline) : demoPipelines;
  } catch (error) {
    console.warn("Falling back to in-memory pipeline demo data.", error);
    return demoPipelines;
  }
}

export async function getPipelinesForUser(userId: string): Promise<Pipeline[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }

  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { userId },
      include: { rules: { orderBy: { priority: "asc" } } },
      orderBy: { createdAt: "asc" }
    });

    return pipelines.map(mapPipeline);
  } catch (error) {
    console.warn("Unable to load user pipeline data.", error);
    return [];
  }
}

function mapQueueItem(
  item: QueueItemWithPipeline,
  fallbackOptionsByConnectionId = new Map<string, RoutingOption[]>()
): QueueItem {
  const pipelineOptions = uniquePlaylistOptions(item.pipeline.rules);
  const fallbackOptions = fallbackOptionsByConnectionId.get(item.pipeline.youtubeConnectionId) || [];

  return {
    id: item.id,
    pipelineId: item.pipelineId,
    pipelineName: item.pipeline.name,
    sourceFolderName: item.pipeline.sourceFolderName,
    driveFileId: item.driveFileId,
    filename: item.filename,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : undefined,
    driveCreatedTime: item.driveCreatedTime.toISOString(),
    detectedAt: item.detectedAt.toISOString(),
    status: item.status.toLowerCase() as QueueItem["status"],
    previousStatus: item.previousStatus?.toLowerCase() as QueueItem["previousStatus"],
    intendedPlaylistId: item.intendedPlaylistId || undefined,
    matchedRuleName: item.matchedRuleName || undefined,
    intendedPlaylistName: item.intendedPlaylistName || undefined,
    routingOptions: pipelineOptions.length ? pipelineOptions : fallbackOptions,
    youtubeVideoId: item.youtubeVideoId || undefined,
    youtubePlaylistId: item.youtubePlaylistId || item.intendedPlaylistId || undefined,
    youtubeUrl: item.youtubeUrl || undefined,
    failureReason: item.failureReason?.toLowerCase() as QueueItem["failureReason"],
    lastError: item.lastError || undefined,
    lastActionAt: item.lastActionAt.toISOString(),
    isSeedData: item.isSeedData
  };
}

async function getRoutingOptionsByYouTubeConnection(userId: string) {
  const rules = await prisma.rule.findMany({
    where: { pipeline: { userId } },
    orderBy: [{ pipelineId: "asc" }, { priority: "asc" }],
    select: {
      youtubePlaylistId: true,
      youtubePlaylistName: true,
      pipeline: {
        select: {
          youtubeConnectionId: true
        }
      }
    }
  });
  const optionsByConnectionId = new Map<string, RoutingOption[]>();
  const seenByConnectionId = new Map<string, Set<string>>();

  for (const rule of rules) {
    const connectionId = rule.pipeline.youtubeConnectionId;
    const seen = seenByConnectionId.get(connectionId) || new Set<string>();
    if (seen.has(rule.youtubePlaylistId)) {
      continue;
    }

    seen.add(rule.youtubePlaylistId);
    seenByConnectionId.set(connectionId, seen);
    optionsByConnectionId.set(connectionId, [
      ...(optionsByConnectionId.get(connectionId) || []),
      {
        id: rule.youtubePlaylistId,
        name: rule.youtubePlaylistName
      }
    ]);
  }

  return optionsByConnectionId;
}

function uniquePlaylistOptions(rules: QueueItemWithPipeline["pipeline"]["rules"]): RoutingOption[] {
  const seen = new Set<string>();
  return rules.flatMap((rule) => {
    if (seen.has(rule.youtubePlaylistId)) {
      return [];
    }

    seen.add(rule.youtubePlaylistId);
    return [
      {
        id: rule.youtubePlaylistId,
        name: rule.youtubePlaylistName
      }
    ];
  });
}

function mapConnection(connection: ConnectionWithPipelines): ConnectionSummary {
  const usedByPipelines = [
    ...connection.drivePipelines.map((pipeline) => pipeline.name),
    ...connection.youtubePipelines.map((pipeline) => pipeline.name)
  ];

  return {
    id: connection.id,
    kind: connection.kind.toLowerCase() as ConnectionSummary["kind"],
    label: connection.label,
    accountEmail: connection.accountEmail,
    status: connection.status.toLowerCase() as ConnectionSummary["status"],
    connectedAt: connection.connectedAt.toISOString(),
    scopes: connection.scopes,
    usedByPipelines
  };
}

function mapPipeline(pipeline: PipelineWithRules): Pipeline {
  return {
    id: pipeline.id,
    name: pipeline.name,
    sourceFolderId: pipeline.sourceFolderId,
    sourceFolderName: pipeline.sourceFolderName,
    driveConnectionId: pipeline.driveConnectionId,
    youtubeConnectionId: pipeline.youtubeConnectionId,
    destinationChannelName: pipeline.destinationChannelName,
    mode: pipeline.mode.toLowerCase() as Pipeline["mode"],
    status: pipeline.status.toLowerCase() as Pipeline["status"],
    privacyStatus: pipeline.privacyStatus.toLowerCase() as Pipeline["privacyStatus"],
    pollingIntervalMinutes: pipeline.pollingIntervalMinutes,
    defaultTitleTemplate: pipeline.defaultTitleTemplate,
    defaultDescriptionTemplate: pipeline.defaultDescriptionTemplate,
    processedFromTime: pipeline.processedFromTime?.toISOString() || "",
    lastDetectionAt: pipeline.lastDetectionAt?.toISOString(),
    rules: pipeline.rules.map(mapRule)
  };
}

function mapRule(rule: PipelineWithRules["rules"][number]): RoutingRule {
  return {
    id: rule.id,
    name: rule.name,
    priority: rule.priority,
    conditions: rule.conditionTree as unknown as RoutingRule["conditions"],
    playlist: {
      id: rule.youtubePlaylistId,
      name: rule.youtubePlaylistName
    },
    titleTemplate: rule.titleTemplateOverride || undefined,
    descriptionTemplate: rule.descriptionTemplateOverride || undefined
  };
}
