import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo } from "@/lib/data/repository";
import { prisma } from "@/lib/db/prisma";
import { csvResponse, toCsv } from "@/lib/export/csv";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const access = await getApiAccess(searchParams, request);
  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rows = access.isDemo
    ? await getDemoActivityRows()
    : await getActivityRows({
        userId:
          access.authMethod === "api_key"
            ? access.userId
            : searchParams.get("userId") || undefined
      });

  return csvResponse(
    toCsv(rows, [
      "id",
      "created_at",
      "actor",
      "message",
      "filename",
      "status",
      "owner",
      "pipeline",
      "bulk_batch_id",
      "bulk_action",
      "bulk_size"
    ]),
    `relayroom-activity-${new Date().toISOString().slice(0, 10)}.csv`
  );
}

async function getActivityRows({ userId }: { userId?: string }) {
  const entries = await prisma.activityLogEntry.findMany({
    where: userId ? { queueItem: { userId } } : {},
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      actorType: true,
      createdAt: true,
      id: true,
      message: true,
      metadata: true,
      queueItem: {
        select: {
          filename: true,
          pipeline: { select: { name: true } },
          status: true,
          user: { select: { email: true } }
        }
      },
      user: { select: { email: true } }
    }
  });

  return entries.map((entry) => {
    const bulk = bulkMetadata(entry.metadata);
    return {
      id: entry.id,
      created_at: entry.createdAt.toISOString(),
      actor: entry.user?.email || entry.actorType,
      message: entry.message,
      filename: entry.queueItem.filename,
      status: entry.queueItem.status.toLowerCase(),
      owner: entry.queueItem.user.email,
      pipeline: entry.queueItem.pipeline.name,
      bulk_batch_id: bulk?.batchId || "",
      bulk_action: bulk?.action || "",
      bulk_size: bulk?.size || ""
    };
  });
}

async function getDemoActivityRows() {
  const items = await getQueueItemsForDemo();
  return items.flatMap((item) => [
    {
      id: `${item.id}-detected`,
      created_at: item.detectedAt,
      actor: "system",
      message: "Detected file in watched Drive folder.",
      filename: item.filename,
      status: item.status,
      owner: item.owner.email,
      pipeline: item.pipelineName,
      bulk_batch_id: "",
      bulk_action: "",
      bulk_size: ""
    },
    {
      id: `${item.id}-current`,
      created_at: item.lastActionAt,
      actor: item.status === "externally_handled" ? "operator" : "system",
      message:
        item.status === "failed"
          ? item.lastError || "Upload failed."
          : `Current status: ${item.status.replaceAll("_", " ")}.`,
      filename: item.filename,
      status: item.status,
      owner: item.owner.email,
      pipeline: item.pipelineName,
      bulk_batch_id: "",
      bulk_action: "",
      bulk_size: ""
    }
  ]);
}

function bulkMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata as {
    bulkAction?: unknown;
    bulkBatchId?: unknown;
    bulkSize?: unknown;
  };
  if (
    typeof value.bulkAction !== "string" ||
    typeof value.bulkBatchId !== "string" ||
    typeof value.bulkSize !== "number"
  ) {
    return null;
  }

  return {
    action: value.bulkAction,
    batchId: value.bulkBatchId,
    size: value.bulkSize
  };
}
