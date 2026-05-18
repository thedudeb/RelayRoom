import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo, getQueueItemsForUser } from "@/lib/data/repository";
import type { QueueStatus } from "@/lib/domain/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") as QueueStatus | null;
  const pipelineId = searchParams.get("pipelineId");
  const userId = searchParams.get("userId") || undefined;
  const access = await getApiAccess(searchParams, request);

  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId, { userId });

  const items = queueItems.filter((item) => {
    if (status && item.status !== status) return false;
    if (pipelineId && item.pipelineId !== pipelineId) return false;
    return true;
  });

  const counts = items.reduce<Record<string, number>>((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, {});

  return NextResponse.json({ items, count: items.length, counts });
}
