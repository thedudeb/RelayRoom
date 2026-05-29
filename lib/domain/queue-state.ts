import type { QueueStatus } from "@/lib/domain/types";

// State machine for a queued upload. A queue item moves through statuses
// (detected → needs_routing/needs_approval → uploading → uploaded/failed, plus
// skipped/externally_handled side states) only via the explicit transitions
// declared below. Centralizing the rules here keeps the API, UI, and workers
// from inventing illegal jumps.

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

// Allowed (status, action) → next-status edges. A status missing an action
// means that action is illegal from there.
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

/**
 * Resolves the next status for an action, throwing if the transition is illegal.
 * `restore` is special-cased: it takes an explicit target (where the item was
 * before being skipped/externally-handled) but that target is constrained to
 * the "actionable" statuses so a restore can't drop an item straight back into
 * uploading or uploaded.
 */
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

/** Lists the actions currently valid from a status — drives which buttons the UI shows. */
export function actionsForStatus(status: QueueStatus): QueueAction[] {
  return Object.keys(transitions[status]) as QueueAction[];
}
