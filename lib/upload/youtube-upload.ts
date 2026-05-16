import {
  randomUUID
} from "node:crypto";
import {
  ConnectionKind,
  ConnectionStatus,
  FailureReason,
  Prisma,
  PrivacyStatus,
  QueueStatus
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decryptToken, encryptToken } from "@/lib/security/token-vault";

interface GoogleRefreshResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
}

interface GoogleApiError {
  error?: {
    code?: number;
    errors?: Array<{ reason?: string }>;
    message?: string;
  };
}

interface YouTubeVideoInsertResponse extends GoogleApiError {
  id?: string;
}

interface YouTubePlaylistInsertResponse extends GoogleApiError {
  id?: string;
}

const maxMvpUploadBytes = 256 * 1024 * 1024;
const uploadableStatuses = new Set<QueueStatus>([QueueStatus.NEEDS_APPROVAL, QueueStatus.FAILED]);

export async function uploadQueueItemToYouTube({
  queueItemId,
  userId
}: {
  queueItemId: string;
  userId: string;
}) {
  const item = await prisma.queueItem.findFirst({
    where: {
      id: queueItemId
    },
    include: {
      attempts: { select: { attemptNumber: true } },
      pipeline: {
        include: {
          driveConnection: true,
          youtubeConnection: true
        }
      }
    }
  });

  if (!item) {
    throw new Error("Queue item not found.");
  }

  if (!uploadableStatuses.has(item.status)) {
    throw new Error(`Upload is not allowed from ${formatStatus(item.status)}.`);
  }

  if (!item.intendedPlaylistId) {
    throw new Error("Route this item to a YouTube playlist before uploading.");
  }

  validateConnections(item.pipeline);

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    throw new Error("MissingTokenKey");
  }

  const attemptNumber =
    item.attempts.reduce((highest, attempt) => Math.max(highest, attempt.attemptNumber), 0) + 1;
  const now = new Date();
  const attempt = await prisma.$transaction(async (tx) => {
    const createdAttempt = await tx.uploadAttempt.create({
      data: {
        attemptNumber,
        queueItemId: item.id,
        startedAt: now
      }
    });

    await tx.queueItem.update({
      where: { id: item.id },
      data: {
        failureReason: null,
        lastActionAt: now,
        lastError: null,
        previousStatus: item.status,
        status: QueueStatus.UPLOADING
      }
    });

    await tx.activityLogEntry.create({
      data: {
        actorType: "user",
        message: "Approved item for YouTube upload.",
        metadata: { fromStatus: item.status },
        queueItemId: item.id,
        userId
      }
    });

    return createdAttempt;
  });

  try {
    const [driveAccessToken, youtubeAccessToken] = await Promise.all([
      getUsableGoogleAccessToken({
        clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        connection: item.pipeline.driveConnection,
        serviceName: "Drive",
        tokenKey
      }),
      getUsableGoogleAccessToken({
        clientId: process.env.GOOGLE_YOUTUBE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_YOUTUBE_CLIENT_SECRET,
        connection: item.pipeline.youtubeConnection,
        serviceName: "YouTube",
        tokenKey
      })
    ]);

    if (!driveAccessToken || !youtubeAccessToken) {
      throw new ClassifiedUploadError("TokenRefreshFailed", FailureReason.AUTH_REVOKED);
    }

    const file = await downloadDriveFile({
      accessToken: driveAccessToken,
      driveFileId: item.driveFileId,
      filename: item.filename,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : undefined
    });

    const videoId = await insertYouTubeVideo({
      accessToken: youtubeAccessToken,
      description: item.renderedDescription || "",
      file,
      privacyStatus: item.pipeline.privacyStatus,
      title: item.renderedTitle || item.filename
    });

    await addVideoToPlaylist({
      accessToken: youtubeAccessToken,
      playlistId: item.intendedPlaylistId,
      videoId
    });

    const uploadedAt = new Date();
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    await prisma.$transaction([
      prisma.uploadAttempt.update({
        where: { id: attempt.id },
        data: {
          finishedAt: uploadedAt,
          success: true,
          youtubeVideoId: videoId
        }
      }),
      prisma.queueItem.update({
        where: { id: item.id },
        data: {
          failureReason: null,
          lastActionAt: uploadedAt,
          lastError: null,
          previousStatus: null,
          status: QueueStatus.UPLOADED,
          uploadedAt,
          youtubePlaylistId: item.intendedPlaylistId,
          youtubeUrl,
          youtubeVideoId: videoId
        }
      }),
      prisma.activityLogEntry.create({
        data: {
          actorType: "system",
          message: "Uploaded item to YouTube.",
          metadata: {
            playlistId: item.intendedPlaylistId,
            videoId,
            youtubeUrl
          },
          queueItemId: item.id,
          userId
        }
      })
    ]);

    return {
      message: "Uploaded item to YouTube.",
      videoId,
      youtubeUrl
    };
  } catch (error) {
    const failureReason =
      error instanceof ClassifiedUploadError ? error.reason : FailureReason.UNKNOWN;
    const lastError = error instanceof Error ? error.message : "Upload failed.";
    const finishedAt = new Date();

    await prisma.$transaction([
      prisma.uploadAttempt.update({
        where: { id: attempt.id },
        data: {
          failureReason,
          finishedAt,
          rawError: lastError,
          success: false
        }
      }),
      prisma.queueItem.update({
        where: { id: item.id },
        data: {
          failureReason,
          lastActionAt: finishedAt,
          lastError,
          status: QueueStatus.FAILED
        }
      }),
      prisma.activityLogEntry.create({
        data: {
          actorType: "system",
          message: "YouTube upload failed.",
          metadata: { failureReason, lastError },
          queueItemId: item.id,
          userId
        }
      })
    ]);

    throw error;
  }
}

