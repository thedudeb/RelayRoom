import { AppShell } from "@/components/layout/AppShell";
import { QueueDashboard } from "@/components/dashboard/QueueDashboard";
import { requireAppAccess } from "@/lib/auth/account";
import { getQueueItemsForDemo, getQueueItemsForUser } from "@/lib/data/repository";

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const queueItems = access.isDemo
    ? await getQueueItemsForDemo()
    : await getQueueItemsForUser(access.userId);

  return (
    <AppShell
      title="Operations Queue"
      subtitle="Every detected recording is visible here, including failures and manual decisions."
      account={access.account}
      isDemo={access.isDemo}
    >
      <QueueDashboard items={queueItems} />
    </AppShell>
  );
}
