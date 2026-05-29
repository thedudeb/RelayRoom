"use client";

import { useMemo, useState } from "react";
import type { ConditionField, ConditionLeaf } from "@/lib/domain/types";

// The field/operator/value inputs for one condition in the "classic" rule form.
// Operator <option> values are namespaced per field (e.g. "file_type_equals",
// "day_is") so they're globally unique within the form; normalizeOperator on the
// server strips that prefix back off. The field names are prefixed (condition2,
// nested1, ...) so several of these can coexist in one form.

type ClassicOperatorOption = {
  label: string;
  value: string;
};

const FIELD_OPTIONS: { label: string; value: ConditionField }[] = [
  { label: "Filename", value: "filename" },
  { label: "File type", value: "file_type" },
  { label: "Day of week", value: "day_of_week" },
  { label: "Time of day", value: "time_of_day" }
];

const OPERATOR_OPTIONS: Record<ConditionField, ClassicOperatorOption[]> = {
  day_of_week: [
    { label: "is", value: "day_is" },
    { label: "is not", value: "day_is_not" },
    { label: "is one of", value: "day_is_one_of" }
  ],
  file_type: [
    { label: "equals", value: "file_type_equals" },
    { label: "is one of", value: "file_type_is_one_of" }
  ],
  filename: [
    { label: "contains", value: "contains" },
    { label: "starts with", value: "starts_with" },
    { label: "ends with", value: "ends_with" },
    { label: "equals", value: "equals" },
    { label: "matches wildcard", value: "matches_wildcard" },
    { label: "matches regex", value: "matches_regex" }
  ],
  time_of_day: [
    { label: "between", value: "time_between" },
    { label: "before", value: "time_before" },
    { label: "after", value: "time_after" }
  ]
};

const FIELD_HINTS: Record<ConditionField, string> = {
  day_of_week: "Commas create a list with “is one of”. Use Mon, Tue, Wed, Thu, Fri, Sat, Sun.",
  file_type: "Commas create a list with “is one of”. Use extensions like mp4 or mov.",
  filename:
    "Filename matches use the exact text entered; commas are not split. Use separate OR conditions or regex for multiple keywords.",
  time_of_day: "Use HH:mm. Between accepts HH:mm-HH:mm."
};

const PLACEHOLDERS: Record<ConditionField, string> = {
  day_of_week: "Mon, Tue, Wed",
  file_type: "mp4, mov",
  filename: "Engineering",
  time_of_day: "09:00-17:00"
};

export function ClassicConditionInputs({
  compact = false,
  condition,
  prefix = "",
  required = false
}: {
  compact?: boolean;
  condition?: ConditionLeaf;
  prefix?: string;
  required?: boolean;
}) {
  // Track the chosen field so the operator list and hints update reactively.
  const [field, setField] = useState<ConditionField>(condition?.field || "filename");
  const operators = OPERATOR_OPTIONS[field];
  // Pick the editing condition's operator if it's valid for the current field,
  // else default to the field's first operator. The operator <select> below is
  // keyed on `${prefix}-${field}` so it remounts (resetting its value) when the
  // field changes, since a stale operator from another field wouldn't apply.
  const initialOperator = useMemo(() => {
    const value = operatorFormValue(condition);
    return operators.some((operator) => operator.value === value) ? value : operators[0].value;
  }, [condition, operators]);

  return (
    <>
      <label>
        <span>Match field</span>
        <select
          className="select"
          name={prefixedFieldName(prefix, "field")}
          onChange={(event) => setField(event.target.value as ConditionField)}
          value={field}
        >
          {FIELD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Operator</span>
        <select
          className="select"
          defaultValue={initialOperator}
          key={`${prefix}-${field}`}
          name={prefixedFieldName(prefix, "operator")}
        >
          {operators.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Value</span>
        <input
          className="input"
          defaultValue={condition ? ruleValueToInput(condition.value) : ""}
          name={prefixedFieldName(prefix, "value")}
          placeholder={PLACEHOLDERS[field]}
          required={required}
        />
        {compact ? null : <small className="field-hint">{FIELD_HINTS[field]}</small>}
      </label>
      {field === "filename" ? (
        <label className="checkbox-field">
          <input
            defaultChecked={condition?.caseSensitive || false}
            name={prefixedFieldName(prefix, "caseSensitive")}
            type="checkbox"
          />
          <span>Case-sensitive filename matching</span>
        </label>
      ) : null}
    </>
  );
}

function prefixedFieldName(prefix: string, key: string) {
  return prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;
}

// Renders a stored condition value back into the single text input: list →
// comma-joined, time range → "start-end", scalar → string.
function ruleValueToInput(value: ConditionLeaf["value"]) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return `${value.start}-${value.end}`;
  }
  return String(value);
}

// Reconstructs the namespaced operator <option> value from a stored condition,
// matching the per-field prefixes used in OPERATOR_OPTIONS.
function operatorFormValue(condition?: ConditionLeaf) {
  if (!condition) {
    return "contains";
  }
  if (condition.field === "file_type") {
    return `file_type_${condition.operator}`;
  }
  if (condition.field === "day_of_week") {
    return `day_${condition.operator}`;
  }
  if (condition.field === "time_of_day") {
    return `time_${condition.operator}`;
  }
  return condition.operator;
}
