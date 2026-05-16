import { describe, expect, it } from "vitest";
import {
  isPipelineDue,
  SEED_TOKEN_PLACEHOLDER,
  selectDuePipelines,
  usesSeedTokenPlaceholder
} from "@/lib/cron/scheduler";

const now = new Date("2026-05-15T12:00:00.000Z");
const liveConnection = { encryptedRefreshToken: "encrypted-token" };
const seedConnection = { encryptedRefreshToken: SEED_TOKEN_PLACEHOLDER };

function pipeline(overrides: Partial<Parameters<typeof selectDuePipelines>[0][number]> = {}) {
  return {
    driveConnection: liveConnection,
    id: "pipeline",
    lastDetectionAt: new Date("2026-05-15T11:30:00.000Z"),
    pollingIntervalMinutes: 15,
    youtubeConnection: liveConnection,
    ...overrides
  };
}

describe("cron scheduler", () => {
  it("treats never-run pipelines as due", () => {
    expect(isPipelineDue(pipeline({ lastDetectionAt: null }), now)).toBe(true);
  });

  it("uses a five-minute minimum cadence for custom low values", () => {
    expect(
      isPipelineDue(
        pipeline({
          lastDetectionAt: new Date("2026-05-15T11:56:00.000Z"),
          pollingIntervalMinutes: 1
        }),
        now
      )
    ).toBe(false);
    expect(
      isPipelineDue(
        pipeline({
          lastDetectionAt: new Date("2026-05-15T11:55:00.000Z"),
          pollingIntervalMinutes: 1
        }),
        now
      )
    ).toBe(true);
  });

  it("skips seeded demo pipelines before selecting due work", () => {
    expect(usesSeedTokenPlaceholder(pipeline({ driveConnection: seedConnection }))).toBe(true);
    expect(usesSeedTokenPlaceholder(pipeline({ youtubeConnection: seedConnection }))).toBe(true);
  });

  it("reports runnable, due, not-due, seed, and limit counts", () => {
    const dueA = pipeline({ id: "due-a" });
    const dueB = pipeline({ id: "due-b", lastDetectionAt: null });
    const notDue = pipeline({
      id: "not-due",
      lastDetectionAt: new Date("2026-05-15T11:50:00.000Z"),
      pollingIntervalMinutes: 15
    });
    const seed = pipeline({ driveConnection: seedConnection, id: "seed" });

    const result = selectDuePipelines([notDue, seed, dueA, dueB], now, 1);

    expect(result.runnablePipelines.map((item) => item.id)).toEqual(["not-due", "due-a", "due-b"]);
    expect(result.duePipelines.map((item) => item.id)).toEqual(["due-a"]);
    expect(result.skippedNotDue).toBe(2);
    expect(result.skippedSeedData).toBe(1);
  });
});
