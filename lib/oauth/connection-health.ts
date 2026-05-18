import { ConnectionKind, ConnectionStatus, PipelineStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function markConnectionRefreshFailed({
  connectionId,
  kind,
  message
}: {
  connectionId: string;
  kind: ConnectionKind;
  message: string;
}) {
  const pipelineWhere =
    kind === ConnectionKind.DRIVE
      ? { driveConnectionId: connectionId }
      : { youtubeConnectionId: connectionId };

  await prisma.$transaction([
    prisma.oAuthConnection.updateMany({
      where: { id: connectionId },
      data: {
        encryptedAccessToken: null,
        errorMessage: message,
        status: ConnectionStatus.ERRORED
      }
    }),
    prisma.pipeline.updateMany({
      where: {
        ...pipelineWhere,
        archivedAt: null
      },
      data: {
        errorMessage: message,
        status: PipelineStatus.ERRORED
      }
    })
  ]);
}