function validateConnections(
  pipeline: Prisma.PipelineGetPayload<{
    include: { driveConnection: true; youtubeConnection: true };
  }>
) {
  if (
    pipeline.driveConnection.kind !== ConnectionKind.DRIVE ||
    pipeline.driveConnection.status !== ConnectionStatus.ACTIVE
  ) {
    throw new Error("MissingActiveDriveConnection");
  }

  if (
    pipeline.youtubeConnection.kind !== ConnectionKind.YOUTUBE ||
    pipeline.youtubeConnection.status !== ConnectionStatus.ACTIVE
  ) {
    throw new Error("MissingActiveYouTubeConnection");
  }
}

async function getUsableGoogleAccessToken({
  clientId,
  clientSecret,
  connection,
  serviceName,
  tokenKey
}: {
  clientId?: string;
  clientSecret?: string;
  connection: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string;
    expiresAt: Date | null;
    id: string;
  };
  serviceName: "Drive" | "YouTube";
  tokenKey: string;
}) {
  if (
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(connection.encryptedAccessToken, tokenKey);
  }

  if (!clientId || !clientSecret) {
    throw new ClassifiedUploadError(
      `${serviceName} OAuth is not configured. Add the client ID and secret, restart the dev server, then reconnect ${serviceName}.`,
      FailureReason.AUTH_REVOKED
    );
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken, tokenKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });
  const payload = await readGoogleJson<GoogleRefreshResponse>(
    response,
    `${serviceName} token refresh failed.`
  );

  if (!response.ok || !payload.access_token || payload.error) {
    console.error(`${serviceName} token refresh failed.`, payload);
    throw new ClassifiedUploadError(
      `${serviceName} token refresh failed. Reconnect ${serviceName} and try again.`,
      FailureReason.AUTH_REVOKED
    );
  }

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptToken(payload.access_token, tokenKey),
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : connection.expiresAt
    }
  });

  return payload.access_token;
}

