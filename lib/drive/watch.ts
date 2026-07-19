// Drive push-notification subscriptions for a pipeline's source folder.
// SPEC §4.5: prefer push over polling for latency; channels expire in <=7
// days and must be renewed; the receiver must verify X-Goog-Channel-Token.
//
// We watch the folder file itself (files.watch). Notifications fire when
// the folder's metadata changes — including when children are added or
// removed. The detection code is unchanged: a notification just kicks off
// the same pipeline run polling would have done, so cold-start + idempotency
// + rule evaluation all still flow through one path.
//
// A more "production-correct" approach uses changes.watch on the user's
// whole Drive and routes notifications by file parent. We pick files.watch
// per-pipeline for simplicity and one-watch-per-pipeline ownership; revisit
// if the channel ceiling becomes a constraint.

import { randomBytes } from "node:crypto";
import { logGoogleApiError } from "@/lib/oauth/google-errors";
import { getUsableDriveAccessToken } from "@/lib/detection/drive-detection";
import { assertGoogleIntegrationsEnabled } from "@/lib/google/integrations";

interface DriveWatchResponse {
  expiration?: string;
  id?: string;
  resourceId?: string;
  error?: { code?: number; message?: string };
}

export interface DriveWatchSubscription {
  channelId: string;
  channelToken: string;
  resourceId: string;
  expiresAt: Date;
}

// Maximum channel lifetime per Drive docs. We renew on a margin (see
// scheduleRenewalCutoff) so a slow cron tick doesn't leave us unsubscribed.
const MAX_CHANNEL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function subscribeDriveFolderWatch({
  folderId,
  pipelineId,
  driveConnection,
  tokenKey,
  webhookUrl
}: {
  folderId: string;
  pipelineId: string;
  driveConnection: Parameters<typeof getUsableDriveAccessToken>[0];
  tokenKey: string;
  webhookUrl: string;
}): Promise<DriveWatchSubscription> {
  assertGoogleIntegrationsEnabled();

  const accessToken = await getUsableDriveAccessToken(driveConnection, tokenKey);
  if (!accessToken) {
    throw new Error("DriveWatchTokenRefreshFailed");
  }

  const channelId = `pipeline-${pipelineId}-${randomBytes(8).toString("hex")}`;
  const channelToken = randomBytes(24).toString("base64url");
  const expiration = Date.now() + MAX_CHANNEL_TTL_MS;

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}/watch`,
    {
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: channelToken,
        expiration: String(expiration)
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );
  const payload = (await response.json()) as DriveWatchResponse;

  if (!response.ok || payload.error || !payload.id || !payload.resourceId) {
    logGoogleApiError("Drive watch subscribe failed.", response, payload);
    throw new Error(payload.error?.message || "DriveWatchSubscribeFailed");
  }

  return {
    channelId: payload.id,
    channelToken,
    resourceId: payload.resourceId,
    expiresAt: payload.expiration ? new Date(Number(payload.expiration)) : new Date(expiration)
  };
}

export async function stopDriveWatchChannel({
  channelId,
  resourceId,
  driveConnection,
  tokenKey
}: {
  channelId: string;
  resourceId: string;
  driveConnection: Parameters<typeof getUsableDriveAccessToken>[0];
  tokenKey: string;
}): Promise<void> {
  assertGoogleIntegrationsEnabled();

  const accessToken = await getUsableDriveAccessToken(driveConnection, tokenKey);
  if (!accessToken) {
    // Best-effort stop. If we can't refresh, the channel will expire on its
    // own; surface the failure to the caller so they decide whether to
    // continue with the disable/disconnect flow.
    throw new Error("DriveWatchTokenRefreshFailed");
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
    body: JSON.stringify({ id: channelId, resourceId }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  // 404 means the channel already expired/was removed — fine.
  if (!response.ok && response.status !== 404) {
    const payload = await response.json().catch(() => ({}));
    logGoogleApiError("Drive watch stop failed.", response, payload);
    throw new Error("DriveWatchStopFailed");
  }
}

// Channels within this window are due for renewal. Keep the margin generous
// (24h) so a single missed cron tick doesn't strand a pipeline.
export function renewalCutoff(now = new Date()): Date {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
