import { describe, expect, it } from "vitest";
import {
  finalPriorityForIndex,
  reorderRuleIds,
  temporaryPriorityForIndex
} from "@/lib/rules/rule-ordering";

describe("rule ordering", () => {
  it("moves a rule one slot up or down", () => {
    expect(reorderRuleIds(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(reorderRuleIds(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("moves a rule to the top or bottom", () => {
    expect(reorderRuleIds(["a", "b", "c", "d"], "c", "top")).toEqual(["c", "a", "b", "d"]);
    expect(reorderRuleIds(["a", "b", "c", "d"], "b", "bottom")).toEqual(["a", "c", "d", "b"]);
  });

  it("keeps the order when the requested move is impossible", () => {
    const ruleIds = ["a", "b", "c"];

    expect(reorderRuleIds(ruleIds, "a", "up")).toBe(ruleIds);
    expect(reorderRuleIds(ruleIds, "c", "down")).toBe(ruleIds);
    expect(reorderRuleIds(ruleIds, "missing", "top")).toBe(ruleIds);
  });

  it("uses collision-safe temporary priorities before final priorities", () => {
    expect([0, 1, 2].map(temporaryPriorityForIndex)).toEqual([-1, -2, -3]);
    expect([0, 1, 2].map(finalPriorityForIndex)).toEqual([1, 2, 3]);
  });
});
