import { AppShell } from "@/components/layout/AppShell";
import { RulePreview } from "@/components/pipelines/RulePreview";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getPipelinesForDemo,
  getPipelinesForUser,
  getQueueItemsForDemo,
  getQueueItemsForUser
} from "@/lib/data/repository";
import type { QueueItem } from "@/lib/domain/types";

export default async function PipelinesPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const [pipelines, queueItems] = access.isDemo
    ? await Promise.all([getPipelinesForDemo(), getQueueItemsForDemo()])
    : await Promise.all([
        getPipelinesForUser(access.userId),
        getQueueItemsForUser(access.userId)
      ]);

  return (
    <AppShell
      title="Pipelines"
      subtitle="Configure watched Drive folders, destination channels, privacy, and routing rules."
      account={access.account}
      isDemo={access.isDemo}
    >
      <div className="split">
        <section className="stack">
          {pipelines.map((pipeline) => (
            <div className="panel" key={pipeline.id}>
              <div className="section-header">
                <div>
                  <h2>{pipeline.name}</h2>
                  <p className="muted">
                    {pipeline.sourceFolderName} → {pipeline.destinationChannelName}
                  </p>
                </div>
                <span className={`badge ${pipeline.status === "enabled" ? "uploaded" : "failed"}`}>
                  {pipeline.status}
                </span>
              </div>
              <div className="filter-row">
                <span className="rule-pill">{pipeline.mode.replaceAll("_", " ")}</span>
                <span className="rule-pill">{pipeline.privacyStatus}</span>
                <span className="rule-pill">
                  {waitingCount(queueItems, pipeline.id)} waiting
                </span>
              </div>
              <p className="muted">
                Cold start watermark: {new Date(pipeline.processedFromTime).toLocaleString()}
              </p>
            </div>
          ))}
          {pipelines.length === 0 ? (
            <div className="empty-state">
              <strong>No pipelines yet.</strong>
              <p>Connect Drive and YouTube first, then create a watched-folder pipeline.</p>
            </div>
          ) : null}
        </section>
        <aside className="stack">
          <div className="panel">
            <h2>Rule Builder Preview</h2>
            <p className="muted">
              This is the first visual pass over the condition tree. The next step is turning
              these blocks into inline editable controls with validation and drag ordering.
            </p>
          </div>
          {pipelines[0] ? <RulePreview pipeline={pipelines[0]} /> : null}
        </aside>
      </div>
    </AppShell>
  );
}

function waitingCount(queueItems: QueueItem[], pipelineId: string): number {
  return queueItems.filter(
    (item) =>
      item.pipelineId === pipelineId &&
      ["needs_approval", "needs_routing", "failed"].includes(item.status)
  ).length;
}
