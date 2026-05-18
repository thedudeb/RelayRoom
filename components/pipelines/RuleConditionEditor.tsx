"use client";

import {
  Braces,
  CheckCircle2,
  ChevronDown,
  Copy,
  GripVertical,
  Plus,
  Sparkles,
  Trash2,
  XCircle
} from "lucide-react";
import { type DragEvent, useMemo, useRef, useState } from "react";
import type {
  ConditionField,
  ConditionGroup,
  ConditionLeaf,
  ConditionNode,
  ConditionOperator
} from "@/lib/domain/types";

type OperatorOption = { value: ConditionOperator; label: string };
type TraceContext = {
  day: string;
  filename: string;
  fileType: string;
  time: string;
};
type Template = {
  build: () => ConditionGroup;
  hint: string;
  id: string;
  label: string;
};

const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: "filename", label: "Filename" },
  { value: "file_type", label: "File type" },
  { value: "day_of_week", label: "Day of week" },
  { value: "time_of_day", label: "Time of day" }
];

const OPERATORS_BY_FIELD: Record<ConditionField, OperatorOption[]> = {
  day_of_week: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_one_of", label: "is one of" }
  ],
  file_type: [
    { value: "equals", label: "equals" },
    { value: "is_one_of", label: "is one of" }
  ],
  filename: [
    { value: "contains", label: "contains" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "equals", label: "equals" },
    { value: "matches_wildcard", label: "matches wildcard" },
    { value: "matches_regex", label: "matches regex" }
  ],
  time_of_day: [
    { value: "between", label: "between" },
    { value: "before", label: "before" },
    { value: "after", label: "after" }
  ]
};

const PLACEHOLDERS: Record<ConditionField, string> = {
  day_of_week: "Mon, Tue, Wed",
  file_type: "mp4, mov",
  filename: "Engineering",
  time_of_day: "09:00-17:00"
};

const HELPER_TEXT: Record<ConditionField, string> = {
  day_of_week: "Use Mon, Tue, Wed, Thu, Fri, Sat, Sun. Commas work for is-one-of.",
  file_type: "Use extensions or MIME-like values. Commas work for is-one-of.",
  filename: "Plain text. Wildcards use *. Regex must be valid JavaScript.",
  time_of_day: "Use 24-hour HH:mm. Between accepts HH:mm-HH:mm."
};

const DEFAULT_TRACE: TraceContext = {
  day: "Tue",
  filename: "Engineering Standup 2026-05-13.mp4",
  fileType: "mp4",
  time: "09:30"
};

const TEMPLATES: Template[] = [
  {
    build: () => ({
      children: [
        leafWith("filename", "contains", "Engineering"),
        leafWith("filename", "contains", "Standup"),
        leafWith("filename", "contains", "Sync")
      ],
      combinator: "OR",
      id: `group-${uuid()}`,
      type: "group"
    }),
    hint: "Filename mentions Engineering, Standup, or Sync",
    id: "engineering",
    label: "Engineering meetings"
  },
  {
    build: () => ({
      children: [
        leafWith("filename", "starts_with", "Client"),
        leafWith("filename", "contains", "Acme"),
        leafWith("filename", "contains", "Customer")
      ],
      combinator: "OR",
      id: `group-${uuid()}`,
      type: "group"
    }),
    hint: "Filename starts with Client or contains a customer name",
    id: "client",
    label: "Client calls"
  },
  {
    build: () => ({
      children: [
        leafWith("file_type", "equals", "mp4"),
        leafWith("day_of_week", "is_one_of", ["Mon", "Tue", "Wed", "Thu", "Fri"])
      ],
      combinator: "AND",
      id: `group-${uuid()}`,
      type: "group"
    }),
    hint: "Recorded Monday through Friday, file type mp4",
    id: "weekday-mp4",
    label: "Weekday MP4s"
  },
  {
    build: () => ({
      children: [
        leafWith("time_of_day", "before", "09:00"),
        leafWith("time_of_day", "after", "17:00")
      ],
      combinator: "OR",
      id: `group-${uuid()}`,
      type: "group"
    }),
    hint: "Recorded before 09:00 or after 17:00",
    id: "after-hours",
    label: "After-hours uploads"
  }
];

