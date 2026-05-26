"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useEffect, useState } from "react";
import type { UserSummary } from "@/lib/domain/types";
import { announceWorkspaceOwnerFilterChange } from "@/lib/workspace/owner-filter-events";
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
  const [pendingSelectedUserId, setPendingSelectedUserId] = useState<string | undefined | null>(
    null
  );

  const effectiveSelectedUserId =
    pendingSelectedUserId !== null ? pendingSelectedUserId : selectedUserId;

  const currentUser = users.find((user) => user.id === currentUserId);
  const otherUsers = currentUser
    ? users.filter((user) => user.id !== currentUser.id)
    : users;

  useEffect(() => {
    if (pendingSelectedUserId !== null && selectedUserId === pendingSelectedUserId) {
      setPendingSelectedUserId(null);
    }
  }, [pendingSelectedUserId, selectedUserId]);

  if (users.length < 2) {
    return null;
  }

  function navigateToUser(userId?: string) {
    setPendingSelectedUserId(userId);
    announceWorkspaceOwnerFilterChange(userId);

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
    effectiveSelectedUserId && effectiveSelectedUserId !== currentUser?.id
      ? effectiveSelectedUserId
      : "";

  return (
    <div className="compact-filter" aria-label={title} data-tour="workspace-user-filter">
      <span>{title}</span>
      <div className="compact-filter-actions">
        <button
          className={!effectiveSelectedUserId ? "button primary" : "button"}
          onClick={() => navigateToUser()}
          type="button"
        >
          All users
        </button>
        {currentUser ? (
          <button
            className={effectiveSelectedUserId === currentUser.id ? "button primary" : "button"}
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
