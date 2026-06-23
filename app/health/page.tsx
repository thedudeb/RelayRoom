import { FailureReason, PipelineStatus, QueueStatus } from "@prisma/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/empty/EmptyState";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import { requireAppAccess } from "@/lib/auth/account";
import { getPipelinesForDemo, getQueueItemsForDemo, getWorkspaceUsers } from "@/lib/data/repository";
import { prisma } from "@/lib/db/prisma";
import { selectedWorkspaceUserId } from "@/lib/workspace/users";

interface PipelineHealthRow {
  attentionCount: number;
  driveConnectionStatus: string;
  driveWatch: "active" | "expiring" | "missing" | "inactive";
  failedAttempts24h: number;
  id: string;
  lastDetectionAt?: string;
  name: string;
  nextPollAt?: string;
  ownerName: string;
  pipelineStatus: string;
  quotaFailures24h: number;
  staleUploadingCount: number;
  waitingCount: number;
  youtubeConnectionStatus: string;
}

interface NotificationDeliveryRow {
  at: string;
  delivered: boolean;
  filename?: string;
  id: string;
  reason?: string;
  statusCode?: number;
  type: string;
}

const attentionStatuses: QueueStatus[] = [
  QueueStatus.NEEDS_APPROVAL,
  QueueStatus.NEEDS_ROUTING,
  QueueStatus.FAILED
];
const waitingStatuses: QueueStatus[] = [QueueStatus.NEEDS_APPROVAL, QueueStatus.NEEDS_ROUTING];

