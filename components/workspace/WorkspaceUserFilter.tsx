"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import type { UserSummary } from "@/lib/domain/types";
import { workspaceUserOptionLabel } from "@/lib/workspace/users";

export function WorkspaceUserFilter({
  currentUserId,
  selfLabel = "My items",
  selectedUserId,
  title = "Workspace user",
  users
}: {
  currentUserId?: string;
  selfLabel?: string;
  selectedUserId?: string;
  title?: string;
  users: UserSummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  if (users.length < 2) {
    return null;
  }

  const currentUser = users.find((user) => user.id === currentUserId);
  const otherUsers = currentUser
    ? users.filter((user) => user.id !== currentUser.id)
    : users;

  function navigateToUser(userId?: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (userId) {
      nextParams.set("userId", userId);
    } else {
      nextParams.delete("userId");
    }

    const query = nextParams.toString();
    router.push((query ? `${pathname}?${query}` : pathname) as Route);
  }

  const selectedOtherUserId =
    selectedUserId && selectedUserId !== currentUser?.id ? selectedUserId : "";

  return (
    <div className="compact-filter" aria-label={title} data-tour="workspace-user-filter">
      <span>{title}</span>
      <div className="compact-filter-actions">
        <button
          className={!selectedUserId ? "button primary" : "button"}
          onClick={() => navigateToUser()}
          type="button"
        >
          All users
        </button>
        {currentUser ? (
          <button
            className={selectedUserId === currentUser.id ? "button primary" : "button"}
            onClick={() => navigateToUser(currentUser.id)}
            type="button"
          >
            {selfLabel}
          </button>
        ) : null}
        <select
          aria-label="Filter by another workspace user"
          className="select"
          data-private={selectedOtherUserId ? true : undefined}
          onChange={(event) => {
            if (event.target.value) {
              navigateToUser(event.target.value);
            }
          }}
          value={selectedOtherUserId}
        >
          <option value="">Other users...</option>
          {otherUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {workspaceUserOptionLabel(user)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