async function downloadDriveFile({
  accessToken,
  driveFileId,
  filename,
  mimeType,
  sizeBytes
}: {
  accessToken: string;
  driveFileId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
}) {
  if (sizeBytes && sizeBytes > maxMvpUploadBytes) {
    throw new ClassifiedUploadError(
      "This MVP upload path supports files up to 256 MB. Resumable uploads are the next upgrade.",
      FailureReason.FILE_TOO_LARGE
    );
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (response.status === 404) {
    throw new ClassifiedUploadError("Drive file was not found.", FailureReason.FILE_NOT_FOUND);
  }

  if (!response.ok) {
    const payload = await readGoogleJson<GoogleApiError>(
      response,
      "Drive file download failed."
    );
    throw classifyGoogleError(payload, "Drive file download failed.");
  }

  const bytes = await response.arrayBuffer();
  return {
    bytes,
    filename,
    mimeType
  };
}

async function insertYouTubeVideo({
  accessToken,
  description,
  file,
  privacyStatus,
  title
}: {
  accessToken: string;
  description: string;
  file: { bytes: ArrayBuffer; filename: string; mimeType: string };
  privacyStatus: PrivacyStatus;
  title: string;
}) {
  const boundary = `relayroom_${randomUUID()}`;
  const metadata = {
    snippet: {
      description,
      title
    },
    status: {
      privacyStatus: privacyStatus.toLowerCase()
    }
  };
  const metadataPart = Buffer.from(
    [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${file.mimeType}`,
      "",
      ""
    ].join("\r\n")
  );
  const closingBoundary = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([metadataPart, Buffer.from(file.bytes), closingBoundary]);

  const response = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": String(body.byteLength),
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      method: "POST"
    }
  );
  const payload = await readGoogleJson<YouTubeVideoInsertResponse>(
    response,
    "YouTube upload failed."
  );

  if (!response.ok || payload.error || !payload.id) {
    throw classifyGoogleError(payload, "YouTube upload failed.");
  }

  return payload.id;
}

async function addVideoToPlaylist({
  accessToken,
  playlistId,
  videoId
}: {
  accessToken: string;
  playlistId: string;
  videoId: string;
}) {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
    {
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: {
            kind: "youtube#video",
            videoId
          }
        }
      }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );
  const payload = await readGoogleJson<YouTubePlaylistInsertResponse>(
    response,
    "YouTube playlist insert failed."
  );

  if (!response.ok || payload.error || !payload.id) {
    throw classifyGoogleError(payload, "YouTube playlist insert failed.");
  }
}

function classifyGoogleError(payload: GoogleApiError, fallbackMessage: string) {
  const reason = payload.error?.errors?.[0]?.reason;
  const message = payload.error?.message || fallbackMessage;

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return new ClassifiedUploadError(message, FailureReason.QUOTA_EXCEEDED);
  }

  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    return new ClassifiedUploadError(message, FailureReason.RATE_LIMITED);
  }

  if (payload.error?.code === 401 || payload.error?.code === 403) {
    return new ClassifiedUploadError(message, FailureReason.AUTH_REVOKED);
  }

  if (reason === "playlistNotFound" || reason === "playlistForbidden") {
    return new ClassifiedUploadError(message, FailureReason.PLAYLIST_DELETED);
  }

  return new ClassifiedUploadError(message, FailureReason.UNKNOWN);
}

async function readGoogleJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ClassifiedUploadError(
      `${fallbackMessage} Google returned a non-JSON response: ${truncate(text)}`,
      FailureReason.UNKNOWN
    );
  }
}

function truncate(value: string) {
  const compactValue = value.replace(/\s+/g, " ").trim();
  return compactValue.length > 180 ? `${compactValue.slice(0, 180)}...` : compactValue;
}

function formatStatus(status: QueueStatus): string {
  return status.toLowerCase().replaceAll("_", " ");
}

class ClassifiedUploadError extends Error {
  constructor(
    message: string,
    readonly reason: FailureReason
  ) {
    super(message);
    this.name = "ClassifiedUploadError";
  }
}
