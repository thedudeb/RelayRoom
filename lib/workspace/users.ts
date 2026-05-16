import type { UserSummary } from "@/lib/domain/types";

export function displayWorkspaceUser(user: UserSummary) {
  return user.name || user.email;
}

export function workspaceUserOptionLabel(user: UserSummary) {
  return user.name ? `${user.name} - ${user.email}` : user.email;
}

export function selectedWorkspaceUserId(userId: string | undefined, users: UserSummary[]) {
  return users.some((user) => user.id === userId) ? userId : undefined;
}
