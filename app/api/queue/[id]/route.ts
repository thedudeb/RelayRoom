import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { demoTimezone } from "@/lib/data/seed";
import {
  getPipelinesForDemo,
  getPipelinesForUser,
  getQueueItemsForDemo,
  getQueueItemsForUser
} from "@/lib/data/repository";
import { evaluatePipelineRules } from "@/lib/rules/rule-engine";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await getApiAccess(request.nextUrl.searchParams);

  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const [queueItems, pipelines] = access.isDemo
    ? await Promise.all([getQueueItemsForDemo(), getPipelinesForDemo()])
    : await Promise.all([
        getQueueItemsForUser(access.userId),
        getPipelinesForUser(access.userId)
      ]);
  const item = queueItems.find((queueItem) => queueItem.id === id);
  if (!item) {
    return NextResponse.json({ error: "Queue item not found." }, { status: 404 });
  }

  const pipeline = pipelines.find((candidate) => candidate.id === item.pipelineId);
  const evaluation = pipeline
    ? evaluatePipelineRules(
        pipeline,
        {
          id: item.driveFileId,
          filename: item.filename,
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          createdTime: item.driveCreatedTime,
          sourceFolderId: pipeline.sourceFolderId
        },
        demoTimezone
      )
    : undefined;

  return NextResponse.json({
    item,
    evaluation,
    activityLog: [
      {
        at: item.detectedAt,
        actor: "system",
        message: "Detected file in watched Drive folder."
      },
      {
        at: item.lastActionAt,
        actor: "system",
        message: `Current status: ${item.status}.`
      }
    ]
  });
}
