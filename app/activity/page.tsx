import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/empty/EmptyState";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import { requireAppAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo, getWorkspaceUsers } from "@/lib/data/repository";
import { prisma } from "@/lib/db/prisma";
import { displayWorkspaceUser, selectedWorkspaceUserId } from "@/lib/workspace/users";

interface ActivityEntry {
  actor: string;
  at: string;
  filename: string;
  id: string;
  message: string;
  owner: {
    email: string;
    id: string;
    name?: string;
  };
  pipelineName: string;
  queueItemId: string;
  status: string;
}

export default async function ActivityPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string; userId?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const workspaceUsers = access.isDemo ? [] : await getWorkspaceUsers();
  const selectedUserId = selectedWorkspaceUserId(params?.userId, workspaceUsers);
  const entries = access.isDemo
    ? await getDemoActivityEntries()
    : await getActivityEntries({ userId: selectedUserId });
  const dashboardHref = access.isDemo ? "/dashboard?demo=true" : "/dashboard";

  return (
    <AppShell
      title="Activity Timeline"
      subtitle="Chronological queue decisions, uploads, retries, and operator actions."
      account={access.account}
      isDemo={access.isDemo}
    >
      <WorkspaceUserFilter
        currentUserId={access.isDemo ? undefined : access.userId}
        selectedUserId={selectedUserId}
        selfLabel="My activity"
        title="Activity owner"
        users={workspaceUsers}
      />
      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Recent activity</h2>
            <p className="muted">Newest events first across visible queue items.</p>
          </div>
          <span className="badge">{entries.length} events</span>
        </div>
        {entries.length ? (
          <ol className="timeline activity-timeline">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div className="activity-row">
                  <div className="activity-row-main">
                    <span>{entry.actor}</span>
                    <p>{entry.message}</p>
                    <strong data-private>{entry.filename}</strong>
                    <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time>
                  </div>
                  <div className="activity-row-meta">
                    <span className={`badge ${entry.status}`}>{entry.status.replaceAll("_", " ")}</span>
                    <small data-private>{entry.pipelineName}</small>
                    <small data-private>{displayWorkspaceUser(entry.owner)}</small>
                    <Link href={`${dashboardHref}#${entry.queueItemId}`}>Open queue</Link>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            illustration="queue"
            title="No activity yet"
            body="Queue events will appear here as files are detected and processed."
          />
        )}
      </section>
    </AppShell>
  );
}

async function getActivityEntries({ userId }: { userId?: string }): Promise<ActivityEntry[]> {
  const entries = await prisma.activityLogEntry.findMany({
    where: userId ? { queueItem: { userId } } : {},
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      actorType: true,
      createdAt: true,
      id: true,
      message: true,
      queueItem: {
        select: {
          filename: true,
          id: true,
          pipeline: { select: { name: true } },
          status: true,
          user: { select: { email: true, id: true, name: true } }
        }
      },
      user: { select: { email: true, id: true, name: true } }
    }
  });

  return entries.map((entry) => ({
    actor: entry.user ? displayWorkspaceUser(mapUser(entry.user)) : entry.actorType,
    at: entry.createdAt.toISOString(),
    filename: entry.queueItem.filename,
    id: entry.id,
    message: entry.message,
    owner: mapUser(entry.queueItem.user),
    pipelineName: entry.queueItem.pipeline.name,
    queueItemId: entry.queueItem.id,
    status: entry.queueItem.status.toLowerCase()
  }));
}

async function getDemoActivityEntries(): Promise<ActivityEntry[]> {
  const items = await getQueueItemsForDemo();

  return items
    .flatMap((item) => [
      {
        actor: "system",
        at: item.detectedAt,
        filename: item.filename,
        id: `${item.id}-detected`,
        message: "Detected file in watched Drive folder.",
        owner: item.owner,
        pipelineName: item.pipelineName,
        queueItemId: item.id,
        status: item.status
      },
      {
        actor: item.status === "externally_handled" ? "operator" : "system",
        at: item.lastActionAt,
        filename: item.filename,
        id: `${item.id}-current`,
        message:
          item.status === "failed"
            ? item.lastError || "Upload failed."
            : `Current status: ${item.status.replaceAll("_", " ")}.`,
        owner: item.owner,
        pipelineName: item.pipelineName,
        queueItemId: item.id,
        status: item.status
      }
    ])
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 80);
}

function mapUser(user: { email: string; id: string; name: string | null }) {
  return {
    email: user.email,
    id: user.id,
    name: user.name || undefined
  };
}
