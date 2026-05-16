"use client";

import { Archive, CircleStop, Play, RotateCcw, Search } from "lucide-react";
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
  excludedByWatermark?: number;
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
        message: formatDetectionMessage(payload)
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
  const [busyAction, setBusyAction] = useState<
    "archive" | "detect" | "disable" | "enable" | "probe" | null
  >(null);
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
        message: formatDetectionMessage(payload)
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

  async function archivePipeline() {
    if (
      !window.confirm(
        "Archive this pipeline? RelayRoom will stop detecting this folder and hide the pipeline from this page. Existing queue history will stay visible."
      )
    ) {
      return;
    }

    setBusyAction("archive");
    setState(undefined);

    try {
      await postAction(`/api/pipelines/${pipelineId}/archive`);
      setState({
        tone: "success",
        message: "Pipeline archived. Existing queue history remains visible."
      });
      router.push("/pipelines?archived=true");
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Pipeline archive failed."
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
      <button
        className="button"
        disabled={busyAction !== null}
        onClick={archivePipeline}
        type="button"
      >
        <Archive aria-hidden="true" size={16} />
        {busyAction === "archive" ? "Archiving..." : "Archive pipeline"}
      </button>
      {state ? (
        <div className={`notice inline ${state.tone}`} role={state.tone === "danger" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

export function ArchivedPipelineControls({ pipelineId }: { pipelineId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>();
  const [isRestoring, setIsRestoring] = useState(false);

  async function restorePipeline() {
    if (
      !window.confirm(
        "Restore this pipeline? RelayRoom will bring it back disabled so you can review it before enabling detection."
      )
    ) {
      return;
    }

    setIsRestoring(true);
    setState(undefined);

    try {
      await postAction(`/api/pipelines/${pipelineId}/archive`, undefined, "DELETE");
      setState({
        tone: "success",
        message: "Pipeline restored as disabled. Review it before enabling detection."
      });
      router.push("/pipelines?restored=true");
    } catch (error) {
      setState({
        tone: "danger",
        message: error instanceof Error ? error.message : "Pipeline restore failed."
      });
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div className="actions">
      <button
        className="button primary"
        disabled={isRestoring}
        onClick={restorePipeline}
        type="button"
      >
        <RotateCcw aria-hidden="true" size={16} />
        {isRestoring ? "Restoring..." : "Restore pipeline"}
      </button>
      {state ? (
        <div className={`notice inline ${state.tone}`} role={state.tone === "danger" ? "alert" : "status"}>
          {state.message}
        </div>
      ) : null}
    </div>
  );
}

async function postAction(
  url: string,
  body?: Record<string, string>,
  method = "POST"
): Promise<ActionResponse> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    method
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
    PipelineArchived: "This pipeline has been archived.",
    PipelineNotEnabled: "Enable the pipeline before running detection.",
    PipelineNotFound: "Pipeline not found.",
    TokenRefreshFailed: "Google could not refresh the Drive token. Reconnect Drive and try again.",
    Unauthorized: "Log in before using this pipeline."
  };

  return messages[error || ""] || `Pipeline action failed: ${error || "Unknown error"}`;
}

function formatDetectionMessage(payload: ActionResponse) {
  const created = payload.created || 0;
  const skippedExisting = payload.skippedExisting || 0;
  const ignored = payload.ignored || 0;
  const excludedByWatermark = payload.excludedByWatermark || 0;

  return `Detection finished. Created ${created} queue item${created === 1 ? "" : "s"}, skipped ${skippedExisting} already-queued file${skippedExisting === 1 ? "" : "s"}, excluded ${excludedByWatermark} pre-watermark video file${excludedByWatermark === 1 ? "" : "s"}, ignored ${ignored} unsupported file${ignored === 1 ? "" : "s"}.`;
}
