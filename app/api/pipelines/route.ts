import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import {
  getPipelinesForDemo,
  getPipelinesForUser,
  getQueueItemsForDemo,
  getQueueItemsForUser
} from "@/lib/data/repository";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const access = await getApiAccess(searchParams, request);

  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const userId = searchParams.get("userId") || undefined;
  const [pipelineData, queueItems] = access.isDemo
    ? await Promise.all([getPipelinesForDemo(), getQueueItemsForDemo()])
    : await Promise.all([
        getPipelinesForUser(access.userId, { userId }),
        getQueueItemsForUser(access.userId, { userId })
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
