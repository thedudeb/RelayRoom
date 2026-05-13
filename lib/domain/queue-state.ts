import type { QueueStatus } from "@/lib/domain/types";

export type QueueAction =
  | "evaluate_rules"
  | "approve"
  | "edit_and_route"
  | "route_now"
  | "start_upload"
  | "upload_succeeded"
  | "upload_failed"
  | "retry"
  | "skip"
  | "restore"
  | "mark_externally_handled"
  | "verify_duplicate";

const transitions: Record<QueueStatus, Partial<Record<QueueAction, QueueStatus>>> = {
  detected: {
    evaluate_rules: "needs_routing",
    start_upload: "uploading"
  },
  needs_routing: {
    route_now: "uploading",
    mark_externally_handled: "externally_handled",
    skip: "skipped"
  },
  needs_approval: {
    approve: "uploading",
    edit_and_route: "uploading",
    mark_externally_handled: "externally_handled",
    skip: "skipped"
  },
  uploading: {
    upload_succeeded: "uploaded",
    upload_failed: "failed"
  },
  uploaded: {
    verify_duplicate: "uploaded"
  },
  failed: {
    retry: "uploading",
    mark_externally_handled: "externally_handled",
    skip: "skipped"
  },
  skipped: {
    restore: "needs_routing"
  },
  externally_handled: {
    restore: "needs_routing"
  }
};

export function nextQueueStatus(
  current: QueueStatus,
  action: QueueAction,
  restoreTarget?: QueueStatus
): QueueStatus {
  if (action === "restore" && restoreTarget) {
    if (!["needs_routing", "needs_approval", "failed"].includes(restoreTarget)) {
      throw new Error(`Cannot restore to ${restoreTarget}.`);
    }
    return restoreTarget;
  }

  const next = transitions[current][action];
  if (!next) {
    throw new Error(`Action ${action} is not allowed from ${current}.`);
  }

  return next;
}

export function actionsForStatus(status: QueueStatus): QueueAction[] {
  return Object.keys(transitions[status]) as QueueAction[];
}
