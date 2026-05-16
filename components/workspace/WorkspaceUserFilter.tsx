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

  return (
    <label className="compact-filter">
      <span>{title}</span>
      <select
        aria-label="Filter by workspace user"
        className="select"
        data-private={selectedUserId ? true : undefined}
        onChange={(event) => {
          const nextParams = new URLSearchParams(searchParams.toString());
          if (event.target.value === "all") {
            nextParams.delete("userId");
          } else {
            nextParams.set("userId", event.target.value);
          }

          const query = nextParams.toString();
          router.push((query ? `${pathname}?${query}` : pathname) as Route);
        }}
        value={selectedUserId || "all"}
      >
        <option value="all">All users</option>
        {currentUser ? (
          <option value={currentUser.id}>{selfLabel}</option>
        ) : null}
        {otherUsers.map((user) => (
          <option key={user.id} value={user.id}>
            {workspaceUserOptionLabel(user)}
          </option>
        ))}
      </select>
    </label>
  );
}
