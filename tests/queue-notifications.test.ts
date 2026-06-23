import { FailureReason, QueueStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  buildSlackQueueNotificationPayload,
  queueNotificationTypeForStatus,
  shouldSendQueueNotification
} from "@/lib/notifications/queue-notifications";

describe("queue notifications", () => {
  const configuredPreference = {
    encryptedSlackWebhookUrl: "encrypted-webhook",
    notifyNeedsApproval: true,
    notifyNeedsRouting: true,
    notifyUploadFailed: true
  };

  it("maps attention statuses to notification types", () => {
    expect(queueNotificationTypeForStatus(QueueStatus.NEEDS_ROUTING)).toBe("needs_routing");
    expect(queueNotificationTypeForStatus(QueueStatus.NEEDS_APPROVAL)).toBe("needs_approval");
    expect(queueNotificationTypeForStatus(QueueStatus.DETECTED)).toBeNull();
    expect(queueNotificationTypeForStatus(QueueStatus.UPLOADED)).toBeNull();
  });

  it("requires both a webhook and an enabled event toggle", () => {
    expect(shouldSendQueueNotification(null, "upload_failed")).toBe(false);
    expect(
      shouldSendQueueNotification(
        { ...configuredPreference, encryptedSlackWebhookUrl: null },
        "upload_failed"
      )
    ).toBe(false);
    expect(
      shouldSendQueueNotification(
        { ...configuredPreference, notifyUploadFailed: false },
        "upload_failed"
      )
    ).toBe(false);
    expect(shouldSendQueueNotification(configuredPreference, "upload_failed")).toBe(true);
  });

  it("builds a Slack-compatible payload with queue context", () => {
    const payload = buildSlackQueueNotificationPayload({
      appUrl: "https://relayroom.example",
      item: {
        failureReason: FailureReason.QUOTA_EXCEEDED,
        filename: "Weekly Review <draft>.mp4",
        id: "queue_1",
        intendedPlaylistName: "Weekly Reviews",
        lastError: "YouTube quota exceeded",
        pipeline: {
          destinationChannelName: "RelayRoom",
          name: "Leadership calls",
          sourceFolderName: "Meet Recordings"
        },
        status: QueueStatus.FAILED
      },
      type: "upload_failed"
    });

    expect(payload.text).toBe("Recording upload failed: Weekly Review <draft>.mp4");
    expect(JSON.stringify(payload.blocks)).toContain("Leadership calls");
    expect(JSON.stringify(payload.blocks)).toContain("quota exceeded");
    expect(JSON.stringify(payload.blocks)).toContain("https://relayroom.example/dashboard");
    expect(JSON.stringify(payload.blocks)).toContain("&lt;draft&gt;");
  });
});
