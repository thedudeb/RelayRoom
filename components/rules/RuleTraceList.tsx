import type { EvaluationTrace, RuleTrace } from "@/lib/domain/types";

// Shared rule-evaluation trace renderer. Used by:
//  - the rule tester (pre-detection "what would this file do" exploration)
//  - the queue item detail panel (post-detection "why didn't my rule fire")
// SPEC §4.8: detail view must show which conditions matched and which failed
// for each rule the engine tried, in order.

export function RuleTraceList({ traces }: { traces: RuleTrace[] }) {
  if (!traces.length) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        No rules were evaluated for this file.
      </p>
    );
  }

  return (
    <div className="rule-trace-list">
      {traces.map((trace) => (
        <RuleTraceRow key={trace.ruleId} trace={trace} />
      ))}
    </div>
  );
}

function RuleTraceRow({ trace }: { trace: RuleTrace }) {
  return (
    <div className={`rule-trace-row ${trace.matched ? "matched" : ""}`}>
      <div>
        <strong>
          {trace.priority}. {trace.ruleName}
        </strong>
        <p>{trace.matched ? "Matched" : "Did not match"}</p>
      </div>
      <div className="rule-trace-children">
        {flattenTrace(trace.trace).map((child) => (
          <span className={child.matched ? "matched" : ""} key={child.key}>
            {child.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface TraceSummary {
  key: string;
  label: string;
  matched: boolean;
}

function flattenTrace(trace: EvaluationTrace, path = "root"): TraceSummary[] {
  if (trace.type === "condition") {
    return [
      {
        key: `${path}-${trace.nodeId}`,
        label: `${trace.field.replaceAll("_", " ")} ${trace.operator.replaceAll(
          "_",
          " "
        )} ${formatExpected(trace.expected)}: ${trace.matched ? "yes" : "no"}`,
        matched: trace.matched
      }
    ];
  }

  return trace.children.flatMap((child: EvaluationTrace, index: number) =>
    flattenTrace(child, `${path}-${index}`)
  );
}

function formatExpected(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value && typeof value === "object" && "start" in value && "end" in value) {
    const range = value as { end: string; start: string };
    return `${range.start}-${range.end}`;
  }
  return String(value);
}
