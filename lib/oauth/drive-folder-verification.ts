import { ConnectionStatus, type OAuthConnection } from "@prisma/client";
import { getUsableDriveAccessToken } from "@/lib/detection/drive-detection";
import { areGoogleIntegrationsPaused } from "@/lib/google/integrations";
import { logGoogleApiError } from "@/lib/oauth/google-errors";

// Verifies that a user-supplied Drive folder id actually points at a live,
// accessible folder before we save it on a pipeline — guards against typos,
// pasted file ids, trashed folders, and ids the connection can't reach.

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
// Cheap syntactic pre-filter so we don't spend a Drive API call on obviously
// malformed ids.
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

type DriveConnectionForVerification = Pick<
  OAuthConnection,
  "encryptedAccessToken" | "encryptedRefreshToken" | "expiresAt" | "id" | "status"
>;

interface DriveFileResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  id?: string;
  mimeType?: string;
  name?: string;
  trashed?: boolean;
}

/** Syntactic check only — does not confirm the folder exists or is reachable. */
export function isValidDriveFolderId(folderId: string) {
  return DRIVE_ID_PATTERN.test(folderId.trim());
}

/**
 * Resolves a folder id against the Drive API using the given connection's token.
 * Returns `{ id, name }` only when the id is well-formed, the connection is
 * active, and Drive confirms a non-trashed folder (not a file) with a matching
 * id. Returns null on any failure so callers treat verification as "rejected"
 * rather than distinguishing error causes.
 */
export async function verifyDriveFolderSelection({
  connection,
  folderId,
  tokenKey
}: {
  connection: DriveConnectionForVerification;
  folderId: string;
  tokenKey: string;
}) {
  if (areGoogleIntegrationsPaused()) {
    return null;
  }

  const normalizedFolderId = folderId.trim();
  if (!isValidDriveFolderId(normalizedFolderId)) {
    return null;
  }

  if (connection.status !== ConnectionStatus.ACTIVE) {
    return null;
  }

  const accessToken = await getUsableDriveAccessToken(connection, tokenKey);
  if (!accessToken) {
    return null;
  }

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(normalizedFolderId)}`
  );
  url.searchParams.set("fields", "id,name,mimeType,trashed");
  // supportsAllDrives lets the lookup resolve folders living in Shared Drives,
  // not just the user's My Drive.
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as DriveFileResponse;

  if (!response.ok || payload.error) {
    logGoogleApiError("Drive folder verification failed.", response, payload);
    return null;
  }

  // Reject anything that isn't exactly the folder we asked for: a mismatched id
  // (shouldn't happen, but be defensive), a non-folder file, or a trashed folder.
  if (
    payload.id !== normalizedFolderId ||
    payload.mimeType !== DRIVE_FOLDER_MIME_TYPE ||
    payload.trashed
  ) {
    return null;
  }

  return {
    id: payload.id,
    name: payload.name?.trim() || "Selected Drive folder"
  };
}