export default async function HealthPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string; userId?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const workspaceUsers = access.isDemo ? [] : await getWorkspaceUsers();
  const selectedUserId = selectedWorkspaceUserId(params?.userId, workspaceUsers);
  const [rows, deliveries] = access.isDemo
    ? await Promise.all([getDemoPipelineHealth(), getDemoNotificationDeliveries()])
    : await Promise.all([
        getPipelineHealth({ userId: selectedUserId }),
        getNotificationDeliveries({ userId: selectedUserId })
      ]);

  const totals = {
    attention: rows.reduce((sum, row) => sum + row.attentionCount, 0),
    failedAttempts24h: rows.reduce((sum, row) => sum + row.failedAttempts24h, 0),
    unhealthy: rows.filter((row) => healthTone(row) !== "uploaded").length,
    staleUploads: rows.reduce((sum, row) => sum + row.staleUploadingCount, 0)
  };

  return (
    <AppShell
      title="Pipeline Health"
      subtitle="Detection cadence, Drive watch status, connection health, and recent failure signals."
      account={access.account}
      isDemo={access.isDemo}
    >
      <WorkspaceUserFilter
        currentUserId={access.isDemo ? undefined : access.userId}
        selectedUserId={selectedUserId}
        selfLabel="My health"
        title="Health owner"
        users={workspaceUsers}
      />
      <section className="metric-grid" aria-label="Pipeline health summary">
        <HealthMetric label="Pipelines needing review" tone="failed" value={totals.unhealthy} />
        <HealthMetric label="Attention queue" tone="routing" value={totals.attention} />
        <HealthMetric label="Failed uploads 24h" tone="failed" value={totals.failedAttempts24h} />
        <HealthMetric label="Stale uploads" tone="approval" value={totals.staleUploads} />
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Pipeline status</h2>
            <p className="muted">Each pipeline’s current operational posture.</p>
          </div>
          <span className="badge">{rows.length} pipelines</span>
        </div>
        {rows.length ? (
          <div className="health-grid">
            {rows.map((row) => (
              <article className="health-card" key={row.id}>
                <div className="section-header">
                  <div>
                    <h3 data-private>{row.name}</h3>
                    <p className="muted" data-private>{row.ownerName}</p>
                  </div>
                  <span className={`badge ${healthTone(row)}`}>{healthLabel(row)}</span>
                </div>
                <div className="health-stat-grid">
                  <HealthStat label="Pipeline" value={row.pipelineStatus} />
                  <HealthStat label="Drive" value={row.driveConnectionStatus} />
                  <HealthStat label="YouTube" value={row.youtubeConnectionStatus} />
                  <HealthStat label="Drive watch" value={row.driveWatch} />
                  <HealthStat label="Last detection" value={row.lastDetectionAt ? formatDate(row.lastDetectionAt) : "never"} />
                  <HealthStat label="Next poll" value={row.nextPollAt ? formatDate(row.nextPollAt) : "due now"} />
                  <HealthStat label="Waiting" value={String(row.waitingCount)} />
                  <HealthStat label="Failed 24h" value={String(row.failedAttempts24h)} />
                  <HealthStat label="Quota 24h" value={String(row.quotaFailures24h)} />
                  <HealthStat label="Stale uploads" value={String(row.staleUploadingCount)} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            illustration="pipeline"
            title="No pipelines to monitor"
            body="Create or select a pipeline owner to see health signals."
          />
        )}
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Notification deliveries</h2>
            <p className="muted">Recent Slack-compatible webhook delivery attempts.</p>
          </div>
          <span className="badge">{deliveries.length} attempts</span>
        </div>
        {deliveries.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Recording</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{formatDate(delivery.at)}</td>
                    <td>{delivery.type.replaceAll("_", " ")}</td>
                    <td data-private>{delivery.filename || "Queue item unavailable"}</td>
                    <td>
                      <span className={`badge ${delivery.delivered ? "uploaded" : "failed"}`}>
                        {delivery.delivered ? "delivered" : "failed"}
                      </span>
                    </td>
                    <td>{delivery.reason || delivery.statusCode || "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="detail-section-empty">No notification attempts recorded yet.</p>
        )}
      </section>
    </AppShell>
  );
}

async function getPipelineHealth({ userId }: { userId?: string }): Promise<PipelineHealthRow[]> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - 90 * 60 * 1000);
  const pipelines = await prisma.pipeline.findMany({
    where: {
      archivedAt: null,
      ...(userId ? { userId } : {})
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      driveConnection: { select: { status: true } },
      queueItems: {
        select: {
          attempts: {
            where: { startedAt: { gte: since24h } },
            select: { failureReason: true, success: true }
          },
          lastActionAt: true,
          status: true
        }
      },
      user: { select: { email: true, name: true } },
      youtubeConnection: { select: { status: true } }
    }
  });

  return pipelines.map((pipeline) => {
    const failedAttempts24h = pipeline.queueItems.flatMap((item) => item.attempts).filter(
      (attempt) => !attempt.success
    ).length;
    return {
      attentionCount: pipeline.queueItems.filter((item) =>
        attentionStatuses.includes(item.status)
      ).length,
      driveConnectionStatus: pipeline.driveConnection.status.toLowerCase(),
      driveWatch: driveWatchStatus({
        expiresAt: pipeline.driveChannelExpiresAt,
        pipelineStatus: pipeline.status
      }),
      failedAttempts24h,
      id: pipeline.id,
      lastDetectionAt: pipeline.lastDetectionAt?.toISOString(),
      name: pipeline.name,
      nextPollAt: nextPollAt(pipeline.lastDetectionAt, pipeline.pollingIntervalMinutes),
      ownerName: pipeline.user.name || pipeline.user.email,
      pipelineStatus: pipeline.status.toLowerCase(),
      quotaFailures24h: pipeline.queueItems
        .flatMap((item) => item.attempts)
        .filter((attempt) => attempt.failureReason === FailureReason.QUOTA_EXCEEDED).length,
      staleUploadingCount: pipeline.queueItems.filter(
        (item) => item.status === QueueStatus.UPLOADING && item.lastActionAt < staleCutoff
      ).length,
      waitingCount: pipeline.queueItems.filter((item) =>
        waitingStatuses.includes(item.status)
      ).length,
      youtubeConnectionStatus: pipeline.youtubeConnection.status.toLowerCase()
    };
  });
}

