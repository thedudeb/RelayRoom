import { NextRequest, NextResponse } from "next/server";
import { getQueueItemsForDemo } from "@/lib/data/repository";
import type { QueueStatus } from "@/lib/domain/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") as QueueStatus | null;
  const pipelineId = searchParams.get("pipelineId");
  const queueItems = await getQueueItemsForDemo();

  const items = queueItems.filter((item) => {
    if (status && item.status !== status) return false;
    if (pipelineId && item.pipelineId !== pipelineId) return false;
    return true;
  });

  return NextResponse.json({ items, count: items.length });
}
