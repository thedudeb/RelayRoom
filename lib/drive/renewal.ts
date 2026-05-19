import { PipelineStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { renewalCutoff, subscribeDriveFolderWatch } from "@/lib/drive/watch";

// Renew Drive push channels that are due to expire and backfill any
// enabled pipelines that don't yet have a channel. Soft-capped per tick
// so an outage of Google's watch endpoint can't make the cron tick run
// arbitrarily long.
const RENEWAL_BATCH_LIMIT = 10;

export async function renewDriveWatchSubscriptions({
  webhookUrl
}: {
  webhookUrl: string;
}) {
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    return { renewed: 0, failed: 0 };
  }

  const cutoff = renewalCutoff();
  const dueForRenewal = await prisma.pipeline.findMany({
    where: {
      archivedAt: null,
      status: PipelineStatus.ENABLED,
      OR: [{ driveChannelId: null }, { driveChannelExpiresAt: { lt: cutoff } }]
    },
    include: { driveConnection: true },
    take: RENEWAL_BATCH_LIMIT,
    orderBy: { driveChannelExpiresAt: "asc" }
  });

  let renewed = 0;
  let failed = 0;

  for (const pipeline of dueForRenewal) {
    try {
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
      renewed += 1;
    } catch (error) {
      failed += 1;
      console.warn("Drive watch renewal failed.", { pipelineId: pipeline.id, error });
    }
  }

  return { renewed, failed };
}
