import {
  ConnectionKind,
  ConnectionStatus,
  FailureReason,
  Prisma,
  PrivacyStatus,
  QueueStatus
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertGoogleIntegrationsEnabled } from "@/lib/google/integrations";
import { notifyQueueEvent } from "@/lib/notifications/queue-notifications";
import { markConnectionRefreshFailed } from "@/lib/oauth/connection-health";
import { logGoogleApiError } from "@/lib/oauth/google-errors";
import { decryptToken, encryptToken, oauthTokenAad } from "@/lib/security/token-vault";
import { getVideoHeaderValidationError } from "./video-file-validation";

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

interface YouTubeVideosListResponse extends GoogleApiError {
  items?: Array<{ id?: string }>;
}

// 8 MiB per chunk. Must be a multiple of 256 KiB per YouTube's resumable
// upload spec; intermediate chunks must use exactly this size, the final
// chunk may be shorter.
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

// YouTube hard limits (https://developers.google.com/youtube/v3/docs/videos/insert):
//   * 256 GiB max file size
//   * 12-hour max duration (not enforceable from headers; surfaces at upload time)
// SPEC §4.9 requires the size limit to be rejected upfront with a clear reason.
const YOUTUBE_MAX_BYTES = 256 * 1024 * 1024 * 1024;

const uploadableStatuses = new Set<QueueStatus>([
  QueueStatus.DETECTED,
  QueueStatus.NEEDS_APPROVAL,
  QueueStatus.FAILED
]);

export type UploadTrigger = "auto" | "approve" | "retry";

const allowedTransitions: Record<UploadTrigger, ReadonlySet<QueueStatus>> = {
  auto: new Set([QueueStatus.DETECTED]),
  approve: new Set([QueueStatus.NEEDS_APPROVAL]),
  retry: new Set([QueueStatus.FAILED])
};

