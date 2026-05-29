import { ConnectionKind, ConnectionStatus, PipelineStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * Marks an OAuth connection as errored after a token refresh fails (e.g. the
 * user revoked access) and cascades that error onto every active pipeline that
 * depends on it, so the dashboard shows the real cause rather than silently
 * stalling. Wrapped in a transaction so the connection and pipelines never end
 * up in inconsistent states.
 */
export async function markConnectionRefreshFailed({
  connectionId,
  kind,
  message
}: {
  connectionId: string;
  kind: ConnectionKind;
  message: string;
}) {
  // A connection plugs into a pipeline as either its Drive source or its
  // YouTube destination; pick the matching foreign key to find dependents.
  const pipelineWhere =
    kind === ConnectionKind.DRIVE
      ? { driveConnectionId: connectionId }
      : { youtubeConnectionId: connectionId };

  await prisma.$transaction([
    prisma.oAuthConnection.updateMany({
      where: { id: connectionId },
      data: {
        // Clear the (now-useless) access token; the refresh token is kept so a
        // later reconnect/repair can attempt recovery.
        encryptedAccessToken: null,
        errorMessage: message,
        status: ConnectionStatus.ERRORED
      }
    }),
    prisma.pipeline.updateMany({
      where: {
        ...pipelineWhere,
        // Don't resurrect archived pipelines just to flag an error on them.
        archivedAt: null
      },
      data: {
        errorMessage: message,
        status: PipelineStatus.ERRORED
      }
    })
  ]);
}
