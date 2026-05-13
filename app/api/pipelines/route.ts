import { NextResponse } from "next/server";
import { getPipelinesForDemo, getQueueItemsForDemo } from "@/lib/data/repository";

export async function GET() {
  const [pipelineData, queueItems] = await Promise.all([
    getPipelinesForDemo(),
    getQueueItemsForDemo()
  ]);

  const pipelines = pipelineData.map((pipeline) => {
    const items = queueItems.filter((item) => item.pipelineId === pipeline.id);
    return {
      ...pipeline,
      counts: {
        total: items.length,
        needsApproval: items.filter((item) => item.status === "needs_approval").length,
        needsRouting: items.filter((item) => item.status === "needs_routing").length,
        failed: items.filter((item) => item.status === "failed").length,
        uploadedToday: items.filter(
          (item) =>
            item.status === "uploaded" &&
            new Date(item.lastActionAt).toDateString() === new Date().toDateString()
        ).length
      }
    };
  });

  return NextResponse.json({ pipelines });
}
