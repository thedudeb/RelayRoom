import { AppShell } from "@/components/layout/AppShell";
import { RulePreview } from "@/components/pipelines/RulePreview";
import { getPipelinesForDemo, getQueueItemsForDemo } from "@/lib/data/repository";
import type { QueueItem } from "@/lib/domain/types";

export default async function PipelinesPage() {
  const [pipelines, queueItems] = await Promise.all([
    getPipelinesForDemo(),
    getQueueItemsForDemo()
  ]);

  return (
    <AppShell
      title="Pipelines"
      subtitle="Configure watched Drive folders, destination channels, privacy, and routing rules."
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
