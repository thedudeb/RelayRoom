"use client";

import { CheckCircle2, Play, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { DriveFileMetadata, EvaluationTrace, Pipeline, RuleTrace } from "@/lib/domain/types";
import { evaluatePipelineRules } from "@/lib/rules/rule-engine";

interface TraceSummary {
  key: string;
  label: string;
  matched: boolean;
}

// Interactive "what would route?" sandbox in the rule editor. Lets the user type
// a hypothetical file and runs the real evaluatePipelineRules engine on it
// client-side — no server round-trip — showing the matched rule and a per-node
// trace. Time-based rules are evaluated in the browser's timezone.
export function RuleTester({ pipeline }: { pipeline: Pipeline }) {
  const [filename, setFilename] = useState("Engineering Standup 2026-05-13.mp4");
  const [mimeType, setMimeType] = useState("video/mp4");
  const [createdTime, setCreatedTime] = useState(() => localDateTimeValue(new Date()));
  const [sizeMb, setSizeMb] = useState("24");
  const timezone = useMemo(() => browserTimezone(), []);

  // Recompute the routing result whenever any sample input changes. Builds a
  // synthetic DriveFileMetadata and falls back to sane values for blank/invalid
  // inputs so the engine never sees garbage.
  const result = useMemo(() => {
    const created = new Date(createdTime);
    const file: DriveFileMetadata = {
      createdTime: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(),
      extension: extensionFromFilename(filename),
      filename: filename || "Untitled.mp4",
      id: "rule-tester-file",
      mimeType: mimeType || "video/mp4",
      sizeBytes: Math.max(Number(sizeMb) || 0, 0) * 1024 * 1024,
      sourceFolderId: pipeline.sourceFolderId
    };

    return evaluatePipelineRules(pipeline, file, timezone);
  }, [createdTime, filename, mimeType, pipeline, sizeMb, timezone]);

  const matchedRule = result.matchedRule;

  return (
    <section className="rule-tester" aria-label="Rule tester">
      <div className="rule-tester-header">
        <div>
          <h3>Rule tester</h3>
          <p className="muted">
            Try a sample file against this pipeline before dropping it into Drive.
          </p>
        </div>
        <span className={`badge ${matchedRule ? "uploaded" : "failed"}`}>
          {matchedRule ? "routes" : "no route"}
        </span>
      </div>
      <div className="rule-tester-grid">
        <label>
          <span>Filename</span>
          <input
            className="input"
            onChange={(event) => setFilename(event.target.value)}
            value={filename}
          />
        </label>
        <label>
          <span>MIME type</span>
          <select
            className="select"
            onChange={(event) => setMimeType(event.target.value)}
            value={mimeType}
          >
            <option value="video/mp4">video/mp4</option>
            <option value="video/quicktime">video/quicktime</option>
            <option value="video/webm">video/webm</option>
            <option value="video/mpeg">video/mpeg</option>
            <option value="image/jpeg">image/jpeg</option>
            <option value="application/pdf">application/pdf</option>
          </select>
        </label>
        <label>
          <span>Created time</span>
          <input
            className="input"
            onChange={(event) => setCreatedTime(event.target.value)}
            type="datetime-local"
            value={createdTime}
          />
        </label>
        <label>
          <span>Size MB</span>
          <input
            className="input"
            min="0"
            onChange={(event) => setSizeMb(event.target.value)}
            type="number"
            value={sizeMb}
          />
        </label>
      </div>
      <div className="rule-tester-result">
        <div className="rule-tester-result-main">
          {matchedRule ? (
            <CheckCircle2 aria-hidden="true" size={18} />
          ) : (
            <XCircle aria-hidden="true" size={18} />
          )}
          <div>
            <strong>
              {matchedRule
                ? `${matchedRule.name} routes to ${result.playlist?.name || "the selected playlist"}`
                : "No routing rule matched this file"}
            </strong>
            <p className="muted">
              Title preview: {result.title || filename || "Untitled"}
            </p>
          </div>
        </div>
        <details>
          <summary>
            <Play aria-hidden="true" size={14} />
            Trace
          </summary>
          <div className="rule-trace-list">
            {result.ruleTraces.map((trace) => (
              <RuleTraceRow key={trace.ruleId} trace={trace} />
            ))}
          </div>
        </details>
      </div>
    </section>
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

// Flattens the recursive evaluation trace into a flat list of per-condition
// summary chips for display. The `path` accumulates node indices to keep React
// keys unique across the tree.
function flattenTrace(trace: EvaluationTrace, path = "root"): TraceSummary[] {
  if (trace.type === "condition") {
    return [
      {
        key: `${path}-${trace.nodeId}`,
        label: `${trace.field.replaceAll("_", " ")} ${trace.operator.replaceAll("_", " ")} ${formatExpected(trace.expected)}: ${trace.matched ? "yes" : "no"}`,
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

function extensionFromFilename(filename: string) {
  return /\.([^.\/\\]+)$/.exec(filename.trim())?.[1]?.toLowerCase();
}

// Best-effort IANA timezone of the browser, defaulting to UTC if unavailable.
function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Formats a Date as the local "YYYY-MM-DDTHH:mm" string a datetime-local input
// expects. Subtracts the timezone offset first so toISOString (which is UTC)
// yields local wall-clock time rather than shifting it.
function localDateTimeValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
