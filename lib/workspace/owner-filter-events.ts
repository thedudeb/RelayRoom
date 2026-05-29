// Lightweight cross-component channel for the "filter by workspace owner"
// control. Components that aren't in the same React tree (e.g. the nav filter
// and a list elsewhere on the page) sync via a DOM CustomEvent rather than
// threading shared state through a context provider.

export const workspaceOwnerFilterChangeEvent = "relayroom:workspace-owner-filter-change";

export interface WorkspaceOwnerFilterChangeDetail {
  userId?: string;
}

/** Broadcasts an owner-filter change to any listeners. No-op during SSR (no `window`). */
export function announceWorkspaceOwnerFilterChange(userId?: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<WorkspaceOwnerFilterChangeDetail>(workspaceOwnerFilterChangeEvent, {
      detail: { userId }
    })
  );
}
