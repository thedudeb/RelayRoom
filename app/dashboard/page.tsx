import { AppShell } from "@/components/layout/AppShell";
import { QueueDashboard } from "@/components/dashboard/QueueDashboard";
import { getQueueItemsForDemo } from "@/lib/data/repository";

export default async function DashboardPage() {
  const queueItems = await getQueueItemsForDemo();

  return (
    <AppShell
      title="Operations Queue"
      subtitle="Every detected recording is visible here, including failures and manual decisions."
    >
      <QueueDashboard items={queueItems} />
    </AppShell>
  );
}
