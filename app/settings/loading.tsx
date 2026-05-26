import { SkeletonShell } from "@/components/layout/SkeletonShell";

export default function SettingsLoading() {
  return (
    <SkeletonShell activeHref="/settings" titleWidth={180} subtitleWidth={420}>
      <div className="stack" aria-hidden="true">
        <span className="skeleton skeleton-panel" />
        <span className="skeleton skeleton-panel" />
      </div>
    </SkeletonShell>
  );
}
