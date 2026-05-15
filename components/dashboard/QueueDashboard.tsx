"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Play,
  RotateCcw,
  Route,
  SkipForward
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { QueueItem, QueueStatus } from "@/lib/domain/types";

type QueueTab = "all" | QueueStatus;
type SortMode = "detected_desc" | "filename_asc" | "status_asc" | "last_action_desc";
type QueueAction = "skip" | "restore" | "mark_externally_handled" | "route" | "upload";
type QueueActionPayload = {
  playlistId?: string;
  playlistName?: string;
  youtubeUrl?: string;
};
type ActionState =
  | {
      message: string;
      tone: "danger" | "success";
    }
  | undefined;

const demoNow = new Date("2026-05-13T16:00:00.000Z").getTime();

const tabs: { label: string; status?: QueueStatus }[] = [
  { label: "All" },
  { label: "Uploaded", status: "uploaded" },
  { label: "Failed", status: "failed" },
  { label: "Needs Approval", status: "needs_approval" },
  { label: "Needs Routing", status: "needs_routing" },
  { label: "Skipped", status: "skipped" },
  { label: "Externally Handled", status: "externally_handled" }
];

export function QueueDashboard({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("detected_desc");
  const [state, setState] = useState<ActionState>();
  const [busyAction, setBusyAction] = useState<{ itemId: string; action: QueueAction } | null>(
    null
  );

  const pipelineNames = useMemo(
    () => Array.from(new Set(items.map((item) => item.pipelineName))).sort(),
    [items]
  );

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => activeTab === "all" || item.status === activeTab)
      .filter((item) => pipelineFilter === "all" || item.pipelineName === pipelineFilter)
      .slice()
      .sort((a, b) => compareQueueItems(a, b, sortMode));
  }, [activeTab, items, pipelineFilter, sortMode]);

  const activeCounts = {
    approval: count(items, "needs_approval"),
    routing: count(items, "needs_routing"),
    failed: count(items, "failed"),
    uploaded: count(items, "uploaded")
  };

  async function runQueueAction(
    item: QueueItem,
    action: QueueAction,
    actionPayload: QueueActionPayload = {}
  ) {
    const youtubeUrl =
      action === "mark_externally_handled"
        ? window.prompt("Optional: paste the existing YouTube URL, or leave blank.")
        : actionPayload.youtubeUrl;

    if (youtubeUrl === null) {
      return;
    }

    setBusyAction({ itemId: item.id, action });
    setState(undefined);

    try {
      const response = await fetch(`/api/queue/${encodeURIComponent(item.id)}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...actionPayload, action, youtubeUrl })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(queueActionErrorMessage(payload.error));
      }

      setState({
        tone: "success",
        message: payload.message || "Queue item updated."
      });
      router.refresh();
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Queue action failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <section className="metric-grid" aria-label="Queue summary">
        <Metric label="Needs approval" tone="approval" value={activeCounts.approval} />
        <Metric label="Needs routing" tone="routing" value={activeCounts.routing} />
        <Metric label="Failed" tone="failed" value={activeCounts.failed} />
        <Metric label="Uploaded" tone="uploaded" value={activeCounts.uploaded} />
      </section>

      <section className="toolbar">
        <div className="tabs" aria-label="Queue status filters">
          {tabs.map((tab) => {
            const tabKey = tab.status || "all";
            const isActive = activeTab === tabKey;
            return (
            <button
              aria-pressed={isActive}
              className="tab"
              data-active={isActive}
              key={tab.label}
              onClick={() => setActiveTab(tabKey)}
              type="button"
            >
              {tab.label}
              <span className="muted">{tab.status ? count(items, tab.status) : items.length}</span>
            </button>
            );
          })}
        </div>
        <div className="filter-row">
          <select
            className="select"
            aria-label="Filter by pipeline"
            onChange={(event) => setPipelineFilter(event.target.value)}
            value={pipelineFilter}
          >
            <option value="all">All pipelines</option>
            {pipelineNames.map((pipelineName) => (
              <option key={pipelineName} value={pipelineName}>
                {pipelineName}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Sort queue"
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            <option value="detected_desc">Newest detected first</option>
            <option value="filename_asc">Filename</option>
            <option value="status_asc">Status</option>
            <option value="last_action_desc">Last action</option>
          </select>
        </div>
      </section>

      {state ? (
        <div className={`notice ${state.tone}`} role={state.tone === "danger" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Pipeline</th>
              <th>Detected</th>
              <th>Status</th>
              <th>Playlist</th>
              <th>Rule</th>
              <th>Last action</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <QueueRow
                busyAction={busyAction}
                item={item}
                key={item.id}
                onAction={runQueueAction}
              />
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 ? (
          <div className="empty-state">
            <strong>{items.length === 0 ? "No queue items yet." : "No queue items match these filters."}</strong>
            <p>
              {items.length === 0
                ? "Connect accounts and create a pipeline to start detecting recordings."
                : "Try another status tab or switch back to all pipelines."}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function QueueRow({
  busyAction,
  item,
  onAction
}: {
  busyAction: { itemId: string; action: QueueAction } | null;
  item: QueueItem;
  onAction: (item: QueueItem, action: QueueAction, payload?: QueueActionPayload) => void;
}) {
  return (
    <tr>
      <td>
        <strong>{item.filename}</strong>
        <div className="muted">{formatBytes(item.sizeBytes)} · {item.mimeType}</div>
      </td>
      <td>
        {item.pipelineName}
        <div className="muted">{item.sourceFolderName}</div>
      </td>
      <td title={formatAbsolute(item.detectedAt)}>{relativeAge(item.detectedAt, demoNow)}</td>
      <td>
        <StatusBadge busyAction={busyAction} itemId={item.id} status={item.status} />
        {item.failureReason ? <div className="muted">{item.failureReason}</div> : null}
      </td>
      <td>
        <PlaylistCell item={item} />
      </td>
      <td>{item.matchedRuleName || <span className="muted">No match</span>}</td>
      <td title={formatAbsolute(item.lastActionAt)}>{relativeAge(item.lastActionAt, demoNow)}</td>
      <td>
        <QueueActions busyAction={busyAction} item={item} onAction={onAction} />
      </td>
    </tr>
  );
}

function PlaylistCell({ item }: { item: QueueItem }) {
  const playlistId = item.youtubePlaylistId || item.intendedPlaylistId;

  if (!item.intendedPlaylistName) {
    return <span className="muted">Unassigned</span>;
  }

  if (!playlistId) {
    return <>{item.intendedPlaylistName}</>;
  }

  return (
    <a
      className="playlist-link"
      href={`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`}
      rel="noreferrer"
      target="_blank"
      title="Open YouTube playlist"
    >
      {item.intendedPlaylistName}
      <ExternalLink aria-hidden="true" size={13} />
    </a>
  );
}

function StatusBadge({
  busyAction,
  itemId,
  status
}: {
  busyAction: { itemId: string; action: QueueAction } | null;
  itemId: string;
  status: QueueStatus;
}) {
  const busyLabel =
    busyAction?.itemId === itemId && busyAction.action === "upload"
      ? status === "failed"
        ? "retrying upload"
        : "approving"
      : undefined;
  const icon = {
    detected: CircleDashed,
    needs_routing: Route,
    needs_approval: Play,
    uploading: CircleDashed,
    uploaded: CheckCircle2,
    failed: AlertCircle,
    skipped: SkipForward,
    externally_handled: ExternalLink
  }[status];
  const Icon = busyLabel ? CircleDashed : icon;

  return (
    <span className={`badge ${busyLabel ? "uploading" : status}`}>
      <Icon aria-hidden="true" size={14} />
      {busyLabel || status.replaceAll("_", " ")}
    </span>
  );
}

function QueueActions({
  busyAction,
  item,
  onAction
}: {
  busyAction: { itemId: string; action: QueueAction } | null;
  item: QueueItem;
  onAction: (item: QueueItem, action: QueueAction, payload?: QueueActionPayload) => void;
}) {
  const isBusy = busyAction?.itemId === item.id;
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(item.routingOptions?.[0]?.id || "");

  if (item.status === "uploaded") {
    return (
      <button
        className="icon-button"
        disabled={!item.youtubeUrl}
        onClick={() => item.youtubeUrl && window.open(item.youtubeUrl, "_blank", "noopener,noreferrer")}
        title={item.youtubeUrl ? "Open on YouTube" : "No YouTube URL recorded"}
        type="button"
      >
        <ExternalLink aria-hidden="true" size={16} />
      </button>
    );
  }

  if (item.status === "failed") {
    return (
      <div className="actions">
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "upload")}
          title="Retry upload"
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "mark_externally_handled")}
          title="Mark as already uploaded"
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "skip")}
          title="Skip item"
          type="button"
        >
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "needs_approval") {
    return (
      <div className="actions">
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "upload")}
          title="Approve upload"
          type="button"
        >
          <Play aria-hidden="true" size={16} />
        </button>
        <button className="icon-button" disabled title="Edit and route is coming next" type="button">
          <Route aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "mark_externally_handled")}
          title="Mark as already uploaded"
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "skip")}
          title="Skip item"
          type="button"
        >
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "needs_routing") {
    const selectedPlaylist = item.routingOptions?.find(
      (playlist) => playlist.id === selectedPlaylistId
    );

    return (
      <div className="actions">
        <select
          aria-label={`Route ${item.filename} to playlist`}
          className="select route-select"
          disabled={isBusy || !item.routingOptions?.length}
          onChange={(event) => setSelectedPlaylistId(event.target.value)}
          value={selectedPlaylistId}
        >
          {item.routingOptions?.length ? (
            item.routingOptions.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))
          ) : (
            <option value="">No playlists</option>
          )}
        </select>
        <button
          className="icon-button"
          disabled={isBusy || !selectedPlaylist}
          onClick={() =>
            selectedPlaylist &&
            onAction(item, "route", {
              playlistId: selectedPlaylist.id,
              playlistName: selectedPlaylist.name
            })
          }
          title={selectedPlaylist ? "Route to selected playlist" : "No playlist options"}
          type="button"
        >
          <Route aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "mark_externally_handled")}
          title="Mark as already uploaded"
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          disabled={isBusy}
          onClick={() => onAction(item, "skip")}
          title="Skip item"
          type="button"
        >
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "skipped") {
    return (
      <button
        className="icon-button"
        disabled={isBusy}
        onClick={() => onAction(item, "restore")}
        title="Restore to queue"
        type="button"
      >
        <RotateCcw aria-hidden="true" size={16} />
      </button>
    );
  }

  if (item.status === "externally_handled") {
    return (
      <button
        className="icon-button"
        disabled={isBusy}
        onClick={() => onAction(item, "restore")}
        title="Restore to queue"
        type="button"
      >
        <RotateCcw aria-hidden="true" size={16} />
      </button>
    );
  }

  return <span className="muted">None</span>;
}

function Metric({
  label,
  tone,
  value
}: {
  label: string;
  tone: "approval" | "failed" | "routing" | "uploaded";
  value: number;
}) {
  return (
    <div className="metric" data-tone={tone}>
      <span>
        <i aria-hidden="true" />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function count(items: QueueItem[], status: QueueStatus): number {
  return items.filter((item) => item.status === status).length;
}

function compareQueueItems(a: QueueItem, b: QueueItem, sortMode: SortMode): number {
  if (sortMode === "filename_asc") {
    return a.filename.localeCompare(b.filename);
  }

  if (sortMode === "status_asc") {
    return a.status.localeCompare(b.status);
  }

  if (sortMode === "last_action_desc") {
    return new Date(b.lastActionAt).getTime() - new Date(a.lastActionAt).getTime();
  }

  return new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime();
}

function formatBytes(bytes?: number): string {
  if (!bytes) {
    return "unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function relativeAge(isoDate: string, nowMs: number): string {
  const diffMs = nowMs - new Date(isoDate).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `${weeks}w`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months}mo`;
  return `${Math.round(days / 365)}yr`;
}

function formatAbsolute(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(isoDate));
}

function queueActionErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    MissingActiveDriveConnection: "Reconnect Google Drive before uploading.",
    MissingActiveYouTubeConnection: "Reconnect YouTube before uploading.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    TokenRefreshFailed: "Google could not refresh one of the OAuth tokens. Reconnect Drive and YouTube, then try again."
  };

  return messages[error || ""] || error || "Queue action failed.";
}
