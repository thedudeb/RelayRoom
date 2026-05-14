import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo, getQueueItemsForUser } from "@/lib/data/repository";
import type { QueueStatus } from "@/lib/domain/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") as QueueStatus | null;
  const pipelineId = searchParams.get("pipelineId");
  const access = await getApiAccess(searchParams);

  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId);

  const items = queueItems.filter((item) => {
    if (status && item.status !== status) return false;
    if (pipelineId && item.pipelineId !== pipelineId) return false;
    return true;
  });

  return NextResponse.json({ items, count: items.length });
}
