// Pure helpers for reordering a pipeline's rules. Rules are evaluated in
// priority order, so "moving a rule up" means giving it a lower priority number.

export type RuleMoveDirection = "up" | "down" | "top" | "bottom";

/**
 * Returns a new array with `selectedRuleId` shifted in the given direction.
 * Returns the original array unchanged if the move is a no-op or out of bounds,
 * so callers can compare by reference to detect whether anything changed.
 */
export function reorderRuleIds(
  ruleIds: string[],
  selectedRuleId: string,
  direction: RuleMoveDirection
) {
  const index = ruleIds.indexOf(selectedRuleId);
  const targetIndex = {
    bottom: ruleIds.length - 1,
    down: index + 1,
    top: 0,
    up: index - 1
  }[direction];

  // Bail when the rule isn't found, the target falls off either end, or the
  // move wouldn't actually change position.
  if (index < 0 || targetIndex < 0 || targetIndex >= ruleIds.length || targetIndex === index) {
    return ruleIds;
  }

  const reordered = [...ruleIds];
  const [selected] = reordered.splice(index, 1);
  if (!selected) {
    return ruleIds;
  }
  reordered.splice(targetIndex, 0, selected);
  return reordered;
}

// Persisting a reorder happens in two passes to avoid violating the unique
// (pipeline, priority) constraint mid-update: first write every rule to a
// distinct negative placeholder priority, then write the real positive values.
export function temporaryPriorityForIndex(index: number) {
  return -(index + 1);
}

export function finalPriorityForIndex(index: number) {
  return index + 1;
}
