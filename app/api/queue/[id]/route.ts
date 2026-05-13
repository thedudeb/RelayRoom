import { NextRequest, NextResponse } from "next/server";
import { demoTimezone } from "@/lib/data/seed";
import { getPipelinesForDemo, getQueueItemsForDemo } from "@/lib/data/repository";
import { evaluatePipelineRules } from "@/lib/rules/rule-engine";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [queueItems, pipelines] = await Promise.all([
    getQueueItemsForDemo(),
    getPipelinesForDemo()
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
