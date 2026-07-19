import { FailureReason, QueueStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { areGoogleIntegrationsPaused, googleIntegrationsPausedResponse } from "@/lib/google/integrations";
import { authorizeCronRequest } from "@/lib/security/cron-auth";
import { uploadQueueItemToYouTube } from "@/lib/upload/youtube-upload";

export const dynamic = "force-dynamic";

// Soft per-invocation time budget. Vercel function timeouts cap us above
// this; we exit early so a slow upload chain doesn't get cut off mid-stream.
const DEFAULT_TIME_BUDGET_MS = 50_000;
const DEFAULT_MAX_ITEMS = 5;
const MAX_ITEMS_HARD_CAP = 25;

export async function GET(request: NextRequest) {
  if (areGoogleIntegrationsPaused()) {
    return googleIntegrationsPausedResponse();
  }

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
    const claimed = await claimNextUploadCandidate();
    if (!claimed) {
      break;
    }

    try {
      // The claim transaction already flipped the item to UPLOADING for
      // concurrency control. Restore the original status momentarily for the
      // trigger guard, then let the upload code drive the rest of the lifecycle.
      await prisma.queueItem.update({
        where: { id: claimed.id },
        data: { status: claimed.previousStatus }
      });
      await uploadQueueItemToYouTube({
        queueItemId: claimed.id,
        trigger: claimed.trigger,
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

// Atomically pick upload work. Fresh DETECTED items go first; transient FAILED
// items become due again based on their accumulated attempt count and
// lastActionAt timestamp. This gives us queue-level exponential backoff without
// adding scheduler columns.
async function claimNextUploadCandidate() {
  const candidates = await prisma.queueItem.findMany({
    where: {
      OR: [
        { status: QueueStatus.DETECTED },
        {
          failureReason: { in: transientFailureReasons },
          status: QueueStatus.FAILED
        }
      ]
    },
    orderBy: [{ status: "asc" }, { detectedAt: "asc" }],
    select: {
      _count: { select: { attempts: true } },
      detectedAt: true,
      failureReason: true,
      id: true,
      lastActionAt: true,
      status: true,
      userId: true
    },
    take: 25
  });

  const candidate = candidates.find((item) => item.status === QueueStatus.DETECTED || isRetryDue(item));
  if (!candidate) return null;

  const claim = await prisma.queueItem.updateMany({
    where: { id: candidate.id, status: candidate.status },
    data: { status: QueueStatus.UPLOADING, lastActionAt: new Date() }
  });
  if (claim.count === 0) {
    return null;
  }

  return {
    id: candidate.id,
    trigger: candidate.status === QueueStatus.DETECTED ? ("auto" as const) : ("retry" as const),
    previousStatus: candidate.status,
    userId: candidate.userId
  };
}

const transientFailureReasons: FailureReason[] = [
  FailureReason.NETWORK_TIMEOUT,
  FailureReason.RATE_LIMITED
];
const MAX_AUTO_RETRY_ATTEMPTS = 4;

function isRetryDue(candidate: {
  _count: { attempts: number };
  failureReason: FailureReason | null;
  lastActionAt: Date;
  status: QueueStatus;
}) {
  if (
    candidate.status !== QueueStatus.FAILED ||
    !candidate.failureReason ||
    !transientFailureReasons.includes(candidate.failureReason)
  ) {
    return false;
  }

  if (candidate._count.attempts >= MAX_AUTO_RETRY_ATTEMPTS) {
    return false;
  }

  const delayMinutes = Math.min(60, 2 ** Math.max(0, candidate._count.attempts - 1));
  return Date.now() - candidate.lastActionAt.getTime() >= delayMinutes * 60_000;
}

function parsePositiveNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
