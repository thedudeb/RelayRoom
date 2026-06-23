import { FailureReason, QueueStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptToken } from "@/lib/security/token-vault";

export type QueueNotificationType = "needs_routing" | "needs_approval" | "upload_failed";

interface NotificationPreferenceLike {
  encryptedSlackWebhookUrl: string | null;
  notifyNeedsApproval: boolean;
  notifyNeedsRouting: boolean;
  notifyUploadFailed: boolean;
}

interface QueueNotificationItem {
  failureReason?: FailureReason | null;
  filename: string;
  id: string;
  intendedPlaylistName?: string | null;
  lastError?: string | null;
  pipeline: {
    destinationChannelName: string;
    name: string;
    sourceFolderName: string;
  };
  status: QueueStatus;
}

export function notificationWebhookAad(userId: string) {
  return `notification-webhook:${userId}`;
}

export function shouldSendQueueNotification(
  preference: NotificationPreferenceLike | null,
  type: QueueNotificationType
) {
  if (!preference?.encryptedSlackWebhookUrl) {
    return false;
  }

  if (type === "needs_routing") return preference.notifyNeedsRouting;
  if (type === "needs_approval") return preference.notifyNeedsApproval;
  return preference.notifyUploadFailed;
}

export function queueNotificationTypeForStatus(status: QueueStatus) {
  if (status === QueueStatus.NEEDS_ROUTING) return "needs_routing";
  if (status === QueueStatus.NEEDS_APPROVAL) return "needs_approval";
  return null;
}

export function buildSlackQueueNotificationPayload({
  appUrl,
  item,
  type
}: {
  appUrl?: string;
  item: QueueNotificationItem;
  type: QueueNotificationType;
}) {
  const title = queueNotificationTitle(type);
  const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/dashboard` : undefined;
  const details = [
    `Pipeline: ${item.pipeline.name}`,
    `Source: ${item.pipeline.sourceFolderName}`,
    `Destination: ${item.pipeline.destinationChannelName}`,
    item.intendedPlaylistName ? `Playlist: ${item.intendedPlaylistName}` : null,
    item.failureReason ? `Reason: ${formatFailureReason(item.failureReason)}` : null,
    item.lastError ? `Error: ${item.lastError}` : null
  ].filter(Boolean);

  return {
    text: `${title}: ${item.filename}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: title
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${escapeSlackText(item.filename)}*\n${details.map(escapeSlackText).join("\n")}`
        }
      },
      ...(dashboardUrl
        ? [
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Open queue"
                  },
                  url: dashboardUrl
                }
              ]
            }
          ]
        : [])
    ]
  };
}

export async function notifyQueueEvent({
  queueItemId,
  type,
  userId
}: {
  queueItemId: string;
  type: QueueNotificationType;
  userId: string;
}) {
  try {
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        encryptedSlackWebhookUrl: true,
        notifyNeedsApproval: true,
        notifyNeedsRouting: true,
        notifyUploadFailed: true
      }
    });

    if (!shouldSendQueueNotification(preference, type)) {
      return { delivered: false, reason: "disabled" };
    }

    const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!tokenKey) {
      console.warn("Notification webhook is configured, but TOKEN_ENCRYPTION_KEY is missing.");
      await recordNotificationDelivery({ delivered: false, queueItemId, reason: "missing_token_key", type, userId });
      return { delivered: false, reason: "missing_token_key" };
    }

    const item = await prisma.queueItem.findFirst({
      where: { id: queueItemId, userId },
      select: {
        failureReason: true,
        filename: true,
        id: true,
        intendedPlaylistName: true,
        lastError: true,
        pipeline: {
          select: {
            destinationChannelName: true,
            name: true,
            sourceFolderName: true
          }
        },
        status: true
      }
    });

    if (!item) {
      await recordNotificationDelivery({ delivered: false, queueItemId, reason: "missing_queue_item", type, userId });
      return { delivered: false, reason: "missing_queue_item" };
    }

    const webhookUrl = decryptToken(
      preference!.encryptedSlackWebhookUrl!,
      tokenKey,
      notificationWebhookAad(userId)
    );
    const response = await fetch(webhookUrl, {
      body: JSON.stringify(
        buildSlackQueueNotificationPayload({
          appUrl: process.env.NEXTAUTH_URL,
          item,
          type
        })
      ),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });

    if (!response.ok) {
      console.warn("Queue notification webhook delivery failed.", {
        queueItemId,
        status: response.status,
        type
      });
      await recordNotificationDelivery({
        delivered: false,
        queueItemId,
        reason: `http_${response.status}`,
        statusCode: response.status,
        type,
        userId
      });
      return { delivered: false, reason: `http_${response.status}` };
    }

    await recordNotificationDelivery({ delivered: true, queueItemId, statusCode: response.status, type, userId });
    return { delivered: true };
  } catch (error) {
    console.warn("Queue notification delivery failed.", {
      error: error instanceof Error ? error.message : String(error),
      queueItemId,
      type
    });
    await recordNotificationDelivery({
      delivered: false,
      queueItemId,
      reason: "delivery_error",
      type,
      userId
    }).catch(() => {});
    return { delivered: false, reason: "delivery_error" };
  }
}

async function recordNotificationDelivery({
  delivered,
  queueItemId,
  reason,
  statusCode,
  type,
  userId
}: {
  delivered: boolean;
  queueItemId: string;
  reason?: string;
  statusCode?: number;
  type: QueueNotificationType;
  userId: string;
}) {
  await prisma.notificationDeliveryAttempt.create({
    data: {
      delivered,
      queueItemId,
      reason,
      statusCode,
      type,
      userId
    }
  });
}

function queueNotificationTitle(type: QueueNotificationType) {
  if (type === "needs_routing") return "Recording needs routing";
  if (type === "needs_approval") return "Recording needs approval";
  return "Recording upload failed";
}

function formatFailureReason(reason: FailureReason) {
  return reason.toLowerCase().replaceAll("_", " ");
}

function escapeSlackText(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
