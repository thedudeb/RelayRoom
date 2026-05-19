import { QueueStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authorizeCronRequest } from "@/lib/security/cron-auth";
import { uploadQueueItemToYouTube } from "@/lib/upload/youtube-upload";

export const dynamic = "force-dynamic";

// Soft per-invocation time budget. Vercel function timeouts cap us above
// this; we exit early so a slow upload chain doesn't get cut off mid-stream.
const DEFAULT_TIME_BUDGET_MS = 50_000;
const DEFAULT_MAX_ITEMS = 5;
const MAX_ITEMS_HARD_CAP = 25;

export async function GET(request: NextRequest) {
  const auth = authorizeCronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const startedAt = Date.now();
  const timeBudgetMs = parsePositiveNumber(
    request.nextUrl.searchParams.get("budgetMs"),
    DEFAULT_TIME_BUDGET_MS
  );
  const maxItems = Math.min(
    parsePositiveNumber(request.nextUrl.searchParams.get("limit"), DEFAULT_MAX_ITEMS),
    MAX_ITEMS_HARD_CAP
  );

  const results: Array<{
    queueItemId: string;
    status: "ok" | "failed" | "skipped";
    error?: string;
  }> = [];

  while (results.length < maxItems && Date.now() - startedAt < timeBudgetMs) {
    const claimed = await claimNextDetectedItem();
    if (!claimed) {
      break;
    }

    try {
      // The claim transaction already flipped the item to UPLOADING so
      // uploadQueueItemToYouTube's "auto" gate sees the original DETECTED
      // status. Restore it momentarily for the trigger check, then let the
      // upload code drive the rest of the lifecycle.
      await prisma.queueItem.update({
        where: { id: claimed.id },
        data: { status: QueueStatus.DETECTED }
      });
      await uploadQueueItemToYouTube({
        queueItemId: claimed.id,
        trigger: "auto",
        userId: claimed.userId
      });
      results.push({ queueItemId: claimed.id, status: "ok" });
    } catch (error) {
      results.push({
        queueItemId: claimed.id,
        status: "failed",
        error: error instanceof Error ? error.message : "UploadFailed"
      });
    }
  }

  return NextResponse.json({
    elapsedMs: Date.now() - startedAt,
    processed: results.length,
    results
  });
}

// Atomically pick the oldest DETECTED item and tentatively flip it to
// CLAIMING via UPLOADING. Concurrent workers see the status change in their
// updateMany filter and skip it. The stale-upload reaper from Wave 5 covers
// the case where a worker crashes mid-flight.
async function claimNextDetectedItem() {
  const candidate = await prisma.queueItem.findFirst({
    where: { status: QueueStatus.DETECTED },
    orderBy: { detectedAt: "asc" },
    select: { id: true, status: true, userId: true }
  });
  if (!candidate) {
    return null;
  }

  const claim = await prisma.queueItem.updateMany({
    where: { id: candidate.id, status: QueueStatus.DETECTED },
    data: { status: QueueStatus.UPLOADING, lastActionAt: new Date() }
  });
  if (claim.count === 0) {
    return null;
  }

  return { id: candidate.id, userId: candidate.userId };
}

function parsePositiveNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
