"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Info,
  Play,
  RotateCcw,
  Route,
  SkipForward,
  X
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  QueueItem,
  QueueStatus,
  RecordingIntelligence,
  RuleTrace
} from "@/lib/domain/types";
import { EmptyState } from "@/components/empty/EmptyState";
import { RuleTraceList } from "@/components/rules/RuleTraceList";
import { useToast } from "@/components/toast/ToastContext";
import { FloatingTooltip } from "@/components/ui/FloatingTooltip";
import {
  workspaceOwnerFilterChangeEvent,
  type WorkspaceOwnerFilterChangeDetail
} from "@/lib/workspace/owner-filter-events";
import { displayWorkspaceUser } from "@/lib/workspace/users";

type QueueTab = "all" | QueueStatus;
type SortMode = "detected_desc" | "filename_asc" | "status_asc" | "last_action_desc";
type QueueAction =
  | "skip"
  | "restore"
  | "mark_externally_handled"
  | "route"
  | "upload"
  | "edit_route";
type QueueActionPayload = {
  playlistId?: string;
  playlistName?: string;
  createPlaylistName?: string;
  titleOverride?: string;
  descriptionOverride?: string;
  youtubeUrl?: string;
};
type QueueDetails = {
  activityLog?: Array<{
    actor: string;
    at: string;
    message: string;
  }>;
  intelligence?: RecordingIntelligence;
  attempts?: Array<{
    attemptNumber: number;
    failureReason?: string;
    finishedAt?: string;
    rawError?: string;
    startedAt: string;
    success: boolean;
    youtubeVideoId?: string;
  }>;
  evaluation?: {
    matchedRule?: { id: string; name: string };
    playlist?: { id: string; name: string };
    ruleTraces: RuleTrace[];
    title: string;
    description: string;
  };
  item: QueueItem;
};

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

