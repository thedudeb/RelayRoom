import { AppShell } from "@/components/layout/AppShell";
import { QueueDashboard } from "@/components/dashboard/QueueDashboard";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getQueueItemsForDemo,
  getQueueItemsForUser,
  getWorkspaceUsers
} from "@/lib/data/repository";
import { areGoogleIntegrationsPaused, GOOGLE_INTEGRATIONS_PAUSED_MESSAGE } from "@/lib/google/integrations";
import { selectedWorkspaceUserId } from "@/lib/workspace/users";

// Server component for the operations queue. Resolves access (real user vs.
// demo), loads the queue — optionally filtered to a chosen workspace owner — and
// renders it inside the app shell. The ?userId/?demo search params drive both
// the owner filter and demo mode.
export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string; userId?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  // Demo mode has no real workspace, so skip the owner filter entirely.
  const workspaceUsers = access.isDemo ? [] : await getWorkspaceUsers();
  // Validate the requested owner against the real list (ignores stale ids).
  const selectedUserId = selectedWorkspaceUserId(params?.userId, workspaceUsers);
  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId, { userId: selectedUserId });
  const googleIntegrationsPaused = areGoogleIntegrationsPaused();

  return (
    <AppShell
      title="Operations Queue"
      subtitle="Every detected recording is visible here, including failures and manual decisions."
      account={access.account}
      isDemo={access.isDemo}
    >
      {googleIntegrationsPaused ? (
        <div className="notice" role="status">
          {GOOGLE_INTEGRATIONS_PAUSED_MESSAGE} Upload, route-to-channel, and playlist recovery
          actions are disabled; skip, restore, mark handled, history, and exports remain available.
        </div>
      ) : null}
      <WorkspaceUserFilter
        currentUserId={access.isDemo ? undefined : access.userId}
        selectedUserId={selectedUserId}
        selfLabel="My queue"
        title="Queue owner"
        users={workspaceUsers}
      />
      <QueueDashboard
        currentUserId={access.isDemo ? undefined : access.userId}
        items={queueItems}
        selectedOwnerUserId={selectedUserId}
      />
    </AppShell>
  );
}
