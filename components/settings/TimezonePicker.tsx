"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const commonTimezones = [
  "UTC",
  "America/Halifax",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Australia/Sydney"
];

const fallbackTimezones = [
  ...commonTimezones,
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/Anchorage",
  "America/Argentina/Buenos_Aires",
  "America/Bogota",
  "America/Caracas",
  "America/Mexico_City",
  "America/Phoenix",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "Pacific/Honolulu"
];

export function TimezonePicker({
  disabled,
  initialTimezone
}: {
  disabled?: boolean;
  initialTimezone: string;
}) {
  const [selectedTimezone, setSelectedTimezone] = useState(initialTimezone || "UTC");
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [browserTimezone, setBrowserTimezone] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const timezones = useMemo(() => supportedTimezones(selectedTimezone, browserTimezone), [
    browserTimezone,
    selectedTimezone
  ]);
  const filteredTimezones = useMemo(() => filterTimezones(timezones, query), [query, timezones]);
  const commonMatches = filteredTimezones.filter((timezone) => commonTimezones.includes(timezone));
  const otherMatches = filteredTimezones.filter((timezone) => !commonTimezones.includes(timezone));

  useEffect(() => {
    setBrowserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
  }, []);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  function selectTimezone(timezone: string) {
    setSelectedTimezone(timezone);
    setQuery("");
    setIsOpen(false);
  }

  return (
    <div className="timezone-picker" ref={pickerRef}>
      <input name="timezone" type="hidden" value={selectedTimezone} />
      <button
        aria-expanded={isOpen}
        className="timezone-picker-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <span>
          <strong>{formatTimezoneLabel(selectedTimezone)}</strong>
          <small>{selectedTimezone}</small>
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {browserTimezone ? (
        <button
          className="timezone-detect-button"
          disabled={disabled || selectedTimezone === browserTimezone}
          onClick={() => selectTimezone(browserTimezone)}
          type="button"
        >
          Use browser timezone: {browserTimezone}
        </button>
      ) : null}
      {isOpen ? (
        <div className="timezone-picker-popover">
          <input
            autoFocus
            className="input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search city, region, or timezone"
            type="search"
            value={query}
          />
          <div className="timezone-picker-list" role="listbox">
            <TimezoneGroup
              currentTimezone={selectedTimezone}
              label="Common"
              onSelect={selectTimezone}
              timezones={commonMatches}
            />
            <TimezoneGroup
              currentTimezone={selectedTimezone}
              label="All timezones"
              onSelect={selectTimezone}
              timezones={otherMatches}
            />
            {filteredTimezones.length === 0 ? (
              <div className="timezone-empty">No matching timezones.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TimezoneGroup({
  currentTimezone,
  label,
  onSelect,
  timezones
}: {
  currentTimezone: string;
  label: string;
  onSelect: (timezone: string) => void;
  timezones: string[];
}) {
  if (timezones.length === 0) {
    return null;
  }

  return (
    <div className="timezone-group">
      <div className="timezone-group-label">{label}</div>
      {timezones.map((timezone) => (
        <button
          aria-selected={timezone === currentTimezone}
          className={timezone === currentTimezone ? "timezone-option selected" : "timezone-option"}
          key={timezone}
          onClick={() => onSelect(timezone)}
          role="option"
          type="button"
        >
          <span>
            <strong>{formatTimezoneLabel(timezone)}</strong>
            <small>{timezone}</small>
          </span>
          {timezone === currentTimezone ? <span aria-hidden="true">✓</span> : null}
        </button>
      ))}
    </div>
  );
}

function supportedTimezones(currentTimezone: string, browserTimezone: string | null) {
  const timezones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : fallbackTimezones;

  return Array.from(new Set([currentTimezone, browserTimezone || "", ...commonTimezones, ...timezones]))
    .filter(Boolean)
    .sort((a, b) => {
      const commonA = commonTimezones.includes(a);
      const commonB = commonTimezones.includes(b);
      if (commonA !== commonB) return commonA ? -1 : 1;
      return a.localeCompare(b);
    });
}

function filterTimezones(timezones: string[], query: string) {
  const normalizedQuery = normalizeTimezone(query);
  if (!normalizedQuery) {
    return timezones;
  }

  return timezones.filter((timezone) =>
    normalizeTimezone(`${timezone} ${formatTimezoneLabel(timezone)}`).includes(normalizedQuery)
  );
}

function formatTimezoneLabel(timezone: string) {
  const parts = timezone.split("/");
  const city = parts[parts.length - 1]?.replaceAll("_", " ") || timezone;
  const region = parts.length > 1 ? parts[0] : "Global";
  return `${city} · ${region}`;
}

function normalizeTimezone(value: string) {
  return value.toLowerCase().replace(/[_/.-]/g, " ").replace(/\s+/g, " ").trim();
}
