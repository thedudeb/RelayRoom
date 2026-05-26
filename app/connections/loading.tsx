import { SkeletonShell } from "@/components/layout/SkeletonShell";

export default function ConnectionsLoading() {
  return (
    <SkeletonShell activeHref="/connections" titleWidth={210} subtitleWidth={460}>
      <div className="table-wrap skeleton-table" aria-hidden="true">
        <span className="skeleton skeleton-table-head" />
        <span className="skeleton skeleton-row" />
        <span className="skeleton skeleton-row" />
        <span className="skeleton skeleton-row" />
      </div>
    </SkeletonShell>
  );
}