export function QueueDashboard({
  currentUserId,
  items: itemsProp,
  selectedOwnerUserId
}: {
  currentUserId?: string;
  items: QueueItem[];
  selectedOwnerUserId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const requestedOwnerUserId = searchParams.get("userId") || undefined;
  const allOwnerItemsRef = useRef<QueueItem[]>(itemsProp);
  const [pendingOwnerFilter, setPendingOwnerFilter] = useState<{ userId?: string } | null>(null);

  useEffect(() => {
    function onOwnerFilterChange(event: Event) {
      setPendingOwnerFilter({
        userId: (event as CustomEvent<WorkspaceOwnerFilterChangeDetail>).detail.userId
      });
    }

    window.addEventListener(workspaceOwnerFilterChangeEvent, onOwnerFilterChange);
    return () => window.removeEventListener(workspaceOwnerFilterChangeEvent, onOwnerFilterChange);
  }, []);

  useEffect(() => {
    if (!isDemo && !selectedOwnerUserId) {
      allOwnerItemsRef.current = itemsProp;
    }
  }, [isDemo, itemsProp, selectedOwnerUserId]);

  useEffect(() => {
    if (pendingOwnerFilter && selectedOwnerUserId === pendingOwnerFilter.userId) {
      setPendingOwnerFilter(null);
    }
  }, [pendingOwnerFilter, selectedOwnerUserId]);

  // Demo actions need a local copy because the server rejects demo writes. Real
  // workspaces must render directly from server props so owner-filter changes
  // don't flash stale counts before the prop-sync effect runs.
  const [demoItems, setDemoItems] = useState<QueueItem[]>(itemsProp);
  useEffect(() => {
    if (isDemo) {
      setDemoItems(itemsProp);
    }
  }, [isDemo, itemsProp]);

  const activePendingOwnerFilter =
    pendingOwnerFilter && selectedOwnerUserId !== pendingOwnerFilter.userId
      ? pendingOwnerFilter
      : null;
  const optimisticOwnerUserId = activePendingOwnerFilter?.userId || requestedOwnerUserId;
  const optimisticSourceItems =
    activePendingOwnerFilter && allOwnerItemsRef.current.length > 0
      ? allOwnerItemsRef.current
      : itemsProp;
  const canOptimisticallyFilterFromAllOwners =
    !isDemo &&
    !selectedOwnerUserId &&
    Boolean(optimisticOwnerUserId) &&
    optimisticSourceItems.some((item) => item.owner.id === optimisticOwnerUserId);
  const items = isDemo
    ? demoItems
    : activePendingOwnerFilter && !activePendingOwnerFilter.userId
      ? allOwnerItemsRef.current
    : canOptimisticallyFilterFromAllOwners
      ? optimisticSourceItems.filter((item) => item.owner.id === optimisticOwnerUserId)
      : itemsProp;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const relativeNowMs = isDemo ? demoNow : nowMs;
  const [activeTab, setActiveTab] = useState<QueueTab>("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [ruleFilter, setRuleFilter] = useState("all");
  const [detectedFrom, setDetectedFrom] = useState("");
  const [detectedTo, setDetectedTo] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("detected_desc");
  const { toast } = useToast();
  const [busyAction, setBusyAction] = useState<{ itemId: string; action: QueueAction } | null>(
    null
  );
  const [details, setDetails] = useState<QueueDetails>();
  const [detailsState, setDetailsState] = useState<"idle" | "loading">("idle");
  const [editRouteItem, setEditRouteItem] = useState<QueueItem>();

  const pipelineNames = useMemo(
    () => Array.from(new Set(items.map((item) => item.pipelineName))).sort(),
    [items]
  );
  const ruleNames = useMemo(
    () => Array.from(new Set(items.flatMap((item) => item.matchedRuleName || []))).sort(),
    [items]
  );
  const hasUnmatchedItems = useMemo(
    () => items.some((item) => !item.matchedRuleName),
    [items]
  );
  const hasAdvancedFilters =
    ruleFilter !== "all" || Boolean(detectedFrom) || Boolean(detectedTo);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => activeTab === "all" || item.status === activeTab)
      .filter((item) => pipelineFilter === "all" || item.pipelineName === pipelineFilter)
      .filter((item) => {
        if (ruleFilter === "all") return true;
        if (ruleFilter === "__no_rule") return !item.matchedRuleName;
        return item.matchedRuleName === ruleFilter;
      })
      .filter((item) => isWithinDetectedRange(item.detectedAt, detectedFrom, detectedTo))
      .slice()
      .sort((a, b) => compareQueueItems(a, b, sortMode));
  }, [activeTab, detectedFrom, detectedTo, items, pipelineFilter, ruleFilter, sortMode]);

  const activeCounts = {
    approval: count(items, "needs_approval"),
    routing: count(items, "needs_routing"),
    failed: count(items, "failed"),
    uploaded: count(items, "uploaded")
  };

  useEffect(() => {
    if (isDemo) {
      return;
    }

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [isDemo]);

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

    // In demo mode, simulate the action client-side so reviewers can see the
    // queue lifecycle without an OAuth-bound write path. Real workspaces
    // still round-trip the API below.
    if (isDemo) {
      const simulated = simulateDemoAction(item, action, actionPayload, youtubeUrl);
      setDemoItems((prev) =>
        prev.map((existing) => (existing.id === item.id ? simulated.next : existing))
      );
      setBusyAction(null);
      toast({
        tone: "success",
        title: simulated.message,
        body: "Demo mode — sign in to run this against your own Drive + YouTube."
      });
      return;
    }

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

      toast({
        tone: "success",
        title: payload.message || "Queue item updated"
      });
      router.refresh();
    } catch (error) {
      toast({
        tone: "danger",
        title: "Queue action failed",
        body: error instanceof Error ? error.message : undefined
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function openDetails(item: QueueItem) {
    if (details?.item.id === item.id && detailsState !== "loading") {
      setDetails(undefined);
      return;
    }

    setDetailsState("loading");
    setDetails({ item });

    try {
      const response = await fetch(
        `/api/queue/${encodeURIComponent(item.id)}${isDemo ? "?demo=true" : ""}`
      );
      const payload = (await response.json().catch(() => ({ item }))) as QueueDetails & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load queue details.");
      }

      setDetails(payload);
    } catch (error) {
      toast({
        tone: "danger",
        title: "Couldn't load queue details",
        body: error instanceof Error ? error.message : undefined
      });
    } finally {
      setDetailsState("idle");
    }
  }

  return (
    <>
      <section className="metric-grid" aria-label="Queue summary" data-tour="queue-summary">
        <Metric
          label="Needs approval"
          tone="approval"
          value={activeCounts.approval}
          activeTab={activeTab}
          onSelect={setActiveTab}
          tabKey="needs_approval"
        />
        <Metric
          label="Needs routing"
          tone="routing"
          value={activeCounts.routing}
          activeTab={activeTab}
          onSelect={setActiveTab}
          tabKey="needs_routing"
        />
        <Metric
          label="Failed"
          tone="failed"
          value={activeCounts.failed}
          activeTab={activeTab}
          onSelect={setActiveTab}
          tabKey="failed"
        />
        <Metric
          label="Uploaded"
          tone="uploaded"
          value={activeCounts.uploaded}
          activeTab={activeTab}
          onSelect={setActiveTab}
          tabKey="uploaded"
        />
      </section>

      <section className="toolbar" data-tour="queue-filters">
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
          <label className="filter-field">
            <span>Pipeline</span>
            <select
              className="select"
              data-private={pipelineFilter !== "all" ? true : undefined}
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
          </label>
          <label className="filter-field">
            <span>Sort by</span>
            <select
              className="select"
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              value={sortMode}
            >
              <option value="detected_desc">Newest detected first</option>
              <option value="filename_asc">Filename</option>
              <option value="status_asc">Status</option>
              <option value="last_action_desc">Last action</option>
            </select>
          </label>
          <label className="filter-field">
            <span>Matched rule</span>
            <select
              className="select"
              data-private={ruleFilter !== "all" && ruleFilter !== "__no_rule" ? true : undefined}
              onChange={(event) => setRuleFilter(event.target.value)}
              value={ruleFilter}
            >
              <option value="all">All rules</option>
              {hasUnmatchedItems ? <option value="__no_rule">No matched rule</option> : null}
              {ruleNames.map((ruleName) => (
                <option key={ruleName} value={ruleName}>
                  {ruleName}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Detected from</span>
            <input
              className="input filter-date-input"
              onChange={(event) => setDetectedFrom(event.target.value)}
              type="date"
              value={detectedFrom}
            />
          </label>
          <label className="filter-field">
            <span>Detected to</span>
            <input
              className="input filter-date-input"
              onChange={(event) => setDetectedTo(event.target.value)}
              type="date"
              value={detectedTo}
            />
          </label>
          {hasAdvancedFilters ? (
            <button
              className="button ghost compact-button filter-clear"
              onClick={() => {
                setRuleFilter("all");
                setDetectedFrom("");
                setDetectedTo("");
              }}
              type="button"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </section>

      <div className="table-wrap responsive-table-wrap tooltip-overflow-wrap" data-tour="queue-table">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Pipeline</th>
              <th>User</th>
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
                details={details?.item.id === item.id ? details : undefined}
                isDetailsLoading={details?.item.id === item.id && detailsState === "loading"}
                item={item}
                key={item.id}
                canManage={!currentUserId || item.owner.id === currentUserId}
                nowMs={relativeNowMs}
                onAction={runQueueAction}
                onDetails={openDetails}
                onEditRoute={setEditRouteItem}
              />
            ))}
          </tbody>
        </table>
        {visibleItems.length === 0 ? (
          items.length === 0 ? (
            <EmptyState
              illustration="queue"
              title="The queue is empty"
              body="Recordings detected in Drive folders appear here. Connect accounts and create a pipeline to start."
            />
          ) : (
            <EmptyState
              illustration="filter"
              title="Nothing matches these filters"
              body="Try another status tab, owner, rule, date, or pipeline filter."
            />
          )
        ) : null}
      </div>
      {editRouteItem ? (
        <EditRouteModal
          busy={busyAction?.itemId === editRouteItem.id}
          item={editRouteItem}
          onClose={() => setEditRouteItem(undefined)}
          onSubmit={(payload) => {
            runQueueAction(editRouteItem, "edit_route", payload);
            setEditRouteItem(undefined);
          }}
        />
      ) : null}
    </>
  );
}

function QueueRow({
  busyAction,
  canManage,
  details,
  isDetailsLoading,
  item,
  nowMs,
  onAction,
  onDetails,
  onEditRoute
}: {
  busyAction: { itemId: string; action: QueueAction } | null;
  canManage: boolean;
  details?: QueueDetails;
  isDetailsLoading: boolean;
  item: QueueItem;
  nowMs: number;
  onAction: (item: QueueItem, action: QueueAction, payload?: QueueActionPayload) => void;
  onDetails: (item: QueueItem) => void;
  onEditRoute: (item: QueueItem) => void;
}) {
  const isUploading =
    busyAction?.itemId === item.id &&
    (busyAction.action === "upload" || busyAction.action === "edit_route");

  return (
    <>
      <tr>
        <td data-label="File">
          <strong data-private>{item.filename}</strong>
          <div className="muted">{formatBytes(item.sizeBytes)} · {item.mimeType}</div>
          {isUploading ? <UploadProgressBar /> : null}
        </td>
        <td data-label="Pipeline">
          <span data-private>{item.pipelineName}</span>
          <div className="muted" data-private>{item.sourceFolderName}</div>
        </td>
        <td data-label="User">
          <span data-private>{displayWorkspaceUser(item.owner)}</span>
          <div className="muted" data-private>{item.owner.email}</div>
        </td>
        <td data-label="Detected" title={formatAbsolute(item.detectedAt)}>
          {relativeAge(item.detectedAt, nowMs)}
        </td>
        <td data-label="Status">
          <div className="status-cell">
            <FloatingTooltip label="View queue details">
              <button
                aria-expanded={Boolean(details)}
                className="status-trigger"
                onClick={() => onDetails(item)}
                type="button"
              >
                <StatusBadge busyAction={busyAction} itemId={item.id} status={item.status} />
              </button>
            </FloatingTooltip>
            {item.failureReason ? (
              <span className="status-reason">{item.failureReason.replaceAll("_", " ")}</span>
            ) : null}
          </div>
        </td>
        <td data-label="Playlist">
          <PlaylistCell item={item} />
        </td>
        <td data-label="Rule">{item.matchedRuleName || <span className="muted">No match</span>}</td>
        <td data-label="Last action" title={formatAbsolute(item.lastActionAt)}>
          {relativeAge(item.lastActionAt, nowMs)}
        </td>
        <td data-label="Actions">
          <QueueActions
            busyAction={busyAction}
            canManage={canManage}
            item={item}
            onAction={onAction}
            onDetails={onDetails}
            onEditRoute={onEditRoute}
          />
        </td>
      </tr>
      {details ? (
        <tr className="queue-detail-row">
          <td colSpan={9}>
            <QueueDetailsPanel
              details={details}
              isLoading={isDetailsLoading}
              onClose={() => onDetails(item)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function PlaylistCell({ item }: { item: QueueItem }) {
  const playlistId = item.youtubePlaylistId || item.intendedPlaylistId;

  if (!item.intendedPlaylistName) {
    return <span className="muted">Unassigned</span>;
  }

  if (!playlistId) {
    return <span data-private>{item.intendedPlaylistName}</span>;
  }

  return (
    <a
      className="playlist-link"
      href={`https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`}
      rel="noreferrer"
      target="_blank"
      title="Open YouTube playlist"
    >
      <span data-private>{item.intendedPlaylistName}</span>
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
    busyAction?.itemId === itemId &&
    (busyAction.action === "upload" || busyAction.action === "edit_route")
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
      <Icon aria-hidden="true" className={busyLabel ? "spin-icon" : undefined} size={14} />
      {busyLabel || status.replaceAll("_", " ")}
    </span>
  );
}

function EditRouteModal({
  busy,
  item,
  onClose,
  onSubmit
}: {
  busy: boolean;
  item: QueueItem;
  onClose: () => void;
  onSubmit: (payload: QueueActionPayload) => void;
}) {
  const initialPlaylistOptions = useMemo(() => {
    const seen = new Set<string>();
    const options = [...(item.routingOptions || [])];
    if (item.intendedPlaylistId && item.intendedPlaylistName) {
      options.unshift({ id: item.intendedPlaylistId, name: item.intendedPlaylistName });
    }

    return options.filter((playlist) => {
      if (seen.has(playlist.id)) return false;
      seen.add(playlist.id);
      return true;
    });
  }, [item.intendedPlaylistId, item.intendedPlaylistName, item.routingOptions]);
  const [playlistOptions, setPlaylistOptions] = useState(initialPlaylistOptions);
  const [playlistValue, setPlaylistValue] = useState(
    item.intendedPlaylistId || initialPlaylistOptions[0]?.id || "__new"
  );
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [title, setTitle] = useState(item.renderedTitle || filenameWithoutExtension(item.filename));
  const [description, setDescription] = useState(item.renderedDescription || "");
  const [playlistStatus, setPlaylistStatus] = useState<string | null>(null);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);

  useEffect(() => {
    setPlaylistOptions(initialPlaylistOptions);
    setPlaylistValue(item.intendedPlaylistId || initialPlaylistOptions[0]?.id || "__new");
    setNewPlaylistName("");
    setTitle(item.renderedTitle || filenameWithoutExtension(item.filename));
    setDescription(item.renderedDescription || "");
    setPlaylistStatus(null);
  }, [initialPlaylistOptions, item]);

  useEffect(() => {
    if (!item.youtubeConnectionId) return;
    let cancelled = false;

    async function loadPlaylists() {
      setIsLoadingPlaylists(true);
      try {
        const response = await fetch(
          `/api/oauth/youtube/playlists?connectionId=${encodeURIComponent(item.youtubeConnectionId || "")}`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as {
          error?: string;
          playlists?: Array<{ id: string; title: string }>;
        };
        if (!response.ok || payload.error) {
          throw new Error(payload.error || "PlaylistLoadFailed");
        }
        if (cancelled) return;
        const loaded = (payload.playlists || []).map((playlist) => ({
          id: playlist.id,
          name: playlist.title
        }));
        setPlaylistOptions((current) => mergePlaylistOptions(current, loaded));
        setPlaylistValue((current) => (current === "__new" && loaded[0] ? loaded[0].id : current));
        setPlaylistStatus(null);
      } catch {
        if (!cancelled) setPlaylistStatus("Could not load channel playlists. You can still create a new one.");
      } finally {
        if (!cancelled) setIsLoadingPlaylists(false);
      }
    }

    void loadPlaylists();
    return () => {
      cancelled = true;
    };
  }, [item.youtubeConnectionId]);

  const selectedPlaylist = playlistOptions.find((playlist) => playlist.id === playlistValue);
  const isCreatingPlaylist = playlistValue === "__new";
  const canSubmit = title.trim() && (!isCreatingPlaylist || newPlaylistName.trim());

  return (
    <div
      className="access-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="presentation"
    >
      <form
        aria-labelledby="edit-route-title"
        aria-modal="true"
        className="access-modal edit-route-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          onSubmit({
            ...(isCreatingPlaylist
              ? { createPlaylistName: newPlaylistName.trim() }
              : {
                  playlistId: selectedPlaylist?.id,
                  playlistName: selectedPlaylist?.name
                }),
            descriptionOverride: description,
            titleOverride: title
          });
        }}
        role="dialog"
      >
        <div className="queue-detail-header">
          <div className="queue-detail-title">
            <span className="topbar-eyebrow">Edit and route</span>
            <h2 id="edit-route-title" data-private>{item.filename}</h2>
          </div>
          <button
            aria-label="Close edit and route"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>

        <label>
          <span>Playlist</span>
          <select
            className="select"
            disabled={busy}
            onChange={(event) => setPlaylistValue(event.target.value)}
            value={playlistValue}
          >
            {playlistOptions.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
            <option value="__new">Create new playlist</option>
          </select>
          {isLoadingPlaylists ? <small className="field-hint">Loading channel playlists...</small> : null}
          {playlistStatus ? <small className="field-hint error">{playlistStatus}</small> : null}
        </label>

        {isCreatingPlaylist ? (
          <label>
            <span>New playlist name</span>
            <input
              className="input"
              disabled={busy}
              onChange={(event) => setNewPlaylistName(event.target.value)}
              placeholder="Playlist title"
              required
              value={newPlaylistName}
            />
          </label>
        ) : null}

        <label>
          <span>YouTube title</span>
          <input
            className="input"
            disabled={busy}
            maxLength={100}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>

        <label>
          <span>Description</span>
          <textarea
            className="textarea"
            disabled={busy}
            maxLength={5000}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            value={description}
          />
        </label>

        <div className="edit-route-preview">
          <span>Preview</span>
          <strong data-private>{title.trim() || item.filename}</strong>
          <p data-private>{description.trim() || "No description."}</p>
        </div>

        <div className="access-modal-actions">
          <button className="button" disabled={busy} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            aria-busy={busy}
            className="button primary"
            disabled={busy || !canSubmit}
            type="submit"
          >
            Upload with edits
          </button>
        </div>
      </form>
    </div>
  );
}

function QueueActions({
  busyAction,
  canManage,
  item,
  onAction,
  onDetails,
  onEditRoute
}: {
  busyAction: { itemId: string; action: QueueAction } | null;
  canManage: boolean;
  item: QueueItem;
  onAction: (item: QueueItem, action: QueueAction, payload?: QueueActionPayload) => void;
  onDetails: (item: QueueItem) => void;
  onEditRoute: (item: QueueItem) => void;
}) {
  const isBusy = busyAction?.itemId === item.id;
  const hasUploadedVideoMissingPlaylist = Boolean(item.youtubeVideoId && !item.youtubePlaylistId);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    item.intendedPlaylistId || item.routingOptions?.[0]?.id || ""
  );

  useEffect(() => {
    setSelectedPlaylistId(item.intendedPlaylistId || item.routingOptions?.[0]?.id || "");
  }, [item.id, item.intendedPlaylistId, item.routingOptions]);

  const detailsButton = (
    <button
      className="icon-button"
      data-tooltip="View details"
      disabled={isBusy}
      onClick={() => onDetails(item)}
      type="button"
    >
      <Info aria-hidden="true" size={16} />
    </button>
  );

  if (!canManage) {
    return (
      <div className="actions queue-actions">
        {detailsButton}
        {item.status === "uploaded" ? (
          <button
            className="icon-button"
            data-tooltip={item.youtubeUrl ? "Open on YouTube" : "No YouTube URL recorded"}
            disabled={!item.youtubeUrl}
            onClick={() =>
              item.youtubeUrl && window.open(item.youtubeUrl, "_blank", "noopener,noreferrer")
            }
            type="button"
          >
            <ExternalLink aria-hidden="true" size={16} />
          </button>
        ) : (
          <span className="muted">View only</span>
        )}
      </div>
    );
  }

  if (item.status === "uploaded") {
    return (
      <div className="actions queue-actions">
        {detailsButton}
        <button
          className="icon-button"
          data-tooltip={item.youtubeUrl ? "Open on YouTube" : "No YouTube URL recorded"}
          disabled={!item.youtubeUrl}
          onClick={() => item.youtubeUrl && window.open(item.youtubeUrl, "_blank", "noopener,noreferrer")}
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "failed") {
    const canRecoverPlaylist =
      hasUploadedVideoMissingPlaylist && Boolean(item.routingOptions?.length);
    const selectedPlaylist = item.routingOptions?.find(
      (playlist) => playlist.id === selectedPlaylistId
    );

    return (
      <div className="actions queue-actions">
        {detailsButton}
        {canRecoverPlaylist ? (
          <select
            aria-label={`Recover ${item.filename} to playlist`}
            className="select route-select"
            disabled={isBusy}
            onChange={(event) => setSelectedPlaylistId(event.target.value)}
            value={selectedPlaylistId}
          >
            {item.routingOptions?.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
        ) : null}
        {canRecoverPlaylist ? (
          <button
            className="icon-button"
            data-tooltip={selectedPlaylist ? "Recover playlist assignment" : "No playlist options"}
            disabled={isBusy || !selectedPlaylist}
            onClick={() =>
              selectedPlaylist &&
              onAction(item, "route", {
                playlistId: selectedPlaylist.id,
                playlistName: selectedPlaylist.name
              })
            }
            type="button"
          >
            <Route aria-hidden="true" size={16} />
          </button>
        ) : null}
        <button
          className="icon-button"
          data-tooltip={hasUploadedVideoMissingPlaylist ? "Retry playlist assignment" : "Retry upload"}
          disabled={isBusy || (canRecoverPlaylist && !selectedPlaylist)}
          onClick={() =>
            onAction(
              item,
              "upload",
              canRecoverPlaylist && selectedPlaylist
                ? {
                    playlistId: selectedPlaylist.id,
                    playlistName: selectedPlaylist.name
                  }
                : undefined
            )
          }
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Mark as already uploaded"
          disabled={isBusy}
          onClick={() => onAction(item, "mark_externally_handled")}
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Skip item"
          disabled={isBusy}
          onClick={() => onAction(item, "skip")}
          type="button"
        >
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "needs_approval") {
    return (
      <div className="actions queue-actions">
        {detailsButton}
        <button
          className="icon-button"
          data-tooltip="Approve upload"
          disabled={isBusy}
          onClick={() => onAction(item, "upload")}
          type="button"
        >
          <Play aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Edit and route"
          disabled={isBusy}
          onClick={() => onEditRoute(item)}
          type="button"
        >
          <Route aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Mark as already uploaded"
          disabled={isBusy}
          onClick={() => onAction(item, "mark_externally_handled")}
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Skip item"
          disabled={isBusy}
          onClick={() => onAction(item, "skip")}
          type="button"
        >
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "needs_routing") {
    return (
      <div className="actions queue-actions">
        {detailsButton}
        <button
          className="icon-button"
          data-tooltip="Edit route and upload"
          disabled={isBusy}
          onClick={() => onEditRoute(item)}
          type="button"
        >
          <Route aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Mark as already uploaded"
          disabled={isBusy}
          onClick={() => onAction(item, "mark_externally_handled")}
          type="button"
        >
          <ExternalLink aria-hidden="true" size={16} />
        </button>
        <button
          className="icon-button"
          data-tooltip="Skip item"
          disabled={isBusy}
          onClick={() => onAction(item, "skip")}
          type="button"
        >
          <SkipForward aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "skipped") {
    return (
      <div className="actions queue-actions">
        {detailsButton}
        <button
          className="icon-button"
          data-tooltip="Restore to queue"
          disabled={isBusy}
          onClick={() => onAction(item, "restore")}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  if (item.status === "externally_handled") {
    return (
      <div className="actions queue-actions">
        {detailsButton}
        <button
          className="icon-button"
          data-tooltip="Restore to queue"
          disabled={isBusy}
          onClick={() => onAction(item, "restore")}
          type="button"
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>
      </div>
    );
  }

  return detailsButton;
}

function UploadProgressBar() {
  return (
    <div className="upload-progress" aria-label="Upload in progress">
      <span />
    </div>
  );
}

function QueueDetailsPanel({
  details,
  isLoading,
  onClose
}: {
  details: QueueDetails;
  isLoading: boolean;
  onClose: () => void;
}) {
  const item = details.item;
  const attempts = details.attempts || [];
  const activityLog = details.activityLog || [];
  const hasUploadedVideoMissingPlaylist = Boolean(item.youtubeVideoId && !item.youtubePlaylistId);

  return (
    <div className="queue-detail-panel">
      <div className="queue-detail-header">
        <div className="queue-detail-title">
          <span className="topbar-eyebrow">Queue details</span>
          <h2 data-private>{item.filename}</h2>
          <span className={`badge ${item.status}`}>
            {item.status.replaceAll("_", " ")}
          </span>
        </div>
        <button
          aria-label="Close details"
          className="icon-button"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>

      {isLoading ? (
        <div aria-busy="true" aria-label="Loading details" className="detail-loading-skeleton">
          <span className="skeleton line-sm" style={{ width: "30%" }} />
          <span className="skeleton line" style={{ width: "70%" }} />
        </div>
      ) : null}

      <div className="detail-grid">
        <Detail isPrivate label="Pipeline" value={item.pipelineName} />
        <Detail isPrivate label="User" value={displayWorkspaceUser(item.owner)} />
        <Detail isPrivate label="Drive file" value={item.driveFileId} />
        <Detail isPrivate label="Playlist" value={item.intendedPlaylistName || "Unassigned"} />
        {item.youtubeVideoId ? <Detail label="YouTube video" value={item.youtubeVideoId} /> : null}
        <Detail label="Rule" value={item.matchedRuleName || "No match"} />
        <Detail label="Last action" value={formatAbsolute(item.lastActionAt)} />
      </div>

      {hasUploadedVideoMissingPlaylist ? (
        <div className="detail-callout warning">
          <strong>Upload recovered</strong>
          <p>
            The video exists on YouTube, but RelayRoom still needs to add it to the selected
            playlist. Use Retry playlist assignment to finish without re-uploading the Drive file.
          </p>
        </div>
      ) : null}

      {item.lastError ? (
        <div className="detail-callout danger">
          <strong>Last error</strong>
          <p>{item.lastError}</p>
        </div>
      ) : null}

      {details.intelligence ? (
        <RecordingIntelligencePanel intelligence={details.intelligence} />
      ) : null}

      {details.evaluation ? (
        <section className="detail-section">
          <h3>
            Rule evaluation
            <span className="detail-section-count">
              {details.evaluation.ruleTraces.length}
            </span>
          </h3>
          <p className="detail-section-help">
            {details.evaluation.matchedRule
              ? `${details.evaluation.matchedRule.name} matched first — routed to ${details.evaluation.playlist?.name || "the matched playlist"}.`
              : "No rule matched. Each attempted rule is shown below with the per-condition result."}
          </p>
          <RuleTraceList traces={details.evaluation.ruleTraces} />
        </section>
      ) : null}

      <div className="detail-columns">
        <section className="detail-section">
          <h3>
            Upload attempts
            {attempts.length ? (
              <span className="detail-section-count">{attempts.length}</span>
            ) : null}
          </h3>
          {attempts.length ? (
            <div className="attempt-list">
              {attempts.map((attempt) => (
                <div className="attempt-item" key={attempt.attemptNumber}>
                  <div className="attempt-content">
                    <span className="attempt-label">Attempt {attempt.attemptNumber}</span>
                    <div>
                      <strong>{attempt.success ? "Succeeded" : "Failed"}</strong>
                      <span>
                        {attempt.success ? "Upload complete" : attempt.failureReason || "Reason unknown"}
                      </span>
                    </div>
                    <time>{formatAbsolute(attempt.finishedAt || attempt.startedAt)}</time>
                    {attempt.rawError ? <p>{attempt.rawError}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="detail-section-empty">No upload attempts yet.</p>
          )}
        </section>

        <section className="detail-section">
          <h3>
            Activity
            {activityLog.length ? (
              <span className="detail-section-count">{activityLog.length}</span>
            ) : null}
          </h3>
          {activityLog.length ? (
            <ol className="timeline">
              {activityLog.map((entry, index) => (
                <li key={`${entry.at}-${index}`}>
                  <span>{entry.actor}</span>
                  <p>{entry.message}</p>
                  <time>{formatAbsolute(entry.at)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="detail-section-empty">No activity recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RecordingIntelligencePanel({
  intelligence
}: {
  intelligence: RecordingIntelligence;
}) {
  return (
    <section className="detail-section intelligence-panel">
      <div className="intelligence-header">
        <div>
          <h3>
            Recording intelligence
            <span className={`confidence-pill ${intelligence.confidence}`}>
              {intelligence.confidence}
            </span>
          </h3>
          <p className="detail-section-help" data-private>
            {intelligence.summary}
          </p>
        </div>
        {intelligence.routingRecommendation ? (
          <div className="intelligence-route">
            <span>Recommended route</span>
            <strong data-private>{intelligence.routingRecommendation.playlistName}</strong>
            <p>{intelligence.routingRecommendation.reason}</p>
          </div>
        ) : null}
      </div>

      <div className="intelligence-grid">
        <div className="intelligence-copy">
          <span>Suggested title</span>
          <strong data-private>{intelligence.suggestedTitle}</strong>
          <span>Description</span>
          <p data-private>{intelligence.suggestedDescription}</p>
        </div>

        <div className="intelligence-copy">
          <span>Suggested chapters</span>
          <ol className="chapter-list">
            {intelligence.chapters.map((chapter) => (
              <li key={`${chapter.start}-${chapter.title}`}>
                <time>{chapter.start}</time>
                <span data-private>{chapter.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="intelligence-footer">
        <div className="tag-list" aria-label="Suggested tags">
          {intelligence.tags.map((tag) => (
            <span data-private key={tag}>{tag}</span>
          ))}
        </div>
        {intelligence.reviewFlags.length ? (
          <div className="review-flag-list" aria-label="Review flags">
            {intelligence.reviewFlags.map((flag) => (
              <span key={flag}>{flag}</span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Detail({
  isPrivate = false,
  label,
  value
}: {
  isPrivate?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong data-private={isPrivate ? true : undefined}>{value}</strong>
    </div>
  );
}

function Metric({
  activeTab,
  label,
  onSelect,
  tabKey,
  tone,
  value
}: {
  activeTab: QueueTab;
  label: string;
  onSelect: (tab: QueueTab) => void;
  tabKey: QueueTab;
  tone: "approval" | "failed" | "routing" | "uploaded";
  value: number;
}) {
  const needsAttention =
    (tone === "approval" || tone === "routing" || tone === "failed") && value > 0;
  const isActive = activeTab === tabKey;
  // Clicking a card toggles the matching tab on / off — second click on an
  // already-active card returns to "All" so the user can clear the filter
  // without hunting for the tab.
  return (
    <button
      aria-label={`Filter queue by ${label} (${value})`}
      aria-pressed={isActive}
      className="metric"
      data-active={isActive || undefined}
      data-attention={needsAttention}
      data-tone={tone}
      onClick={() => onSelect(isActive ? "all" : tabKey)}
      type="button"
    >
      <span>
        <i aria-hidden="true" />
        {label}
      </span>
      <strong>{value}</strong>
    </button>
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

function isWithinDetectedRange(isoDate: string, fromDate: string, toDate: string) {
  const time = new Date(isoDate).getTime();
  if (fromDate) {
    const start = new Date(`${fromDate}T00:00:00`).getTime();
    if (Number.isFinite(start) && time < start) return false;
  }
  if (toDate) {
    const end = new Date(`${toDate}T23:59:59.999`).getTime();
    if (Number.isFinite(end) && time > end) return false;
  }
  return true;
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

function filenameWithoutExtension(filename: string) {
  const index = filename.lastIndexOf(".");
  return index > 0 ? filename.slice(0, index) : filename;
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

function mergePlaylistOptions(
  ...groups: Array<Array<{ id: string; name: string }>>
): Array<{ id: string; name: string }> {
  const seen = new Set<string>();
  const merged: Array<{ id: string; name: string }> = [];

  for (const group of groups) {
    for (const option of group) {
      if (!option.id || seen.has(option.id)) continue;
      seen.add(option.id);
      merged.push(option);
    }
  }

  return merged;
}

// Demo-mode-only client-side simulation of queue actions. Mirrors the server's
// transition rules well enough for reviewers to walk the dashboard end-to-end
// without OAuth. Resets when the route refreshes (no persistence).
function simulateDemoAction(
  item: QueueItem,
  action: QueueAction,
  payload: QueueActionPayload,
  youtubeUrl?: string | null
): { next: QueueItem; message: string } {
  const now = new Date().toISOString();
  const playlistId = payload.playlistId ?? item.intendedPlaylistId;
  const playlistName = payload.playlistName ?? item.intendedPlaylistName;

  if (action === "skip") {
    return {
      next: { ...item, previousStatus: item.status, status: "skipped", lastActionAt: now },
      message: `Skipped ${item.filename}.`
    };
  }
  if (action === "restore") {
    const restoreStatus: QueueStatus =
      item.previousStatus && ["needs_routing", "needs_approval", "failed"].includes(item.previousStatus)
        ? (item.previousStatus as QueueStatus)
        : item.matchedRuleName || item.intendedPlaylistId
          ? "needs_approval"
          : "needs_routing";
    return {
      next: {
        ...item,
        previousStatus: undefined,
        status: restoreStatus,
        lastActionAt: now,
        ...(item.status === "externally_handled"
          ? { youtubeUrl: undefined, youtubeVideoId: undefined }
          : {})
      },
      message: `Restored ${item.filename} to ${restoreStatus.replaceAll("_", " ")}.`
    };
  }
  if (action === "mark_externally_handled") {
    return {
      next: {
        ...item,
        previousStatus: item.status,
        status: "externally_handled",
        lastActionAt: now,
        youtubeUrl: youtubeUrl || item.youtubeUrl
      },
      message: youtubeUrl ? "Linked to external upload." : "Marked as externally handled."
    };
  }
  if (action === "route") {
    return {
      next: {
        ...item,
        previousStatus: item.status,
        status: "needs_approval",
        intendedPlaylistId: playlistId,
        intendedPlaylistName: playlistName,
        matchedRuleName: "Manual route",
        lastActionAt: now
      },
      message: `Routed to ${playlistName || "the selected playlist"}.`
    };
  }
  if (action === "edit_route") {
    return {
      next: {
        ...item,
        previousStatus: item.status,
        status: "uploaded",
        intendedPlaylistId: playlistId,
        intendedPlaylistName: playlistName || payload.createPlaylistName,
        matchedRuleName: "Manual route",
        renderedDescription: payload.descriptionOverride,
        renderedTitle: payload.titleOverride,
        lastActionAt: now,
        youtubeUrl: item.youtubeUrl || `https://www.youtube.com/watch?v=demo-${item.id}`,
        youtubeVideoId: item.youtubeVideoId || `demo-${item.id}`,
        youtubePlaylistId: playlistId
      },
      message: `Uploaded ${item.filename} with edited routing (simulated).`
    };
  }
  // upload / approve / retry → optimistic uploaded state with a placeholder URL
  return {
    next: {
      ...item,
      previousStatus: item.status,
      status: "uploaded",
      lastActionAt: now,
      youtubeUrl: item.youtubeUrl || `https://www.youtube.com/watch?v=demo-${item.id}`,
      youtubeVideoId: item.youtubeVideoId || `demo-${item.id}`,
      youtubePlaylistId: playlistId
    },
    message: `Uploaded ${item.filename} (simulated).`
  };
}
