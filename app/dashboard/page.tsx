import { AppShell } from "@/components/layout/AppShell";
import { QueueDashboard } from "@/components/dashboard/QueueDashboard";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getQueueItemsForDemo,
  getQueueItemsForUser,
  getWorkspaceUsers
} from "@/lib/data/repository";
import { selectedWorkspaceUserId } from "@/lib/workspace/users";

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string; userId?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const workspaceUsers = access.isDemo ? [] : await getWorkspaceUsers();
  const selectedUserId = selectedWorkspaceUserId(params?.userId, workspaceUsers);
  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId, { userId: selectedUserId });

  return (
    <AppShell
      title="Operations Queue"
      subtitle="Every detected recording is visible here, including failures and manual decisions."
      account={access.account}
      isDemo={access.isDemo}
    >
      <WorkspaceUserFilter
        currentUserId={access.isDemo ? undefined : access.userId}
        selectedUserId={selectedUserId}
        selfLabel="My queue"
        title="Queue owner"
        users={workspaceUsers}
      />
      <QueueDashboard currentUserId={access.isDemo ? undefined : access.userId} items={queueItems} />
    </AppShell>
  );
}