export async function uploadQueueItemToYouTube({
  bulk,
  queueItemId,
  trigger,
  userId
}: {
  bulk?: { action: string; batchId: string; size: number };
  queueItemId: string;
  // The caller asserts what kind of transition is happening. We enforce that
  // the queue item's current status matches the trigger (ISSUE-047): an
  // approval click must not be able to fire on a DETECTED item, and an
  // auto-upload must not bypass NEEDS_APPROVAL by accident.
  trigger: UploadTrigger;
  userId: string;
}) {
  assertGoogleIntegrationsEnabled();

  const item = await prisma.queueItem.findFirst({
    where: {
      id: queueItemId,
      userId
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

  if (!allowedTransitions[trigger].has(item.status)) {
    throw new Error(
      `Upload trigger '${trigger}' cannot fire on a ${formatStatus(item.status)} item.`
    );
  }

  if (!item.intendedPlaylistId) {
    throw new Error("Route this item to a YouTube playlist before uploading.");
  }

  // Pre-flight size check using the size snapshot Drive returned at detection
  // time, before we open any sessions or burn quota. The download path
  // re-checks the live Content-Length too (the file may have grown).
  if (item.sizeBytes && Number(item.sizeBytes) > YOUTUBE_MAX_BYTES) {
    throw new Error(
      `File is ${formatBytes(Number(item.sizeBytes))}, which exceeds YouTube's 256 GiB upload limit.`
    );
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
        actorType: item.status === QueueStatus.DETECTED ? "system" : "user",
        message:
          item.status === QueueStatus.DETECTED
            ? "Auto-upload started."
            : "Approved item for YouTube upload.",
        metadata: {
          ...(bulk
            ? {
                bulkAction: bulk.action,
                bulkBatchId: bulk.batchId,
                bulkSize: bulk.size
              }
            : {}),
          fromStatus: item.status
        },
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

    if (item.youtubeVideoId && !item.youtubePlaylistId) {
      const existingVideoStillExists = await verifyYouTubeVideoExists({
        accessToken: youtubeAccessToken,
        videoId: item.youtubeVideoId
      });
      if (!existingVideoStillExists) {
        await prisma.queueItem.update({
          where: { id: item.id },
          data: {
            youtubeUrl: null,
            youtubeVideoId: null
          }
        });
      } else {
        await addVideoToPlaylist({
          accessToken: youtubeAccessToken,
          playlistId: item.intendedPlaylistId,
          videoId: item.youtubeVideoId
        });

        return markUploadComplete({
          attemptId: attempt.id,
          itemId: item.id,
          playlistId: item.intendedPlaylistId,
          userId,
          videoId: item.youtubeVideoId
        });
      }
    }

    const driveFile = await openDriveFileStream({
      accessToken: driveAccessToken,
      driveFileId: item.driveFileId,
      filename: item.filename,
      mimeType: item.mimeType
    });

    const videoId = await streamUploadToYouTube({
      accessToken: youtubeAccessToken,
      description: item.renderedDescription || "",
      file: driveFile,
      privacyStatus: item.pipeline.privacyStatus,
      title: item.renderedTitle || item.filename
    });

    await requireVerifiedYouTubeVideo({
      accessToken: youtubeAccessToken,
      videoId
    });

    await addVideoToPlaylist({
      accessToken: youtubeAccessToken,
      playlistId: item.intendedPlaylistId,
      videoId
    });

    return markUploadComplete({
      attemptId: attempt.id,
      itemId: item.id,
      playlistId: item.intendedPlaylistId,
      userId,
      videoId
    });
  } catch (error) {
    const failureReason =
      error instanceof ClassifiedUploadError ? error.reason : FailureReason.UNKNOWN;
    const lastError = error instanceof Error ? error.message : "Upload failed.";
    const finishedAt = new Date();
    const partialVideoId =
      error instanceof PostVideoUploadError ? error.videoId : undefined;
    const youtubeUrl = partialVideoId
      ? `https://www.youtube.com/watch?v=${partialVideoId}`
      : undefined;

    await prisma.$transaction([
      prisma.uploadAttempt.update({
        where: { id: attempt.id },
        data: {
          failureReason,
          finishedAt,
          rawError: lastError,
          success: false,
          youtubeVideoId: partialVideoId
        }
      }),
      prisma.queueItem.update({
        where: { id: item.id },
        data: {
          failureReason,
          lastActionAt: finishedAt,
          lastError,
          status: QueueStatus.FAILED,
          ...(partialVideoId
            ? {
                youtubePlaylistId: null,
                youtubeUrl,
                youtubeVideoId: partialVideoId
              }
            : {})
        }
      }),
      prisma.activityLogEntry.create({
        data: {
          actorType: "system",
          message: partialVideoId
            ? "YouTube upload succeeded, but playlist assignment failed."
            : "YouTube upload failed.",
          metadata: { failureReason, lastError, videoId: partialVideoId, youtubeUrl },
          queueItemId: item.id,
          userId
        }
      })
    ]);
    await notifyQueueEvent({
      queueItemId: item.id,
      type: "upload_failed",
      userId
    });

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
  assertGoogleIntegrationsEnabled();

  const aad = oauthTokenAad(connection.id);
  if (
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(connection.encryptedAccessToken, tokenKey, aad);
  }

  if (!clientId || !clientSecret) {
    throw new ClassifiedUploadError(
      `${serviceName} OAuth is not configured. Add the client ID and secret, restart the dev server, then reconnect ${serviceName}.`,
      FailureReason.AUTH_REVOKED
    );
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken, tokenKey, aad);
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
    logGoogleApiError(`${serviceName} token refresh failed.`, response, payload);
    await markConnectionRefreshFailed({
      connectionId: connection.id,
      kind: serviceName === "Drive" ? ConnectionKind.DRIVE : ConnectionKind.YOUTUBE,
      message: `${serviceName} token refresh failed. Reconnect ${serviceName} and enable affected pipelines.`
    });
    throw new ClassifiedUploadError(
      `${serviceName} token refresh failed. Reconnect ${serviceName} and try again.`,
      FailureReason.AUTH_REVOKED
    );
  }

  await prisma.oAuthConnection.update({
    where: { id: connection.id },
    data: {
      encryptedAccessToken: encryptToken(payload.access_token, tokenKey, aad),
      expiresAt: payload.expires_in
        ? new Date(Date.now() + payload.expires_in * 1000)
        : connection.expiresAt
    }
  });

  return payload.access_token;
}

interface DriveFileStream {
  body: ReadableStream<Uint8Array>;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

async function openDriveFileStream({
  accessToken,
  driveFileId,
  filename,
  mimeType
}: {
  accessToken: string;
  driveFileId: string;
  filename: string;
  mimeType: string;
}): Promise<DriveFileStream> {
  assertGoogleIntegrationsEnabled();

  const response = await fetchWithTransientRetries(
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

  const contentLength = Number(response.headers.get("content-length"));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    throw new ClassifiedUploadError(
      "Drive did not return a Content-Length; cannot start a resumable YouTube upload.",
      FailureReason.UNKNOWN
    );
  }
  if (contentLength > YOUTUBE_MAX_BYTES) {
    response.body?.cancel().catch(() => {});
    throw new ClassifiedUploadError(
      `Drive file is ${formatBytes(contentLength)}, which exceeds YouTube's 256 GiB upload limit.`,
      FailureReason.FILE_TOO_LARGE
    );
  }
  if (!response.body) {
    throw new ClassifiedUploadError(
      "Drive response had no body to stream.",
      FailureReason.UNKNOWN
    );
  }

  return {
    body: response.body,
    filename,
    mimeType,
    sizeBytes: contentLength
  };
}

async function markUploadComplete({
  attemptId,
  itemId,
  playlistId,
  userId,
  videoId
}: {
  attemptId?: string;
  itemId: string;
  playlistId: string;
  userId: string;
  videoId: string;
}) {
  const uploadedAt = new Date();
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

  await prisma.$transaction([
    ...(attemptId
      ? [
          prisma.uploadAttempt.update({
            where: { id: attemptId },
            data: {
              finishedAt: uploadedAt,
              success: true,
              youtubeVideoId: videoId
            }
          })
        ]
      : []),
    prisma.queueItem.update({
      where: { id: itemId },
      data: {
        failureReason: null,
        lastActionAt: uploadedAt,
        lastError: null,
        previousStatus: null,
        status: QueueStatus.UPLOADED,
        uploadedAt,
        youtubePlaylistId: playlistId,
        youtubeUrl,
        youtubeVideoId: videoId
      }
    }),
    prisma.activityLogEntry.create({
      data: {
        actorType: "system",
        message: "Uploaded item to YouTube.",
        metadata: {
          playlistId,
          videoId,
          youtubeUrl
        },
        queueItemId: itemId,
        userId
      }
    })
  ]);

  return {
    message: "Uploaded item to YouTube.",
    videoId,
    youtubeUrl
  };
}

async function streamUploadToYouTube({
  accessToken,
  description,
  file,
  privacyStatus,
  title
}: {
  accessToken: string;
  description: string;
  file: DriveFileStream;
  privacyStatus: PrivacyStatus;
  title: string;
}) {
  const metadata = {
    snippet: { description, title },
    status: { privacyStatus: privacyStatus.toLowerCase() }
  };

  // Resumable session creation: a POST that must NOT be retried — each call
  // mints a new upload URL and leaks the previous session.
  const createSessionResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      body: JSON.stringify(metadata),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(file.sizeBytes),
        "X-Upload-Content-Type": file.mimeType
      },
      method: "POST"
    }
  );
  const uploadUrl = createSessionResponse.headers.get("location");
  if (!createSessionResponse.ok || !uploadUrl) {
    const payload = await readGoogleJson<YouTubeVideoInsertResponse>(
      createSessionResponse,
      "YouTube resumable upload session failed."
    );
    throw classifyGoogleError(payload, "YouTube resumable upload session failed.");
  }

  const reader = file.body.getReader();
  let pending = Buffer.alloc(0);
  let offset = 0;
  let streamDone = false;
  let validated = false;
  let finalPayload: YouTubeVideoInsertResponse | null = null;

  try {
    while (!finalPayload) {
      while (!streamDone && pending.byteLength < UPLOAD_CHUNK_BYTES) {
        const { done, value } = await reader.read();
        if (done) {
          streamDone = true;
          break;
        }
        pending = Buffer.concat([pending, Buffer.from(value)]);
        if (!validated) {
          const headerError = getVideoHeaderValidationError({
            prefix: pending,
            filename: file.filename,
            mimeType: file.mimeType
          });
          // Once we have at least 16 bytes (the threshold the validator uses)
          // run it and short-circuit on rejection so we don't waste bandwidth.
          if (pending.byteLength >= 16) {
            if (headerError) {
              throw new ClassifiedUploadError(headerError, FailureReason.NOT_VIDEO);
            }
            validated = true;
          }
        }
      }

      const isFinalChunk = streamDone;
      const chunkSize = isFinalChunk
        ? pending.byteLength
        : Math.min(UPLOAD_CHUNK_BYTES, pending.byteLength);
      const chunk = pending.subarray(0, chunkSize);
      pending = pending.subarray(chunkSize);

      const end = offset + chunkSize - 1;
      const totalForRange = isFinalChunk ? String(offset + chunkSize) : "*";
      const response = await uploadChunkWithRetries({
        url: uploadUrl,
        chunk,
        offset,
        end,
        totalSize: file.sizeBytes,
        totalForRange,
        mimeType: file.mimeType
      });

      if (response.status === 308) {
        // Resume Incomplete: server tells us via Range header how far it got.
        const range = response.headers.get("range");
        const accepted = parseAcceptedBytes(range);
        offset = accepted !== null ? accepted + 1 : offset + chunkSize;
        continue;
      }

      if (response.ok) {
        finalPayload = await readGoogleJson<YouTubeVideoInsertResponse>(
          response,
          "YouTube upload failed."
        );
        if (finalPayload.error || !finalPayload.id) {
          throw classifyGoogleError(finalPayload, "YouTube upload failed.");
        }
        return finalPayload.id;
      }

      const payload = await readGoogleJson<YouTubeVideoInsertResponse>(
        response,
        "YouTube upload failed."
      );
      throw classifyGoogleError(payload, "YouTube upload failed.");
    }
  } finally {
    reader.releaseLock();
    file.body.cancel().catch(() => {});
  }

  // Unreachable: loop returns on terminal status or throws.
  throw new ClassifiedUploadError("YouTube upload ended without a terminal response.", FailureReason.UNKNOWN);
}

async function uploadChunkWithRetries({
  url,
  chunk,
  offset,
  end,
  totalSize,
  totalForRange,
  mimeType
}: {
  url: string;
  chunk: Buffer;
  offset: number;
  end: number;
  totalSize: number;
  totalForRange: string;
  mimeType: string;
}) {
  void totalSize; // referenced via totalForRange; kept for log clarity at the call site
  // Chunk PUTs are idempotent under the resumable protocol: the same
  // Content-Range can be replayed safely. Retries here implement the
  // documented YouTube resume semantics rather than the prior blanket retry.
  const body = chunk.buffer.slice(
    chunk.byteOffset,
    chunk.byteOffset + chunk.byteLength
  ) as ArrayBuffer;
  return fetchWithTransientRetries(
    url,
    {
      body,
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${offset}-${end}/${totalForRange}`,
        "Content-Type": mimeType
      },
      method: "PUT"
    },
    { retryNonIdempotent: false }
  );
}

function parseAcceptedBytes(rangeHeader: string | null): number | null {
  if (!rangeHeader) return null;
  const match = /bytes=\d+-(\d+)/.exec(rangeHeader);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
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
  try {
    const response = await fetchWithTransientRetries(
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
  } catch (error) {
    if (error instanceof PlaylistInsertAfterUploadError) {
      throw error;
    }

    if (error instanceof ClassifiedUploadError) {
      throw new PlaylistInsertAfterUploadError(error, videoId);
    }

    throw new PlaylistInsertAfterUploadError(
      new ClassifiedUploadError(
        error instanceof Error ? error.message : "YouTube playlist insert failed.",
        FailureReason.UNKNOWN
      ),
      videoId
    );
  }
}

async function requireVerifiedYouTubeVideo({
  accessToken,
  videoId
}: {
  accessToken: string;
  videoId: string;
}) {
  const exists = await verifyYouTubeVideoExists({ accessToken, videoId });
  if (!exists) {
    throw new PostVideoUploadError(
      new ClassifiedUploadError(
        "YouTube upload verification failed. Google did not return the uploaded video.",
        FailureReason.UNKNOWN
      ),
      videoId
    );
  }
}

async function verifyYouTubeVideoExists({
  accessToken,
  videoId
}: {
  accessToken: string;
  videoId: string;
}) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  url.searchParams.set("part", "id");

  const response = await fetchWithTransientRetries(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await readGoogleJson<YouTubeVideosListResponse>(
    response,
    "YouTube upload verification failed."
  );

  if (!response.ok || payload.error) {
    throw classifyGoogleError(payload, "YouTube upload verification failed.");
  }

  return Boolean(payload.items?.some((item) => item.id === videoId));
}

function classifyGoogleError(payload: GoogleApiError, fallbackMessage: string) {
  const reason = payload.error?.errors?.[0]?.reason;
  const message = payload.error?.message || fallbackMessage;

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return new ClassifiedUploadError(message, FailureReason.QUOTA_EXCEEDED);
  }

  if (
    payload.error?.code === 429 ||
    reason === "rateLimitExceeded" ||
    reason === "userRateLimitExceeded"
  ) {
    return new ClassifiedUploadError(message, FailureReason.RATE_LIMITED);
  }

  if (payload.error?.code && payload.error.code >= 500) {
    return new ClassifiedUploadError(message, FailureReason.NETWORK_TIMEOUT);
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

// Default-safe retry policy: only retry methods that are idempotent under the
// HTTP spec (GET, HEAD, PUT, DELETE, OPTIONS). Retrying POST risks duplicate
// resumable upload sessions and duplicate playlist entries when a 5xx lands
// after the server already accepted the call (ISSUE-025, ISSUE-045). Callers
// that know their POST is safe to retry can pass { retryNonIdempotent: true }.
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

async function fetchWithTransientRetries(
  input: string | URL,
  init: RequestInit,
  options: { retryNonIdempotent?: boolean } = {}
) {
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  const method = (init.method || "GET").toUpperCase();
  const canRetry = options.retryNonIdempotent || IDEMPOTENT_METHODS.has(method);
  const maxAttempts = canRetry ? 3 : 1;
  let lastNetworkError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!retryableStatuses.has(response.status) || attempt === maxAttempts - 1) {
        return response;
      }
    } catch (error) {
      lastNetworkError = error;
      if (attempt === maxAttempts - 1) {
        throw new ClassifiedUploadError(
          error instanceof Error ? error.message : "Network request failed.",
          FailureReason.NETWORK_TIMEOUT
        );
      }
    }

    await sleep(500 * 2 ** attempt);
  }

  throw new ClassifiedUploadError(
    lastNetworkError instanceof Error ? lastNetworkError.message : "Network request failed.",
    FailureReason.NETWORK_TIMEOUT
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string) {
  const compactValue = value.replace(/\s+/g, " ").trim();
  return compactValue.length > 180 ? `${compactValue.slice(0, 180)}...` : compactValue;
}

// Reaper for items that flipped to UPLOADING but never reached a terminal
// state (process killed mid-upload, function timeout, etc.). Without this,
// a crashed upload leaves the queue item visibly stuck (ISSUE-024).
// staleMinutes default is generous enough that legitimate long uploads
// finish before being reaped.
export async function reapStaleUploads(staleMinutes = 90) {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const stale = await prisma.queueItem.findMany({
    where: { status: QueueStatus.UPLOADING, lastActionAt: { lt: cutoff } },
    select: { id: true, userId: true }
  });
  if (!stale.length) {
    return { reaped: 0 };
  }

  await prisma.$transaction([
    prisma.queueItem.updateMany({
      where: { id: { in: stale.map((item) => item.id) } },
      data: {
        failureReason: FailureReason.NETWORK_TIMEOUT,
        lastActionAt: new Date(),
        lastError: "Upload exceeded the maximum runtime and was reaped as failed.",
        status: QueueStatus.FAILED
      }
    }),
    prisma.activityLogEntry.createMany({
      data: stale.map((item) => ({
        actorType: "system",
        message: "Reaped stuck UPLOADING item after exceeding the stale-upload threshold.",
        queueItemId: item.id,
        userId: item.userId
      }))
    })
  ]);
  await Promise.all(
    stale.map((item) =>
      notifyQueueEvent({
        queueItemId: item.id,
        type: "upload_failed",
        userId: item.userId
      })
    )
  );

  return { reaped: stale.length };
}

function formatBytes(bytes: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
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

class PostVideoUploadError extends ClassifiedUploadError {
  constructor(
    error: ClassifiedUploadError,
    readonly videoId: string
  ) {
    super(error.message, error.reason);
    this.name = "PostVideoUploadError";
  }
}

class PlaylistInsertAfterUploadError extends PostVideoUploadError {
  constructor(error: ClassifiedUploadError, videoId: string) {
    super(error, videoId);
    this.name = "PlaylistInsertAfterUploadError";
  }
}
