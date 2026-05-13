import { describe, expect, it } from "vitest";
import { demoPipelines, demoTimezone } from "@/lib/data/seed";
import { evaluatePipelineRules, validateCondition } from "@/lib/rules/rule-engine";

describe("rule engine", () => {
  it("uses first-match-wins routing", () => {
    const result = evaluatePipelineRules(
      demoPipelines[0],
      {
        id: "file-1",
        filename: "Engineering Standup and Demo.mp4",
        mimeType: "video/mp4",
        extension: "mp4",
        createdTime: "2026-05-08T14:00:00.000Z",
        sourceFolderId: "folder-eng-meet"
      },
      demoTimezone
    );

    expect(result.matchedRule?.name).toBe("Engineering Standup");
    expect(result.playlist?.name).toBe("Engineering Standups");
  });

  it("routes unmatched files without a playlist", () => {
    const result = evaluatePipelineRules(
      demoPipelines[0],
      {
        id: "file-2",
        filename: "Architecture Deep Dive.mov",
        mimeType: "video/quicktime",
        extension: "mov",
        createdTime: "2026-05-12T18:20:00.000Z",
        sourceFolderId: "folder-eng-meet"
      },
      demoTimezone
    );

    expect(result.matchedRule).toBeUndefined();
    expect(result.playlist).toBeUndefined();
    expect(result.ruleTraces).toHaveLength(2);
  });

  it("validates regex syntax before evaluation", () => {
    const message = validateCondition({
      id: "bad-regex",
      type: "condition",
      field: "filename",
      operator: "matches_regex",
      value: "["
    });

    expect(message).toBeTruthy();
  });
});
