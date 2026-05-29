// Pure scheduling logic for the detection cron: given all pipelines and the
// current time, decide which ones are due to be polled. Kept side-effect-free
// (no DB, no clock) so it's deterministic and unit-testable — the route handler
// supplies `now` and the pipeline list.

// Demo/seed pipelines carry this sentinel in place of a real encrypted refresh
// token. They must never be scheduled, since there are no real credentials to
// call Google with.
export const SEED_TOKEN_PLACEHOLDER = "seed-token-placeholder";

export interface SchedulablePipeline {
  driveConnection: { encryptedRefreshToken: string };
  id: string;
  lastDetectionAt: Date | null;
  pollingIntervalMinutes: number;
  youtubeConnection: { encryptedRefreshToken: string };
}

/** True if either side of the pipeline is still wired to seed/demo credentials. */
export function usesSeedTokenPlaceholder(pipeline: {
  driveConnection: { encryptedRefreshToken: string };
  youtubeConnection: { encryptedRefreshToken: string };
}) {
  return (
    pipeline.driveConnection.encryptedRefreshToken === SEED_TOKEN_PLACEHOLDER ||
    pipeline.youtubeConnection.encryptedRefreshToken === SEED_TOKEN_PLACEHOLDER
  );
}

/**
 * A pipeline is due when it has never run, or when at least its polling interval
 * has elapsed since the last detection. The interval is floored at 5 minutes so
 * a misconfigured tiny value can't hammer the Google APIs every cron tick.
 */
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

/**
 * Picks the pipelines to run this tick: drops seed-data pipelines, keeps those
 * that are due, and caps the result at `limit` to bound per-tick work. Also
 * returns counts of what was skipped and why, which the cron route logs for
 * observability.
 */
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
