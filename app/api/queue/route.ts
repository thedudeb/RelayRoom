import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo, getQueueItemsForUser } from "@/lib/data/repository";
import type { QueueStatus } from "@/lib/domain/types";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") as QueueStatus | null;
  const pipelineId = searchParams.get("pipelineId");
  const detectedFrom = parseOptionalDate(
    searchParams.get("detectedFrom") || searchParams.get("dateFrom") || searchParams.get("from")
  );
  const detectedTo = parseOptionalDate(
    searchParams.get("detectedTo") || searchParams.get("dateTo") || searchParams.get("to")
  );
  const access = await getApiAccess(searchParams, request);

  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (detectedFrom === "invalid" || detectedTo === "invalid") {
    return NextResponse.json(
      { error: "Invalid date range. Use ISO dates such as 2026-05-18 or 2026-05-18T12:00:00Z." },
      { status: 400 }
    );
  }

  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId, { userId: access.userId });

  const items = queueItems.filter((item) => {
    if (status && item.status !== status) return false;
    if (pipelineId && item.pipelineId !== pipelineId) return false;
    const detectedAt = new Date(item.detectedAt).getTime();
    if (detectedFrom && detectedAt < detectedFrom.getTime()) return false;
    if (detectedTo && detectedAt > detectedTo.getTime()) return false;
    return true;
  });

  const counts = items.reduce<Record<string, number>>((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, {});

  return NextResponse.json({ items, count: items.length, counts });
}

function parseOptionalDate(value: string | null): Date | "invalid" | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}
