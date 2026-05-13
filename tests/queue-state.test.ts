import { describe, expect, it } from "vitest";
import { actionsForStatus, nextQueueStatus } from "@/lib/domain/queue-state";

describe("queue state machine", () => {
  it("allows manual approval to proceed to upload", () => {
    expect(nextQueueStatus("needs_approval", "approve")).toBe("uploading");
  });

  it("preserves explicit restore target", () => {
    expect(nextQueueStatus("externally_handled", "restore", "needs_approval")).toBe(
      "needs_approval"
    );
  });

  it("rejects invalid transitions", () => {
    expect(() => nextQueueStatus("uploaded", "retry")).toThrow("not allowed");
  });

  it("lists available actions by status", () => {
    expect(actionsForStatus("failed")).toEqual([
      "retry",
      "mark_externally_handled",
      "skip"
    ]);
  });
});
