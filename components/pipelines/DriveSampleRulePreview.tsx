"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { DriveFileMetadata, Pipeline, RoutingResult } from "@/lib/domain/types";
import {
  describeUnsupportedVideoFile,
  getFileExtension,
  isYouTubeSupportedVideoFile
} from "@/lib/detection/youtube-supported-formats";
import { evaluatePipelineRules } from "@/lib/rules/rule-engine";
import { RuleTraceList } from "@/components/rules/RuleTraceList";

interface ProbeFile {
  createdTime?: string;
  id?: string;
  mimeType?: string;
  name?: string;
  size?: string;
}

interface ProbeResponse {
  error?: string;
  files?: ProbeFile[];
  message?: string;
}

interface SampleEvaluation {
  file: ProbeFile;
  result?: RoutingResult;
  skippedReason?: string;
}

export function DriveSampleRulePreview({ pipeline }: { pipeline: Pipeline }) {
  const [files, setFiles] = useState<ProbeFile[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timezone = useMemo(() => browserTimezone(), []);

  const evaluations = useMemo<SampleEvaluation[]>(
    () =>
      files.map((file) => {
        const skippedReason = unevaluableReason(file);
        if (skippedReason) {
          return { file, skippedReason };
        }

        const metadata: DriveFileMetadata = {
          createdTime: file.createdTime!,
          extension: getFileExtension(file.name),
          filename: file.name!,
          id: file.id!,
          mimeType: file.mimeType!,
          sizeBytes: file.size ? Number(file.size) : undefined,
          sourceFolderId: pipeline.sourceFolderId
        };

        return {
          file,
          result: evaluatePipelineRules(pipeline, metadata, timezone)
        };
      }),
    [files, pipeline, timezone]
  );

  async function loadSamples() {
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/pipelines/${pipeline.id}/probe`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as ProbeResponse;
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "Drive sample preview failed.");
      }

      setFiles(payload.files || []);
      setMessage(payload.message || "Drive samples loaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drive sample preview failed.");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }

  const routedCount = evaluations.filter((evaluation) => evaluation.result?.playlist).length;
  const attentionCount = evaluations.filter(
    (evaluation) => evaluation.skippedReason || !evaluation.result?.playlist
  ).length;

  return (
    <section className="drive-sample-preview" aria-label="Drive sample rule preview">
      <div className="rule-tester-header">
        <div>
          <h3>Drive sample preview</h3>
          <p className="muted">
            Run this pipeline against recent files already visible in the source folder.
          </p>
        </div>
        <button className="button" disabled={isLoading} onClick={loadSamples} type="button">
          <RefreshCw aria-hidden="true" size={15} />
          {isLoading ? "Loading..." : files.length ? "Refresh samples" : "Load samples"}
        </button>
      </div>
      {message ? (
        <div className="notice inline success" role="status">
          {files.length
            ? `${routedCount} would route, ${attentionCount} need attention.`
            : message}
        </div>
      ) : null}
      {error ? (
        <div className="notice inline danger" role="alert">
          {error}
        </div>
      ) : null}
      {evaluations.length ? (
        <div className="sample-evaluation-list">
          {evaluations.map((evaluation, index) => (
            <SampleEvaluationRow
              evaluation={evaluation}
              key={evaluation.file.id || `${evaluation.file.name}-${index}`}
            />
          ))}
        </div>
      ) : (
        <p className="detail-section-empty">
          Load samples to preview how real Drive files would route.
        </p>
      )}
    </section>
  );
}

function SampleEvaluationRow({ evaluation }: { evaluation: SampleEvaluation }) {
  const file = evaluation.file;
  const result = evaluation.result;
  const matchedRule = result?.matchedRule;

  return (
    <article className="sample-evaluation-item">
      <div className="sample-evaluation-main">
        {evaluation.skippedReason ? (
          <AlertTriangle aria-hidden="true" size={17} />
        ) : matchedRule ? (
          <CheckCircle2 aria-hidden="true" size={17} />
        ) : (
          <XCircle aria-hidden="true" size={17} />
        )}
        <div>
          <strong data-private>{file.name || file.id || "Untitled Drive file"}</strong>
          <p className="muted">
            {file.mimeType || "unknown type"}
            {file.createdTime ? ` · ${new Date(file.createdTime).toLocaleString()}` : ""}
          </p>
        </div>
        <span className={`badge ${matchedRule ? "uploaded" : "needs_routing"}`}>
          {evaluation.skippedReason ? "ignored" : matchedRule ? "routes" : "no route"}
        </span>
      </div>
      <p className="sample-evaluation-summary">
        {evaluation.skippedReason
          ? evaluation.skippedReason
          : matchedRule
            ? `${matchedRule.name} → ${result?.playlist?.name || "selected playlist"}`
            : "No routing rule matched this file."}
      </p>
      {result ? (
        <details>
          <summary>Trace</summary>
          <RuleTraceList traces={result.ruleTraces} />
        </details>
      ) : null}
    </article>
  );
}

function unevaluableReason(file: ProbeFile) {
  if (!file.id || !file.name || !file.mimeType || !file.createdTime) {
    return "Drive did not return enough metadata to evaluate this file.";
  }

  if (!isYouTubeSupportedVideoFile({ filename: file.name, mimeType: file.mimeType })) {
    return describeUnsupportedVideoFile({ filename: file.name, mimeType: file.mimeType });
  }

  return "";
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