async function getNotificationDeliveries({
  userId
}: {
  userId?: string;
}): Promise<NotificationDeliveryRow[]> {
  const deliveries = await prisma.notificationDeliveryAttempt.findMany({
    where: userId ? { userId } : {},
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      createdAt: true,
      delivered: true,
      id: true,
      queueItem: { select: { filename: true } },
      reason: true,
      statusCode: true,
      type: true
    }
  });

  return deliveries.map((delivery) => ({
    at: delivery.createdAt.toISOString(),
    delivered: delivery.delivered,
    filename: delivery.queueItem?.filename,
    id: delivery.id,
    reason: delivery.reason || undefined,
    statusCode: delivery.statusCode || undefined,
    type: delivery.type
  }));
}

async function getDemoPipelineHealth(): Promise<PipelineHealthRow[]> {
  const [pipelines, queueItems] = await Promise.all([
    getPipelinesForDemo(),
    getQueueItemsForDemo()
  ]);
  return pipelines.map((pipeline) => {
    const items = queueItems.filter((item) => item.pipelineId === pipeline.id);
    return {
      attentionCount: items.filter((item) =>
        ["needs_approval", "needs_routing", "failed"].includes(item.status)
      ).length,
      driveConnectionStatus: "active",
      driveWatch: pipeline.status === "enabled" ? "active" : "inactive",
      failedAttempts24h: items.filter((item) => item.status === "failed").length,
      id: pipeline.id,
      lastDetectionAt: pipeline.lastDetectionAt,
      name: pipeline.name,
      nextPollAt: pipeline.lastDetectionAt,
      ownerName: pipeline.owner.name || pipeline.owner.email,
      pipelineStatus: pipeline.status,
      quotaFailures24h: items.filter((item) => item.failureReason === "quota_exceeded").length,
      staleUploadingCount: 0,
      waitingCount: items.filter((item) =>
        ["needs_approval", "needs_routing"].includes(item.status)
      ).length,
      youtubeConnectionStatus: "active"
    };
  });
}

async function getDemoNotificationDeliveries(): Promise<NotificationDeliveryRow[]> {
  const items = await getQueueItemsForDemo();
  return items
    .filter((item) => ["failed", "needs_approval", "needs_routing"].includes(item.status))
    .slice(0, 4)
    .map((item, index) => ({
      at: item.lastActionAt,
      delivered: index !== 1,
      filename: item.filename,
      id: `demo-delivery-${item.id}`,
      reason: index === 1 ? "http_500" : undefined,
      statusCode: index === 1 ? 500 : 200,
      type: item.status === "failed" ? "upload_failed" : item.status
    }));
}

function driveWatchStatus({
  expiresAt,
  pipelineStatus
}: {
  expiresAt: Date | null;
  pipelineStatus: PipelineStatus;
}): PipelineHealthRow["driveWatch"] {
  if (pipelineStatus !== PipelineStatus.ENABLED) return "inactive";
  if (!expiresAt) return "missing";
  const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / 3_600_000;
  return hoursUntilExpiry <= 0 ? "missing" : hoursUntilExpiry <= 24 ? "expiring" : "active";
}

function nextPollAt(lastDetectionAt: Date | null, intervalMinutes: number) {
  if (!lastDetectionAt) return undefined;
  return new Date(lastDetectionAt.getTime() + Math.max(5, intervalMinutes) * 60_000).toISOString();
}

function healthTone(row: PipelineHealthRow) {
  if (
    row.pipelineStatus === "errored" ||
    row.driveConnectionStatus !== "active" ||
    row.youtubeConnectionStatus !== "active" ||
    row.driveWatch === "missing" ||
    row.failedAttempts24h > 0 ||
    row.staleUploadingCount > 0
  ) {
    return "failed";
  }
  if (row.driveWatch === "expiring" || row.attentionCount > 0 || row.quotaFailures24h > 0) {
    return "needs_routing";
  }
  return "uploaded";
}

function healthLabel(row: PipelineHealthRow) {
  const tone = healthTone(row);
  if (tone === "failed") return "review";
  if (tone === "needs_routing") return "watch";
  return "healthy";
}

function HealthMetric({
  label,
  tone,
  value
}: {
  label: string;
  tone: "approval" | "failed" | "routing";
  value: number;
}) {
  return (
    <div className="metric" data-attention={value > 0} data-tone={tone}>
      <span>
        <i aria-hidden="true" />
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function HealthStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong data-private>{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
