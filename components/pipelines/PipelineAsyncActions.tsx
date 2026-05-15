"use client";

import { CircleStop, Play, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ActionState =
  | {
      message: string;
      tone: "danger" | "success";
    }
  | undefined;

interface ActionResponse {
  error?: string;
  ignored?: number;
  message?: string;
  created?: number;
  skippedExisting?: number;
}

export function PipelineAsyncActions({ pipelineId }: { pipelineId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>();
  const [busyAction, setBusyAction] = useState<"detect" | "probe" | null>(null);

  async function runDetection() {
    setBusyAction("detect");
    setState(undefined);

    try {
      const payload = await postAction(`/api/pipelines/${pipelineId}/detect`);
      setState({
        tone: "success",
        message: `Detection finished. Created ${payload.created || 0} queue item${payload.created === 1 ? "" : "s"}, skipped ${payload.skippedExisting || 0} already-seen file${payload.skippedExisting === 1 ? "" : "s"}, ignored ${payload.ignored || 0} unsupported file${payload.ignored === 1 ? "" : "s"}.`
      });
      router.refresh();
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Detection failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function checkDriveFolder() {
    setBusyAction("probe");
    setState(undefined);

    try {
      const payload = await postAction(`/api/pipelines/${pipelineId}/probe`);
      setState({
        tone: "success",
        message: payload.message || "Drive folder check finished."
      });
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Drive folder check failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <button
        className="button"
        disabled={busyAction !== null}
        onClick={runDetection}
        type="button"
      >
        <Search aria-hidden="true" size={16} />
        {busyAction === "detect" ? "Running..." : "Run detection"}
      </button>
      <button
        className="button"
        disabled={busyAction !== null}
        onClick={checkDriveFolder}
        type="button"
      >
        {busyAction === "probe" ? "Checking..." : "Check Drive folder"}
      </button>
      {state ? (
        <div className={`notice inline ${state.tone}`} role={state.tone === "danger" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}
    </>
  );
}

export function PipelineStatusControls({
  initialStatus,
  pipelineId
}: {
  initialStatus: "disabled" | "enabled" | "errored";
  pipelineId: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [state, setState] = useState<ActionState>();
  const [busyAction, setBusyAction] = useState<"detect" | "disable" | "enable" | "probe" | null>(
    null
  );
  const isEnabled = status === "enabled";

  async function togglePipeline() {
    const nextStatus = isEnabled ? "disabled" : "enabled";
    if (
      isEnabled &&
      !window.confirm(
        "Disable this pipeline? RelayRoom will stop detecting new recordings until you enable it again."
      )
    ) {
      return;
    }

    setBusyAction(nextStatus === "enabled" ? "enable" : "disable");
    setState(undefined);

    try {
      await postAction(`/api/pipelines/${pipelineId}/status`, {
        status: nextStatus
      });
      setStatus(nextStatus);
      setState({
        tone: "success",
        message:
          nextStatus === "enabled"
            ? "Pipeline enabled. New files after this point can be detected."
            : "Pipeline disabled. Existing queue items are still visible."
      });
      router.refresh();
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Pipeline status update failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function runDetection() {
    setBusyAction("detect");
    setState(undefined);

    try {
      const payload = await postAction(`/api/pipelines/${pipelineId}/detect`);
      setState({
        tone: "success",
        message: `Detection finished. Created ${payload.created || 0} queue item${payload.created === 1 ? "" : "s"}, skipped ${payload.skippedExisting || 0} already-seen file${payload.skippedExisting === 1 ? "" : "s"}, ignored ${payload.ignored || 0} unsupported file${payload.ignored === 1 ? "" : "s"}.`
      });
      router.refresh();
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Detection failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function checkDriveFolder() {
    setBusyAction("probe");
    setState(undefined);

    try {
      const payload = await postAction(`/api/pipelines/${pipelineId}/probe`);
      setState({
        tone: "success",
        message: payload.message || "Drive folder check finished."
      });
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Drive folder check failed."
      });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="actions">
      <button
        className={isEnabled ? "button danger" : "button primary"}
        disabled={busyAction !== null}
        onClick={togglePipeline}
        type="button"
      >
        {isEnabled ? (
          <CircleStop aria-hidden="true" size={16} />
        ) : (
          <Play aria-hidden="true" size={16} />
        )}
        {busyAction === "enable"
          ? "Enabling..."
          : busyAction === "disable"
            ? "Disabling..."
            : isEnabled
              ? "Disable pipeline"
              : "Enable pipeline"}
      </button>
      {isEnabled ? (
        <>
          <button
            className="button"
            disabled={busyAction !== null}
            onClick={runDetection}
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            {busyAction === "detect" ? "Running..." : "Run detection"}
          </button>
          <button
            className="button"
            disabled={busyAction !== null}
            onClick={checkDriveFolder}
            type="button"
          >
            {busyAction === "probe" ? "Checking..." : "Check Drive folder"}
          </button>
        </>
      ) : null}
      {state ? (
        <div className={`notice inline ${state.tone}`} role={state.tone === "danger" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

async function postAction(url: string, body?: Record<string, string>): Promise<ActionResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as ActionResponse;

  if (!response.ok || payload.error) {
    throw new Error(pipelineErrorMessage(payload.error));
  }

  return payload;
}

function pipelineErrorMessage(error?: string) {
  const messages: Record<string, string> = {
    DriveListFailed: "Google Drive could not list files in this folder.",
    MissingActiveDriveConnection: "Reconnect Google Drive before running detection.",
    MissingPipelineFields: "Fill out every required pipeline field.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    PipelineNotEnabled: "Enable the pipeline before running detection.",
    PipelineNotFound: "Pipeline not found.",
    TokenRefreshFailed: "Google could not refresh the Drive token. Reconnect Drive and try again.",
    Unauthorized: "Log in before using this pipeline."
  };

  return messages[error || ""] || `Pipeline action failed: ${error || "Unknown error"}`;
}
