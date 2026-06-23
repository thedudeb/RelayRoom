import { describe, expect, it } from "vitest";
import { demoQueueItems } from "@/lib/data/seed";
import { generateRecordingIntelligence } from "@/lib/intelligence/recording-intelligence";

describe("recording intelligence", () => {
  it("uses matched routing as a high-confidence recommendation", () => {
    const intelligence = generateRecordingIntelligence(demoQueueItems[0]);

    expect(intelligence.confidence).toBe("high");
    expect(intelligence.routingRecommendation?.playlistName).toBe("Engineering Standups");
    expect(intelligence.tags).toContain("Engineering");
    expect(intelligence.chapters[0].start).toBe("00:00");
  });

  it("flags unmatched videos for a playlist decision", () => {
    const intelligence = generateRecordingIntelligence(demoQueueItems[2]);

    expect(intelligence.confidence).toBe("medium");
    expect(intelligence.reviewFlags).toContain("Needs playlist decision");
    expect(intelligence.routingRecommendation?.playlistName).toBe("Architecture Recordings");
  });

  it("keeps unsupported files low confidence", () => {
    const intelligence = generateRecordingIntelligence(demoQueueItems[4]);

    expect(intelligence.confidence).toBe("low");
    expect(intelligence.reviewFlags).toContain("Unsupported file type");
    expect(intelligence.summary).toContain("not a supported video");
  });
});
