"use client";

import { useMemo, useState } from "react";

const PRESET_OPTIONS = [
  { label: "Every 15 minutes", value: "15" },
  { label: "Every 30 minutes", value: "30" },
  { label: "Every hour", value: "60" },
  { label: "Every 6 hours", value: "360" },
  { label: "Every day", value: "1440" },
  { label: "Every 2 days", value: "2880" },
  { label: "Every 7 days", value: "10080" }
];

const CUSTOM_VALUE = "custom";

export function PollingCadenceField({
  disabled = false,
  hint,
  initialMinutes = 15
}: {
  disabled?: boolean;
  hint: string;
  initialMinutes?: number;
}) {
  const initialValue = String(initialMinutes);
  const hasPreset = PRESET_OPTIONS.some((option) => option.value === initialValue);
  const [selectedValue, setSelectedValue] = useState(hasPreset ? initialValue : CUSTOM_VALUE);
  const customDefault = useMemo(() => minutesToTime(initialMinutes), [initialMinutes]);
  const isCustom = selectedValue === CUSTOM_VALUE;

  return (
    <label>
      <span>Polling cadence</span>
      <select
        className="select"
        defaultValue={hasPreset ? initialValue : CUSTOM_VALUE}
        disabled={disabled}
        name="pollingIntervalPreset"
        onChange={(event) => setSelectedValue(event.target.value)}
        required
      >
        {PRESET_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        <option value={CUSTOM_VALUE}>Custom HH:MM</option>
      </select>
      {isCustom ? (
        <input
          className="input cadence-custom-input"
          defaultValue={customDefault}
          disabled={disabled}
          inputMode="numeric"
          name="pollingIntervalCustom"
          pattern="[0-9]{1,3}:[0-5][0-9]"
          placeholder="02:30"
          required
          title="Use HH:MM, for example 02:30. Minimum cadence is 00:05."
        />
      ) : null}
      <small className="field-hint">{hint}</small>
    </label>
  );
}

function minutesToTime(minutes: number) {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(Math.floor(minutes), 5) : 15;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
