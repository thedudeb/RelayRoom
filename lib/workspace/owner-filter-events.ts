export const workspaceOwnerFilterChangeEvent = "relayroom:workspace-owner-filter-change";

export interface WorkspaceOwnerFilterChangeDetail {
  userId?: string;
}

export function announceWorkspaceOwnerFilterChange(userId?: string) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<WorkspaceOwnerFilterChangeDetail>(workspaceOwnerFilterChangeEvent, {
      detail: { userId }
    })
  );
}
