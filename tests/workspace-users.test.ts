import { describe, expect, it } from "vitest";
import {
  displayWorkspaceUser,
  selectedWorkspaceUserId,
  workspaceUserOptionLabel
} from "@/lib/workspace/users";

const users = [
  { id: "user-a", email: "owner@example.com", name: "Owner Person" },
  { id: "user-b", email: "operator@example.com" }
];

describe("workspace user helpers", () => {
  it("only accepts filter ids that exist in the workspace user list", () => {
    expect(selectedWorkspaceUserId("user-a", users)).toBe("user-a");
    expect(selectedWorkspaceUserId("missing-user", users)).toBeUndefined();
    expect(selectedWorkspaceUserId(undefined, users)).toBeUndefined();
  });

  it("uses names for display but keeps email visible in picker labels", () => {
    expect(displayWorkspaceUser(users[0])).toBe("Owner Person");
    expect(displayWorkspaceUser(users[1])).toBe("operator@example.com");
    expect(workspaceUserOptionLabel(users[0])).toBe("Owner Person - owner@example.com");
    expect(workspaceUserOptionLabel(users[1])).toBe("operator@example.com");
  });
});
