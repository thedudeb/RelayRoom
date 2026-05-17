import { SkeletonShell } from "@/components/layout/SkeletonShell";

export default function DashboardLoading() {
  return (
    <SkeletonShell titleWidth={260} subtitleWidth={460}>
      <div className="metric-grid" aria-hidden="true">
        <span className="skeleton skeleton-card" />
        <span className="skeleton skeleton-card" />
        <span className="skeleton skeleton-card" />
        <span className="skeleton skeleton-card" />
      </div>
      <div className="table-wrap skeleton-table" aria-hidden="true">
        <span className="skeleton skeleton-table-head" />
        <span className="skeleton skeleton-row" />
        <span className="skeleton skeleton-row" />
        <span className="skeleton skeleton-row" />
      </div>
    </SkeletonShell>
  );
}
