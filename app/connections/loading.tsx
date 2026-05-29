import { SkeletonShell } from "@/components/layout/SkeletonShell";

// Next.js streaming-loading UI shown while the connections page's server data
// resolves. Mirrors that page's layout (a table) so the swap-in is jank-free;
// aria-hidden keeps the placeholder out of the accessibility tree.
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
