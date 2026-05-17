import { SkeletonShell } from "@/components/layout/SkeletonShell";

export default function PipelinesLoading() {
  return (
    <SkeletonShell titleWidth={180} subtitleWidth={420}>
      <div className="split" aria-hidden="true">
        <section className="stack">
          <span className="skeleton skeleton-panel" />
          <span className="skeleton skeleton-panel" />
        </section>
        <aside className="stack">
          <span className="skeleton skeleton-side-panel" />
        </aside>
      </div>
    </SkeletonShell>
  );
}
