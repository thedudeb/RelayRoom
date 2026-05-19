import { ConnectionStatus, type OAuthConnection } from "@prisma/client";
import { getUsableDriveAccessToken } from "@/lib/detection/drive-detection";
import { logGoogleApiError } from "@/lib/oauth/google-errors";

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
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

export function isValidDriveFolderId(folderId: string) {
  return DRIVE_ID_PATTERN.test(folderId.trim());
}

export async function verifyDriveFolderSelection({
  connection,
  folderId,
  tokenKey
}: {
  connection: DriveConnectionForVerification;
  folderId: string;
  tokenKey: string;
}) {
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
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = (await response.json()) as DriveFileResponse;

  if (!response.ok || payload.error) {
    logGoogleApiError("Drive folder verification failed.", response, payload);
    return null;
  }

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
