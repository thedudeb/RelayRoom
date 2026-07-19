import { ConnectionKind, ConnectionStatus, PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { areGoogleIntegrationsPaused } from "@/lib/google/integrations";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";
import { decryptToken, oauthTokenAad } from "@/lib/security/token-vault";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originError = rejectCrossSiteMutation(request);
  if (originError) {
    return originError;
  }

  const access = await getApiAccess(request.nextUrl.searchParams);
  if (!access || access.isDemo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const connection = await prisma.oAuthConnection.findFirst({
    where: {
      id,
      userId: access.userId
    },
    select: {
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      id: true,
      kind: true,
      label: true
    }
  });

  if (!connection) {
    return NextResponse.json({ error: "ConnectionNotFound" }, { status: 404 });
  }

  if (!areGoogleIntegrationsPaused()) {
    const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!tokenKey) {
      return NextResponse.json({ error: "MissingTokenKey" }, { status: 400 });
    }

    const revoked = await revokeGoogleToken(connection, tokenKey);
    if (!revoked) {
      return NextResponse.json({ error: "DisconnectFailed" }, { status: 502 });
    }
  }

  const pipelineWhere =
    connection.kind === ConnectionKind.DRIVE
      ? { archivedAt: null, driveConnectionId: connection.id, userId: access.userId }
      : { archivedAt: null, youtubeConnectionId: connection.id, userId: access.userId };

  await prisma.$transaction([
    prisma.oAuthConnection.update({
      where: { id: connection.id },
      data: {
        // SPEC §4.2 requires stored credentials to be removed on disconnect.
        // Wipe both access and refresh material; downstream pipelines reference
        // the connection by id so historical context is preserved without keeping
        // a usable refresh token in the vault.
        encryptedAccessToken: null,
        encryptedRefreshToken: "",
        errorMessage: "Disconnected by operator. Reconnect to resume dependent pipelines.",
        status: ConnectionStatus.ERRORED
      }
    }),
    prisma.pipeline.updateMany({
      where: pipelineWhere,
      data: {
        errorMessage: `${connection.label} was disconnected. Reconnect this connection before running detection or uploads.`,
        status: PipelineStatus.ERRORED
      }
    })
  ]);

  revalidatePath("/connections");
  revalidatePath("/pipelines");
  return NextResponse.json({ ok: true });
}

async function revokeGoogleToken(
  connection: {
    encryptedAccessToken: string | null;
    encryptedRefreshToken: string;
    id: string;
  },
  tokenKey: string
) {
  const encryptedToken = connection.encryptedAccessToken || connection.encryptedRefreshToken;
  const token = decryptToken(encryptedToken, tokenKey, oauthTokenAad(connection.id));
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    body: new URLSearchParams({ token }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    method: "POST"
  });

  if (!response.ok && response.status !== 400) {
    console.error("Google token revoke failed.", {
      connectionId: connection.id,
      status: response.status
    });
    return false;
  }

  return true;
}