export function RuleConditionEditor({
  initial,
  name = "conditionTree"
}: {
  initial?: ConditionGroup;
  name?: string;
}) {
  const [tree, setTree] = useState<ConditionGroup>(() =>
    initial && initial.type === "group" ? initial : defaultTree()
  );
  const [trace, setTrace] = useState<TraceContext>(DEFAULT_TRACE);
  const [traceAdvanced, setTraceAdvanced] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const dragIdRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const payload = useMemo(() => JSON.stringify(tree), [tree]);
  const matchMap = useMemo(() => buildMatchMap(tree, trace), [tree, trace]);
  const rootMatches = matchMap.get(tree.id) === true;
  const hasAnyCondition = countLeaves(tree) > 0;
  const showTemplates = isDefaultTree(tree);

  function updateNode(id: string, updater: (node: ConditionNode) => ConditionNode) {
    setTree((prev) => updateInTree(prev, id, updater) as ConditionGroup);
  }

  function removeNode(id: string) {
    setTree((prev) => removeFromTree(prev, id));
  }

  function addLeafTo(groupId: string) {
    updateNode(groupId, (node) =>
      node.type === "group" ? { ...node, children: [...node.children, makeLeaf()] } : node
    );
  }

  function addGroupTo(groupId: string) {
    updateNode(groupId, (node) =>
      node.type === "group" ? { ...node, children: [...node.children, makeGroup("OR")] } : node
    );
  }

  function copyJson() {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(payload).then(() => {
      setJsonCopied(true);
      window.setTimeout(() => setJsonCopied(false), 1500);
    });
  }

  function handleDragStart(id: string) {
    dragIdRef.current = id;
    setDragId(id);
  }

  function handleDragEnd() {
    dragIdRef.current = null;
    setDragId(null);
  }

  function handleDropOn(targetId: string) {
    const sourceId = dragIdRef.current;
    if (!sourceId || sourceId === targetId) {
      return;
    }
    setTree((prev) => reorderSiblings(prev, sourceId, targetId));
    handleDragEnd();
  }

  return (
    <div className="rule-builder">
      <input name={name} type="hidden" value={payload} />

      {showTemplates ? (
        <div className="rule-templates">
          <span className="rule-templates-label">
            <Sparkles size={13} aria-hidden="true" />
            Start from a template
          </span>
          <div className="rule-templates-row">
            {TEMPLATES.map((template) => (
              <button
                className="rule-template-chip"
                key={template.id}
                onClick={() => setTree(template.build())}
                title={template.hint}
                type="button"
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <TracePreview
        hasAnyCondition={hasAnyCondition}
        rootMatches={rootMatches}
        trace={trace}
        traceAdvanced={traceAdvanced}
        onTraceAdvancedChange={setTraceAdvanced}
        onTraceChange={setTrace}
      />

      <GroupBlock
        depth={0}
        dragId={dragId}
        isRoot
        matchMap={matchMap}
        node={tree}
        onAddGroup={addGroupTo}
        onAddLeaf={addLeafTo}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        onDrop={handleDropOn}
        onRemove={removeNode}
        onUpdate={updateNode}
      />

      <div className="rule-json" data-open={jsonOpen || undefined}>
        <div className="rule-json-header">
          <button
            aria-expanded={jsonOpen}
            className="rule-json-toggle"
            onClick={() => setJsonOpen((value) => !value)}
            type="button"
          >
            <Braces size={13} aria-hidden="true" />
            {jsonOpen ? "Hide JSON" : "View JSON"}
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {jsonOpen ? (
            <button aria-label="Copy JSON" className="rule-json-copy" onClick={copyJson} type="button">
              <Copy size={12} aria-hidden="true" />
              {jsonCopied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </div>
        {jsonOpen ? <pre className="rule-json-body">{JSON.stringify(tree, null, 2)}</pre> : null}
      </div>
    </div>
  );
}

function TracePreview({
  hasAnyCondition,
  onTraceAdvancedChange,
  onTraceChange,
  rootMatches,
  trace,
  traceAdvanced
}: {
  hasAnyCondition: boolean;
  onTraceAdvancedChange: (value: boolean | ((current: boolean) => boolean)) => void;
  onTraceChange: (value: TraceContext | ((current: TraceContext) => TraceContext)) => void;
  rootMatches: boolean;
  trace: TraceContext;
  traceAdvanced: boolean;
}) {
  return (
    <div className="rule-trace" data-state={!hasAnyCondition ? "empty" : rootMatches ? "match" : "miss"}>
      <div className="rule-trace-header">
        <span className="rule-trace-label">Trace preview</span>
        <span className="rule-trace-result">
          {!hasAnyCondition ? (
            "Add a condition to preview routing"
          ) : rootMatches ? (
            <>
              <CheckCircle2 size={13} aria-hidden="true" /> Routes this file
            </>
          ) : (
            <>
              <XCircle size={13} aria-hidden="true" /> Does not route
            </>
          )}
        </span>
      </div>
      <div className="rule-trace-row">
        <label className="rule-trace-field">
          <span>Filename</span>
          <input
            className="rule-inline-input"
            onChange={(event) => onTraceChange((current) => ({ ...current, filename: event.target.value }))}
            placeholder="example.mp4"
            type="text"
            value={trace.filename}
          />
        </label>
        <button
          aria-expanded={traceAdvanced}
          className="rule-trace-toggle"
          data-open={traceAdvanced || undefined}
          onClick={() => onTraceAdvancedChange((value) => !value)}
          type="button"
        >
          <ChevronDown size={13} aria-hidden="true" />
          {traceAdvanced ? "Hide" : "More fields"}
        </button>
      </div>
      {traceAdvanced ? (
        <div className="rule-trace-row rule-trace-row-advanced">
          <label className="rule-trace-field">
            <span>File type</span>
            <input
              className="rule-inline-input"
              onChange={(event) => onTraceChange((current) => ({ ...current, fileType: event.target.value }))}
              placeholder="mp4"
              type="text"
              value={trace.fileType}
            />
          </label>
          <label className="rule-trace-field">
            <span>Day</span>
            <select
              className="rule-inline-select"
              onChange={(event) => onTraceChange((current) => ({ ...current, day: event.target.value }))}
              value={trace.day}
            >
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="rule-trace-field">
            <span>Time</span>
            <input
              className="rule-inline-input"
              onChange={(event) => onTraceChange((current) => ({ ...current, time: event.target.value }))}
              placeholder="09:30"
              type="text"
              value={trace.time}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function GroupBlock({
  depth,
  dragId,
  isRoot,
  matchMap,
  node,
  onAddGroup,
  onAddLeaf,
  onDragEnd,
  onDragStart,
  onDrop,
  onRemove,
  onUpdate
}: {
  depth: number;
  dragId: string | null;
  isRoot: boolean;
  matchMap: Map<string, boolean>;
  node: ConditionGroup;
  onAddGroup: (groupId: string) => void;
  onAddLeaf: (groupId: string) => void;
  onDragEnd: () => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updater: (node: ConditionNode) => ConditionNode) => void;
}) {
  const childCount = node.children.length;
  const groupMatched = matchMap.get(node.id);
  const isDragging = dragId === node.id;

  function setCombinator(next: "AND" | "OR") {
    onUpdate(node.id, (current) => (current.type === "group" ? { ...current, combinator: next } : current));
  }

  function handleNestedDragStart(event: DragEvent) {
    if (isRoot) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    onDragStart(node.id);
  }

  function handleDragOver(event: DragEvent) {
    if (isRoot || !dragId || dragId === node.id) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: DragEvent) {
    if (isRoot || !dragId || dragId === node.id) return;
    event.preventDefault();
    event.stopPropagation();
    onDrop(node.id);
  }

  return (
    <div
      className="rule-group-block"
      data-depth={depth}
      data-dragging={isDragging || undefined}
      data-match={groupMatched === undefined ? undefined : groupMatched ? "true" : "false"}
      data-root={isRoot || undefined}
      draggable={!isRoot}
      onDragEnd={!isRoot ? onDragEnd : undefined}
      onDragOver={!isRoot ? handleDragOver : undefined}
      onDragStart={!isRoot ? handleNestedDragStart : undefined}
      onDrop={!isRoot ? handleDrop : undefined}
    >
      <div className="rule-group-header">
        <span className="rule-group-conjunction">{isRoot ? "Match when" : "Or when"}</span>
        <label className="rule-group-combinator">
          <select
            aria-label="Combinator"
            className="rule-inline-select"
            onChange={(event) => setCombinator(event.target.value as "AND" | "OR")}
            value={node.combinator}
          >
            <option value="AND">ALL</option>
            <option value="OR">ANY</option>
          </select>
        </label>
        <span className="rule-group-suffix">
          of {childCount === 1 ? "this condition" : "these conditions"}
        </span>
        {!isRoot ? (
          <button
            aria-label="Remove group"
            className="rule-row-remove"
            onClick={() => onRemove(node.id)}
            type="button"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="rule-group-children">
        {node.children.map((child) =>
          child.type === "group" ? (
            <GroupBlock
              depth={depth + 1}
              dragId={dragId}
              isRoot={false}
              key={child.id}
              matchMap={matchMap}
              node={child}
              onAddGroup={onAddGroup}
              onAddLeaf={onAddLeaf}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onRemove={onRemove}
              onUpdate={onUpdate}
            />
          ) : (
            <LeafRow
              canRemove={!(isRoot && childCount === 1)}
              dragId={dragId}
              key={child.id}
              matched={matchMap.get(child.id)}
              node={child}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onRemove={onRemove}
              onUpdate={onUpdate}
            />
          )
        )}
      </div>

      <div className="rule-group-actions">
        <button className="rule-add-button" onClick={() => onAddLeaf(node.id)} type="button">
          <Plus size={13} aria-hidden="true" />
          Add condition
        </button>
        {depth < 2 ? (
          <button className="rule-add-button" onClick={() => onAddGroup(node.id)} type="button">
            <Plus size={13} aria-hidden="true" />
            Add group
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LeafRow({
  canRemove,
  dragId,
  matched,
  node,
  onDragEnd,
  onDragStart,
  onDrop,
  onRemove,
  onUpdate
}: {
  canRemove: boolean;
  dragId: string | null;
  matched: boolean | undefined;
  node: ConditionLeaf;
  onDragEnd: () => void;
  onDragStart: (id: string) => void;
  onDrop: (targetId: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updater: (node: ConditionNode) => ConditionNode) => void;
}) {
  const operators = OPERATORS_BY_FIELD[node.field];
  const isDragging = dragId === node.id;

  function updateLeaf(update: Partial<ConditionLeaf>) {
    onUpdate(node.id, (current) => (current.type === "condition" ? { ...current, ...update } : current));
  }

  function setField(nextField: ConditionField) {
    updateLeaf({
      caseSensitive: undefined,
      field: nextField,
      operator: OPERATORS_BY_FIELD[nextField][0].value,
      value: ""
    });
  }

  function handleRowDragStart(event: DragEvent) {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    onDragStart(node.id);
  }

  function handleRowDragOver(event: DragEvent) {
    if (!dragId || dragId === node.id) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }

  function handleRowDrop(event: DragEvent) {
    if (!dragId || dragId === node.id) return;
    event.preventDefault();
    event.stopPropagation();
    onDrop(node.id);
  }

  return (
    <div
      className="rule-builder-row"
      data-dragging={isDragging || undefined}
      data-match={matched === undefined ? undefined : matched ? "true" : "false"}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={handleRowDragOver}
      onDragStart={handleRowDragStart}
      onDrop={handleRowDrop}
    >
      <span aria-hidden="true" className="rule-row-handle">
        <GripVertical size={14} />
      </span>
      <select
        aria-label="Match field"
        className="rule-inline-select"
        onChange={(event) => setField(event.target.value as ConditionField)}
        value={node.field}
      >
        {FIELD_OPTIONS.map((field) => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Operator"
        className="rule-inline-select"
        onChange={(event) => updateLeaf({ operator: event.target.value as ConditionOperator })}
        value={node.operator}
      >
        {operators.map((operator) => (
          <option key={operator.value} value={operator.value}>
            {operator.label}
          </option>
        ))}
      </select>
      <input
        aria-label="Value"
        className="rule-inline-input"
        onChange={(event) => updateLeaf({ value: event.target.value })}
        placeholder={PLACEHOLDERS[node.field]}
        title={HELPER_TEXT[node.field]}
        type="text"
        value={valueToInput(node.value)}
      />
      {node.field === "filename" ? (
        <button
          aria-pressed={Boolean(node.caseSensitive)}
          className="rule-case-toggle"
          data-active={node.caseSensitive || undefined}
          onClick={() => updateLeaf({ caseSensitive: !node.caseSensitive })}
          title={node.caseSensitive ? "Case-sensitive" : "Case-insensitive"}
          type="button"
        >
          Aa
        </button>
      ) : null}
      {canRemove ? (
        <button
          aria-label="Remove condition"
          className="rule-row-remove"
          onClick={() => onRemove(node.id)}
          type="button"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function makeLeaf(): ConditionLeaf {
  return {
    field: "filename",
    id: `cond-${uuid()}`,
    operator: "contains",
    type: "condition",
    value: ""
  };
}

function makeGroup(combinator: "AND" | "OR" = "AND"): ConditionGroup {
  return {
    children: [makeLeaf()],
    combinator,
    id: `group-${uuid()}`,
    type: "group"
  };
}

function defaultTree() {
  return makeGroup("AND");
}

function leafWith(
  field: ConditionField,
  operator: ConditionOperator,
  value: ConditionLeaf["value"],
  extra: Partial<ConditionLeaf> = {}
): ConditionLeaf {
  return { ...makeLeaf(), ...extra, field, operator, value };
}

function isDefaultTree(tree: ConditionGroup) {
  if (tree.children.length !== 1) return false;
  const child = tree.children[0];
  return child.type === "condition" && child.field === "filename" && child.operator === "contains" && child.value === "";
}

function valueToInput(value: ConditionLeaf["value"]) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return `${value.start}-${value.end}`;
  return String(value ?? "");
}

function updateInTree(
  node: ConditionNode,
  id: string,
  updater: (node: ConditionNode) => ConditionNode
): ConditionNode {
  if (node.id === id) return updater(node);
  if (node.type !== "group") return node;
  return { ...node, children: node.children.map((child) => updateInTree(child, id, updater)) };
}

function removeFromTree(node: ConditionGroup, id: string): ConditionGroup {
  const children = node.children
    .filter((child) => child.id !== id)
    .map((child) => (child.type === "group" ? removeFromTree(child, id) : child))
    .filter((child) => child.type !== "group" || child.children.length > 0);

  return { ...node, children: children.length > 0 ? children : [makeLeaf()] };
}

function reorderSiblings(root: ConditionGroup, sourceId: string, targetId: string): ConditionGroup {
  function visit(group: ConditionGroup): ConditionGroup {
    const ids = group.children.map((child) => child.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex !== -1 && targetIndex !== -1) {
      const next = [...group.children];
      const [moved] = next.splice(sourceIndex, 1);
      const insertIndex = next.findIndex((child) => child.id === targetId);
      next.splice(insertIndex < 0 ? targetIndex : insertIndex, 0, moved);
      return { ...group, children: next };
    }
    return { ...group, children: group.children.map((child) => (child.type === "group" ? visit(child) : child)) };
  }
  return visit(root);
}

function countLeaves(node: ConditionNode): number {
  if (node.type === "condition") return 1;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

function buildMatchMap(root: ConditionGroup, context: TraceContext): Map<string, boolean> {
  const map = new Map<string, boolean>();
  evaluateForMap(root, context, map);
  return map;
}

function evaluateForMap(node: ConditionNode, context: TraceContext, map: Map<string, boolean>): boolean {
  if (node.type === "condition") {
    const matched = evalLeaf(node, context);
    map.set(node.id, matched);
    return matched;
  }
  const childResults = node.children.map((child) => evaluateForMap(child, context, map));
  const matched =
    node.children.length > 0 &&
    (node.combinator === "AND" ? childResults.every(Boolean) : childResults.some(Boolean));
  map.set(node.id, matched);
  return matched;
}

function evalLeaf(leaf: ConditionLeaf, context: TraceContext): boolean {
  const value = valueToInput(leaf.value).trim();
  if (!value) return false;

  if (leaf.field === "filename") {
    return evalFilename(leaf, context.filename, value);
  }
  if (leaf.field === "file_type") {
    const actual = context.fileType.trim().toLowerCase();
    return leaf.operator === "is_one_of"
      ? splitList(value).map((item) => item.toLowerCase()).includes(actual)
      : actual === value.toLowerCase();
  }
  if (leaf.field === "day_of_week") {
    const actual = context.day;
    if (leaf.operator === "is") return actual === value;
    if (leaf.operator === "is_not") return actual !== value;
    if (leaf.operator === "is_one_of") return splitList(value).includes(actual);
    return false;
  }
  if (leaf.field === "time_of_day") {
    return evalTime(leaf.operator, context.time.trim(), value);
  }
  return false;
}

function evalFilename(leaf: ConditionLeaf, actual: string, value: string): boolean {
  const actualValue = leaf.caseSensitive ? actual : actual.toLowerCase();
  const compareValue = leaf.caseSensitive ? value : value.toLowerCase();

  switch (leaf.operator) {
    case "contains":
      return actualValue.includes(compareValue);
    case "ends_with":
      return actualValue.endsWith(compareValue);
    case "equals":
      return actualValue === compareValue;
    case "matches_regex":
      try {
        return new RegExp(value, leaf.caseSensitive ? "" : "i").test(actual);
      } catch {
        return false;
      }
    case "matches_wildcard":
      try {
        return new RegExp(wildcardToRegex(value), leaf.caseSensitive ? "" : "i").test(actual);
      } catch {
        return false;
      }
    case "starts_with":
      return actualValue.startsWith(compareValue);
    default:
      return false;
  }
}

function evalTime(operator: ConditionOperator, actual: string, value: string) {
  if (!/^\d{1,2}:\d{2}$/.test(actual)) return false;
  if (operator === "between") {
    const [start = "", end = ""] = value.split(/[-,]/).map((item) => item.trim());
    if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) return false;
    return actual >= start && actual <= end;
  }
  if (!/^\d{1,2}:\d{2}$/.test(value)) return false;
  if (operator === "before") return actual < value;
  if (operator === "after") return actual > value;
  return false;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function wildcardToRegex(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
}
