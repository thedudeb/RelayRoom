import type { ConditionNode, Pipeline } from "@/lib/domain/types";

export function RulePreview({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div className="stack">
      {pipeline.rules.map((rule) => (
        <div className="panel" key={rule.id}>
          <div className="section-header">
            <div>
              <h3>{rule.priority}. {rule.name}</h3>
              <p className="muted">Routes to {rule.playlist.name}</p>
            </div>
            <span className="rule-pill">first match wins</span>
          </div>
          <ConditionTree node={rule.conditions} />
        </div>
      ))}
    </div>
  );
}

function ConditionTree({ node }: { node: ConditionNode }) {
  if (node.type === "group") {
    return (
      <div className="rule-group">
        <span className="rule-pill">{node.combinator}</span>
        {node.children.length === 0 ? (
          <p className="muted">No conditions yet.</p>
        ) : (
          node.children.map((child) => <ConditionTree key={child.id} node={child} />)
        )}
      </div>
    );
  }

  return (
    <div className="rule-row">
      <strong>{labelForField(node.field)}</strong>
      <span>{labelForOperator(node.operator)}</span>
      <code>{formatValue(node.value)}</code>
      {node.field === "filename" ? (
        <span className="muted">{node.caseSensitive ? "case-sensitive" : "case-insensitive"}</span>
      ) : null}
    </div>
  );
}

function labelForField(field: string): string {
  return field.replaceAll("_", " ");
}

function labelForOperator(operator: string): string {
  return operator.replaceAll("_", " ");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}
