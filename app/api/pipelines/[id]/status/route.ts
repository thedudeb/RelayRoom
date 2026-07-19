import { PipelineStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getApiAccess } from "@/lib/auth/account";
import { prisma } from "@/lib/db/prisma";
import { stopDriveWatchChannel, subscribeDriveFolderWatch } from "@/lib/drive/watch";
import {
  areGoogleIntegrationsPaused,
  googleIntegrationsPausedResponse
} from "@/lib/google/integrations";
import { rejectCrossSiteMutation } from "@/lib/security/request-guard";

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
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  const nextStatus =
    body.status === "enabled"
      ? PipelineStatus.ENABLED
      : body.status === "disabled"
        ? PipelineStatus.DISABLED
        : undefined;

  if (!id || !nextStatus) {
    return NextResponse.json({ error: "MissingPipelineFields" }, { status: 400 });
  }

  const googleIntegrationsPaused = areGoogleIntegrationsPaused();
  if (googleIntegrationsPaused && nextStatus === PipelineStatus.ENABLED) {
    return googleIntegrationsPausedResponse();
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: {
      archivedAt: null,
      id,
      userId: access.userId
    },
    include: {
      driveConnection: true
    }
  });

  if (!pipeline) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }

  const result = await prisma.pipeline.updateMany({
    where: {
      archivedAt: null,
      id,
      userId: access.userId
    },
    data: {
      status: nextStatus,
      ...(nextStatus === PipelineStatus.ENABLED
        ? { errorMessage: null, processedFromTime: new Date() }
        : {}),
      ...(googleIntegrationsPaused && nextStatus === PipelineStatus.DISABLED
        ? {
            driveChannelExpiresAt: null,
            driveChannelId: null,
            driveChannelResourceId: null,
            driveChannelToken: null
          }
        : {})
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "PipelineNotFound" }, { status: 404 });
  }

  // Subscribe / unsubscribe the Drive push channel as a side effect of the
  // status flip. Failures are non-fatal: polling still works as a backstop,
  // and the renewal cron can re-attempt subscription on the next tick.
  if (!googleIntegrationsPaused) {
    await syncDriveWatchSubscription({
      nextStatus,
      pipeline,
      request
    }).catch((error) => {
      console.error("Drive watch sync failed.", { pipelineId: pipeline.id, error });
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/pipelines");
  return NextResponse.json({ status: nextStatus.toLowerCase() });
}

async function syncDriveWatchSubscription({
  nextStatus,
  pipeline,
  request
}: {
  nextStatus: PipelineStatus;
  pipeline: {
    id: string;
    sourceFolderId: string;
    driveChannelId: string | null;
    driveChannelResourceId: string | null;
    driveChannelExpiresAt: Date | null;
    driveConnection: Parameters<typeof subscribeDriveFolderWatch>[0]["driveConnection"];
  };
  request: NextRequest;
}) {
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    return;
  }
  const webhookUrl = process.env.DRIVE_WATCH_WEBHOOK_URL
    || `${request.nextUrl.origin}/api/webhooks/drive`;

  if (nextStatus === PipelineStatus.DISABLED) {
    if (pipeline.driveChannelId && pipeline.driveChannelResourceId) {
      try {
        await stopDriveWatchChannel({
          channelId: pipeline.driveChannelId,
          resourceId: pipeline.driveChannelResourceId,
          driveConnection: pipeline.driveConnection,
          tokenKey
        });
      } catch (error) {
        console.warn("Drive watch stop failed (continuing).", error);
      }
      await prisma.pipeline.update({
        where: { id: pipeline.id },
        data: {
          driveChannelId: null,
          driveChannelResourceId: null,
          driveChannelToken: null,
          driveChannelExpiresAt: null
        }
      });
    }
    return;
  }

  // ENABLED: subscribe if not already, or refresh if expired.
  const now = new Date();
  if (
    pipeline.driveChannelId &&
    pipeline.driveChannelExpiresAt &&
    pipeline.driveChannelExpiresAt > now
  ) {
    return;
  }

  const subscription = await subscribeDriveFolderWatch({
    folderId: pipeline.sourceFolderId,
    pipelineId: pipeline.id,
    driveConnection: pipeline.driveConnection,
    tokenKey,
    webhookUrl
  });
  await prisma.pipeline.update({
    where: { id: pipeline.id },
    data: {
      driveChannelId: subscription.channelId,
      driveChannelResourceId: subscription.resourceId,
      driveChannelToken: subscription.channelToken,
      driveChannelExpiresAt: subscription.expiresAt
    }
  });
}
