export type RuleMoveDirection = "up" | "down" | "top" | "bottom";

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

export function temporaryPriorityForIndex(index: number) {
  return -(index + 1);
}

export function finalPriorityForIndex(index: number) {
  return index + 1;
}
