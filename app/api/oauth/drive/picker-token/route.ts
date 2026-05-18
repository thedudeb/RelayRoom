import { ConnectionKind, ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { markConnectionRefreshFailed } from "@/lib/oauth/connection-health";
import { decryptToken, encryptToken } from "@/lib/security/token-vault";

interface GoogleRefreshResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { disabledAt: true, id: true }
  });

  if (!user || user.disabledAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_PICKER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "MissingGooglePickerApiKey" }, { status: 400 });
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    return NextResponse.json({ error: "MissingTokenKey" }, { status: 400 });
  }

  const driveConnection = await prisma.oAuthConnection.findFirst({
    where: {
      kind: ConnectionKind.DRIVE,
      status: ConnectionStatus.ACTIVE,
      userId: user.id
    },
    orderBy: { connectedAt: "desc" }
  });

  if (!driveConnection?.encryptedAccessToken || !driveConnection.encryptedRefreshToken) {
    return NextResponse.json({ error: "MissingDriveConnection" }, { status: 400 });
  }

  const accessToken = await getUsableDriveAccessToken(driveConnection, tokenKey);
  if (!accessToken) {
    return NextResponse.json({ error: "TokenRefreshFailed" }, { status: 502 });
  }

  return NextResponse.json({
    accessToken,
    apiKey,
    appId: getPickerAppId()
  });
}

async function getUsableDriveAccessToken(
  connection: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string;
    expiresAt: Date | null;
    id: string;
  },
  tokenKey: string
) {
  if (
    connection.encryptedAccessToken &&
    connection.expiresAt &&
    connection.expiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptToken(connection.encryptedAccessToken, tokenKey);
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
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
  const payload = (await response.json()) as GoogleRefreshResponse;

  if (!response.ok || !payload.access_token || payload.error) {
    console.error("Drive token refresh failed.", payload);
    await markConnectionRefreshFailed({
      connectionId: connection.id,
      kind: ConnectionKind.DRIVE,
      message: "Google Drive token refresh failed. Reconnect Drive and enable affected pipelines."
    });
    return null;
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

function getPickerAppId() {
  const configuredAppId = process.env.GOOGLE_PICKER_APP_ID;
  if (configuredAppId) {
    return configuredAppId;
  }

  return process.env.GOOGLE_DRIVE_CLIENT_ID?.split("-")[0] || "";
}
