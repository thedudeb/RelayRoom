import { NextRequest, NextResponse } from "next/server";
import { getApiAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo, getQueueItemsForUser } from "@/lib/data/repository";
import type { QueueItem, QueueStatus } from "@/lib/domain/types";
import { csvResponse, toCsv } from "@/lib/export/csv";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const access = await getApiAccess(searchParams, request);
  if (!access) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const detectedFrom = parseOptionalDate(searchParams.get("detectedFrom"));
  const detectedTo = parseOptionalDate(searchParams.get("detectedTo"));
  if (detectedFrom === "invalid" || detectedTo === "invalid") {
    return NextResponse.json({ error: "Invalid date range." }, { status: 400 });
  }

  const ownerFilter =
    !access.isDemo && access.authMethod === "api_key"
      ? { userId: access.userId }
      : !access.isDemo && searchParams.get("userId")
        ? { userId: searchParams.get("userId")! }
        : undefined;
  const items = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId, ownerFilter);

  const filtered = filterQueueItems(items, {
    detectedFrom,
    detectedTo,
    pipelineName: searchParams.get("pipeline") || undefined,
    ruleName: searchParams.get("rule") || undefined,
    sort: searchParams.get("sort") || undefined,
    status: searchParams.get("status") as QueueStatus | null
  });

  const rows = filtered.map((item) => ({
    id: item.id,
    filename: item.filename,
    status: item.status,
    owner: item.owner.email,
    pipeline: item.pipelineName,
    source_folder: item.sourceFolderName,
    playlist: item.intendedPlaylistName || "",
    matched_rule: item.matchedRuleName || "",
    detected_at: item.detectedAt,
    last_action_at: item.lastActionAt,
    failure_reason: item.failureReason || "",
    last_error: item.lastError || "",
    youtube_url: item.youtubeUrl || "",
    drive_file_id: item.driveFileId
  }));

  return csvResponse(
    toCsv(rows, [
      "id",
      "filename",
      "status",
      "owner",
      "pipeline",
      "source_folder",
      "playlist",
      "matched_rule",
      "detected_at",
      "last_action_at",
      "failure_reason",
      "last_error",
      "youtube_url",
      "drive_file_id"
    ]),
    `relayroom-queue-${dateStamp()}.csv`
  );
}

function filterQueueItems(
  items: QueueItem[],
  filters: {
    detectedFrom: Date | "invalid" | null;
    detectedTo: Date | "invalid" | null;
    pipelineName?: string;
    ruleName?: string;
    sort?: string;
    status?: QueueStatus | null;
  }
) {
  return items
    .filter((item) => !filters.status || item.status === filters.status)
    .filter((item) => !filters.pipelineName || item.pipelineName === filters.pipelineName)
    .filter((item) => {
      if (!filters.ruleName) return true;
      if (filters.ruleName === "__no_rule") return !item.matchedRuleName;
      return item.matchedRuleName === filters.ruleName;
    })
    .filter((item) => {
      const detectedAt = new Date(item.detectedAt).getTime();
      if (filters.detectedFrom && filters.detectedFrom !== "invalid" && detectedAt < filters.detectedFrom.getTime()) {
        return false;
      }
      if (filters.detectedTo && filters.detectedTo !== "invalid" && detectedAt > endOfDay(filters.detectedTo).getTime()) {
        return false;
      }
      return true;
    })
    .sort((a, b) => compareQueueItems(a, b, filters.sort));
}

function compareQueueItems(a: QueueItem, b: QueueItem, sort?: string) {
  if (sort === "filename_asc") return a.filename.localeCompare(b.filename);
  if (sort === "status_asc") return a.status.localeCompare(b.status);
  if (sort === "last_action_desc") {
    return new Date(b.lastActionAt).getTime() - new Date(a.lastActionAt).getTime();
  }
  return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
}

function parseOptionalDate(value: string | null): Date | "invalid" | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}
