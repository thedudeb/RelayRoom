import type { UserSummary } from "@/lib/domain/types";

// Presentation helpers for workspace users, kept in one place so labels stay
// consistent everywhere a user is shown or selected.

/** Short label: name when set, otherwise fall back to the email. */
export function displayWorkspaceUser(user: UserSummary) {
  return user.name || user.email;
}

/** Verbose label for option lists, disambiguating same-named users by email. */
export function workspaceUserOptionLabel(user: UserSummary) {
  return user.name ? `${user.name} - ${user.email}` : user.email;
}

// Validates a (possibly stale or URL-supplied) user id against the current
// list, returning undefined when it no longer matches so the UI falls back to
// "all users" instead of a phantom selection.
export function selectedWorkspaceUserId(userId: string | undefined, users: UserSummary[]) {
  return users.some((user) => user.id === userId) ? userId : undefined;
}
