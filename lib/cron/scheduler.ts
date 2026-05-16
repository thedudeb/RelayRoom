export const SEED_TOKEN_PLACEHOLDER = "seed-token-placeholder";

export interface SchedulablePipeline {
  driveConnection: { encryptedRefreshToken: string };
  id: string;
  lastDetectionAt: Date | null;
  pollingIntervalMinutes: number;
  youtubeConnection: { encryptedRefreshToken: string };
}

export function usesSeedTokenPlaceholder(pipeline: {
  driveConnection: { encryptedRefreshToken: string };
  youtubeConnection: { encryptedRefreshToken: string };
}) {
  return (
    pipeline.driveConnection.encryptedRefreshToken === SEED_TOKEN_PLACEHOLDER ||
    pipeline.youtubeConnection.encryptedRefreshToken === SEED_TOKEN_PLACEHOLDER
  );
}

export function isPipelineDue(
  pipeline: {
    lastDetectionAt: Date | null;
    pollingIntervalMinutes: number;
  },
  now: Date
) {
  if (!pipeline.lastDetectionAt) {
    return true;
  }

  const intervalMs = Math.max(pipeline.pollingIntervalMinutes, 5) * 60_000;
  return now.getTime() - pipeline.lastDetectionAt.getTime() >= intervalMs;
}

export function selectDuePipelines<T extends SchedulablePipeline>(
  pipelines: T[],
  now: Date,
  limit: number
) {
  const runnablePipelines = pipelines.filter((pipeline) => !usesSeedTokenPlaceholder(pipeline));
  const duePipelines = runnablePipelines
    .filter((pipeline) => isPipelineDue(pipeline, now))
    .slice(0, limit);

  return {
    duePipelines,
    runnablePipelines,
    skippedNotDue: runnablePipelines.length - duePipelines.length,
    skippedSeedData: pipelines.length - runnablePipelines.length
  };
}
