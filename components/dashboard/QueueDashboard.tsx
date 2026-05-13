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
import { useMemo, useState } from "react";
import type { QueueItem, QueueStatus } from "@/lib/domain/types";

type QueueTab = "all" | QueueStatus;
type SortMode = "detected_desc" | "filename_asc" | "status_asc" | "last_action_desc";
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
  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("detected_desc");

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

  return (
    <>
      <section className="metric-grid" aria-label="Queue summary">
        <Metric label="Needs approval" value={activeCounts.approval} />
        <Metric label="Needs routing" value={activeCounts.routing} />
        <Metric label="Failed" value={activeCounts.failed} />
        <Metric label="Uploaded" value={activeCounts.uploaded} />
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
              <QueueRow item={item} key={item.id} />
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 ? (
          <div className="empty-state">
            <strong>No queue items match these filters.</strong>
            <p>Try another status tab or switch back to all pipelines.</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function QueueRow({ item }: { item: QueueItem }) {
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
        <StatusBadge status={item.status} />
        {item.failureReason ? <div className="muted">{item.failureReason}</div> : null}
      </td>
      <td>{item.intendedPlaylistName || <span className="muted">Unassigned</span>}</td>
      <td>{item.matchedRuleName || <span className="muted">No match</span>}</td>
      <td title={formatAbsolute(item.lastActionAt)}>{relativeAge(item.lastActionAt, demoNow)}</td>
      <td>
        <QueueActions item={item} />
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
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
  const Icon = icon;

  return (
    <span className={`badge ${status}`}>
      <Icon aria-hidden="true" size={14} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function QueueActions({ item }: { item: QueueItem }) {
  if (item.status === "uploaded") {
    return (
      <button className="icon-button" title="Open on YouTube" type="button">
        <ExternalLink aria-hidden="true" size={16} />
      </button>
    );
  }

  if (item.status === "failed") {
    return (
      <div className="actions">
        <button className="icon-button" title="Retry upload" type="button">
          <RotateCcw aria-hidden="true" size={16} />
        </button>
        <button className="icon-button" title="Mark as already uploaded" type="button">
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button className="icon-button" title="Skip item" type="button">
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "needs_approval") {
    return (
      <div className="actions">
        <button className="icon-button" title="Approve upload" type="button">
          <Play aria-hidden="true" size={16} />
        </button>
        <button className="icon-button" title="Edit and route" type="button">
          <Route aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "needs_routing") {
    return (
      <div className="actions">
        <button className="icon-button" title="Route now" type="button">
          <Route aria-hidden="true" size={16} />
        </button>
        <button className="icon-button" title="Skip item" type="button">
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "skipped") {
    return (
      <button className="icon-button" title="Restore to queue" type="button">
        <RotateCcw aria-hidden="true" size={16} />
      </button>
    );
  }

  return <span className="muted">None</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
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
