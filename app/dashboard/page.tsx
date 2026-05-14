import { AppShell } from "@/components/layout/AppShell";
import { QueueDashboard } from "@/components/dashboard/QueueDashboard";
import { getCurrentAccount } from "@/lib/auth/account";
import { getQueueItemsForDemo } from "@/lib/data/repository";

export default async function DashboardPage() {
  const [account, queueItems] = await Promise.all([
    getCurrentAccount(),
    getQueueItemsForDemo()
  ]);

  return (
    <AppShell
      title="Operations Queue"
      subtitle="Every detected recording is visible here, including failures and manual decisions."
      account={account}
    >
      <QueueDashboard items={queueItems} />
    </AppShell>
  );
}
