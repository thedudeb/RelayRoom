import {
  ConnectionKind,
  ConnectionStatus,
  PipelineMode,
  PipelineStatus,
  PrivacyStatus
} from "@prisma/client";
import { AppShell } from "@/components/layout/AppShell";
import { PipelineStatusControls } from "@/components/pipelines/PipelineAsyncActions";
import { RulePreview } from "@/components/pipelines/RulePreview";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getPipelinesForDemo,
  getPipelinesForUser,
  getQueueItemsForDemo,
  getQueueItemsForUser
} from "@/lib/data/repository";
import { prisma } from "@/lib/db/prisma";
import type { Pipeline, QueueItem } from "@/lib/domain/types";
import { DriveFolderPicker } from "@/components/pipelines/DriveFolderPicker";
import { YouTubePlaylistPicker } from "@/components/pipelines/YouTubePlaylistPicker";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

interface ConnectionOption {
  id: string;
  label: string;
  detail: string;
}

export default async function PipelinesPage({
  searchParams
}: {
  searchParams?: Promise<{
    created?: string;
    demo?: string;
    detected?: string;
    error?: string;
    ignored?: string;
    probe?: string;
    skipped?: string;
    updated?: string;
  }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const [pipelines, queueItems] = access.isDemo
    ? await Promise.all([getPipelinesForDemo(), getQueueItemsForDemo()])
    : await Promise.all([
        getPipelinesForUser(access.userId),
        getQueueItemsForUser(access.userId)
      ]);
  const connectionOptions = access.isDemo
    ? { driveConnections: [], youtubeConnections: [] }
    : await getPipelineConnectionOptions(access.userId);

  return (
    <AppShell
      title="Pipelines"
      subtitle="Configure watched Drive folders, destination channels, privacy, and routing rules."
      account={access.account}
      isDemo={access.isDemo}
    >
      {params?.created ? (
        <div className="notice success" role="status">
          Pipeline created. Enable it after the Drive folder and destination settings look right.
        </div>
      ) : null}
      {params?.updated ? (
        <div className="notice success" role="status">
          Pipeline updated.
        </div>
      ) : null}
      {params?.detected ? (
        <div className="notice success" role="status">
          Detection finished. Created {params.detected} queue item{params.detected === "1" ? "" : "s"}
          {params.skipped ? `, skipped ${params.skipped} already-seen file${params.skipped === "1" ? "" : "s"}` : ""}
          {params.ignored ? `, ignored ${params.ignored} unsupported file${params.ignored === "1" ? "" : "s"}` : ""}.
        </div>
      ) : null}
      {params?.probe ? (
        <div className="notice success" role="status">
          {decodeURIComponent(params.probe)}
        </div>
      ) : null}
      {params?.error ? (
        <div className="notice danger" role="alert">
          {pipelineErrorMessage(params.error)}
        </div>
      ) : null}
      <div className="split">
        <section className="stack">
          <CreatePipelinePanel
            driveConnections={connectionOptions.driveConnections}
            isDemo={access.isDemo}
            youtubeConnections={connectionOptions.youtubeConnections}
          />
          {pipelines.map((pipeline) => (
            <div className="panel" key={pipeline.id}>
              <div className="section-header">
                <div>
                  <h2>{pipeline.name}</h2>
                  <p className="muted">
                    {pipeline.sourceFolderName} → {pipeline.destinationChannelName}
                  </p>
                </div>
                <span className={`badge ${pipeline.status === "enabled" ? "uploaded" : "failed"}`}>
                  {pipeline.status}
                </span>
              </div>
              <div className="filter-row">
                <span className="rule-pill">{pipeline.mode.replaceAll("_", " ")}</span>
                <span className="rule-pill">{pipeline.privacyStatus}</span>
                <span className="rule-pill">
                  {waitingCount(queueItems, pipeline.id)} waiting
                </span>
              </div>
              <p className="muted">
                Cold start watermark: {new Date(pipeline.processedFromTime).toLocaleString()}
              </p>
              {!access.isDemo ? <EditPipelinePanel pipeline={pipeline} /> : null}
              {!access.isDemo ? (
                <PipelineStatusControls
                  initialStatus={pipeline.status}
                  pipelineId={pipeline.id}
                />
              ) : null}
            </div>
          ))}
          {pipelines.length === 0 ? (
            <div className="empty-state">
              <strong>No pipelines yet.</strong>
              <p>Use the new pipeline form above to create your first watched-folder pipeline.</p>
            </div>
          ) : null}
        </section>
        <aside className="stack">
          <div className="panel">
            <h2>Rule Builder Preview</h2>
            <p className="muted">
              This is the first visual pass over the condition tree. The next step is turning
              these blocks into inline editable controls with validation and drag ordering.
            </p>
          </div>
          {pipelines[0] ? <RulePreview pipeline={pipelines[0]} /> : null}
        </aside>
      </div>
    </AppShell>
  );
}

function CreatePipelinePanel({
  driveConnections,
  isDemo,
  youtubeConnections
}: {
  driveConnections: ConnectionOption[];
  isDemo: boolean;
  youtubeConnections: ConnectionOption[];
}) {
  const canCreate = !isDemo && driveConnections.length > 0 && youtubeConnections.length > 0;

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h2>New pipeline</h2>
          <p className="muted">Create a watched Drive folder routed to a YouTube destination.</p>
        </div>
      </div>
      <form action={createPipelineAction} className="form-grid">
        <label>
          <span>Pipeline name</span>
          <input
            className="input"
            defaultValue="Meeting recordings"
            disabled={!canCreate}
            name="name"
            required
          />
        </label>
        <label>
          <span>Drive connection</span>
          <select className="select" disabled={!canCreate} name="driveConnectionId" required>
            {driveConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.label} - {connection.detail}
              </option>
            ))}
          </select>
        </label>
        <YouTubePlaylistPicker disabled={!canCreate} youtubeConnections={youtubeConnections} />
        <DriveFolderPicker disabled={!canCreate} />
        <label>
          <span>Upload privacy</span>
          <select className="select" defaultValue={PrivacyStatus.UNLISTED} disabled={!canCreate} name="privacyStatus">
            <option value={PrivacyStatus.UNLISTED}>Unlisted</option>
            <option value={PrivacyStatus.PUBLIC}>Public</option>
          </select>
        </label>
        <label>
          <span>Mode</span>
          <select className="select" defaultValue={PipelineMode.MANUAL_APPROVAL} disabled={!canCreate} name="mode">
            <option value={PipelineMode.MANUAL_APPROVAL}>Manual approval</option>
            <option value={PipelineMode.AUTO}>Auto upload</option>
          </select>
        </label>
        <label>
          <span>Polling cadence</span>
          <select
            className="select"
            defaultValue="15"
            disabled={!canCreate}
            name="pollingIntervalMinutes"
            required
          >
            <option value="15">Every 15 minutes</option>
            <option value="30">Every 30 minutes</option>
            <option value="60">Every hour</option>
            <option value="360">Every 6 hours</option>
            <option value="1440">Every day</option>
            <option value="2880">Every 2 days</option>
            <option value="10080">Every 7 days</option>
          </select>
          <small className="field-hint">Saved as minutes internally.</small>
        </label>
        <div className="form-actions">
          <button className="button primary" disabled={!canCreate} type="submit">
            Create pipeline
          </button>
          {!canCreate ? (
            <span className="muted">
              Connect one active Drive account and one active YouTube account first.
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function waitingCount(queueItems: QueueItem[], pipelineId: string): number {
  return queueItems.filter(
    (item) =>
      item.pipelineId === pipelineId &&
      ["needs_approval", "needs_routing", "failed"].includes(item.status)
  ).length;
}

function EditPipelinePanel({ pipeline }: { pipeline: Pipeline }) {
  const mode = pipeline.mode === "manual_approval" ? PipelineMode.MANUAL_APPROVAL : PipelineMode.AUTO;
  const privacyStatus =
    pipeline.privacyStatus === "public" ? PrivacyStatus.PUBLIC : PrivacyStatus.UNLISTED;

  return (
    <details className="edit-panel">
      <summary>Edit pipeline</summary>
      <form action={updatePipelineAction} className="form-grid">
        <input name="pipelineId" type="hidden" value={pipeline.id} />
        <label>
          <span>Pipeline name</span>
          <input className="input" defaultValue={pipeline.name} name="name" required />
        </label>
        <DriveFolderPicker
          disabled={false}
          initialFolderId={pipeline.sourceFolderId}
          initialFolderName={pipeline.sourceFolderName}
        />
        <label>
          <span>Upload privacy</span>
          <select className="select" defaultValue={privacyStatus} name="privacyStatus">
            <option value={PrivacyStatus.UNLISTED}>Unlisted</option>
            <option value={PrivacyStatus.PUBLIC}>Public</option>
          </select>
        </label>
        <label>
          <span>Mode</span>
          <select className="select" defaultValue={mode} name="mode">
            <option value={PipelineMode.MANUAL_APPROVAL}>Manual approval</option>
            <option value={PipelineMode.AUTO}>Auto upload</option>
          </select>
        </label>
        <label>
          <span>Polling cadence</span>
          <select
            className="select"
            defaultValue={String(pipeline.pollingIntervalMinutes)}
            name="pollingIntervalMinutes"
            required
          >
            <option value="15">Every 15 minutes</option>
            <option value="30">Every 30 minutes</option>
            <option value="60">Every hour</option>
            <option value="360">Every 6 hours</option>
            <option value="1440">Every day</option>
            <option value="2880">Every 2 days</option>
            <option value="10080">Every 7 days</option>
          </select>
          <small className="field-hint">Changing cadence affects future scheduled runs.</small>
        </label>
        <div className="form-actions">
          <button className="button primary" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </details>
  );
}

async function getPipelineConnectionOptions(userId: string) {
  const connections = await prisma.oAuthConnection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      userId
    },
    orderBy: { connectedAt: "asc" },
    select: {
      accountEmail: true,
      channelName: true,
      id: true,
      kind: true,
      label: true
    }
  });

  return {
    driveConnections: connections
      .filter((connection) => connection.kind === ConnectionKind.DRIVE)
      .map((connection) => ({
        id: connection.id,
        label: connection.label,
        detail: connection.accountEmail
      })),
    youtubeConnections: connections
      .filter((connection) => connection.kind === ConnectionKind.YOUTUBE)
      .map((connection) => ({
        id: connection.id,
        label: connection.channelName || connection.label,
        detail: connection.accountEmail
      }))
  };
}

async function createPipelineAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const name = getRequiredFormValue(formData, "name");
  const driveConnectionId = getRequiredFormValue(formData, "driveConnectionId");
  const youtubeConnectionId = getRequiredFormValue(formData, "youtubeConnectionId");
  const youtubePlaylistId = getRequiredFormValue(formData, "youtubePlaylistId");
  const youtubePlaylistName = getRequiredFormValue(formData, "youtubePlaylistName");
  const sourceFolderId = getRequiredFormValue(formData, "sourceFolderId");
  const sourceFolderName = getRequiredFormValue(formData, "sourceFolderName");
  const mode = getEnumValue(formData, "mode", [PipelineMode.AUTO, PipelineMode.MANUAL_APPROVAL]);
  const privacyStatus = getEnumValue(formData, "privacyStatus", [
    PrivacyStatus.PUBLIC,
    PrivacyStatus.UNLISTED
  ]);
  const pollingIntervalMinutes = Number(formData.get("pollingIntervalMinutes") || 15);

  if (
    !name ||
    !driveConnectionId ||
    !youtubeConnectionId ||
    !youtubePlaylistId ||
    !youtubePlaylistName ||
    !sourceFolderId ||
    !sourceFolderName
  ) {
    redirect("/pipelines?error=MissingPipelineFields");
  }

  const [driveConnection, youtubeConnection] = await Promise.all([
    prisma.oAuthConnection.findFirst({
      where: {
        id: driveConnectionId,
        kind: ConnectionKind.DRIVE,
        status: ConnectionStatus.ACTIVE,
        userId: access.userId
      }
    }),
    prisma.oAuthConnection.findFirst({
      where: {
        id: youtubeConnectionId,
        kind: ConnectionKind.YOUTUBE,
        status: ConnectionStatus.ACTIVE,
        userId: access.userId
      }
    })
  ]);

  if (!driveConnection || !youtubeConnection) {
    redirect("/pipelines?error=MissingActiveConnections");
  }

  await prisma.pipeline.create({
    data: {
      defaultDescriptionTemplate:
        "Recorded on {date} at {time}. Routed by RelayRoom from {source_folder_name}.",
      defaultTitleTemplate: "{filename}",
      destinationChannelName:
        youtubeConnection.channelName || youtubeConnection.channelHandle || youtubeConnection.label,
      driveConnectionId: driveConnection.id,
      mode,
      name,
      pollingIntervalMinutes: Number.isFinite(pollingIntervalMinutes)
        ? Math.max(5, pollingIntervalMinutes)
        : 15,
      privacyStatus,
      processedFromTime: new Date(),
      sourceFolderId,
      sourceFolderName,
      status: PipelineStatus.DISABLED,
      userId: access.userId,
      youtubeConnectionId: youtubeConnection.id,
      rules: {
        create: {
          conditionTree: {
            id: "group-default-route",
            type: "group",
            combinator: "AND",
            children: [
              {
                id: "cond-any-filename",
                type: "condition",
                field: "filename",
                operator: "matches_regex",
                value: ".*"
              }
            ]
          },
          name: "Default route",
          priority: 1,
          titleTemplateOverride: null,
          descriptionTemplateOverride: null,
          youtubePlaylistId,
          youtubePlaylistName
        }
      }
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?created=true");
}

async function updatePipelineAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const pipelineId = getRequiredFormValue(formData, "pipelineId");
  const name = getRequiredFormValue(formData, "name");
  const sourceFolderId = getRequiredFormValue(formData, "sourceFolderId");
  const sourceFolderName = getRequiredFormValue(formData, "sourceFolderName");
  const mode = getEnumValue(formData, "mode", [PipelineMode.AUTO, PipelineMode.MANUAL_APPROVAL]);
  const privacyStatus = getEnumValue(formData, "privacyStatus", [
    PrivacyStatus.PUBLIC,
    PrivacyStatus.UNLISTED
  ]);
  const pollingIntervalMinutes = Number(formData.get("pollingIntervalMinutes") || 15);

  if (!pipelineId || !name || !sourceFolderId || !sourceFolderName) {
    redirect("/pipelines?error=MissingPipelineFields");
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: {
      id: pipelineId,
      userId: access.userId
    },
    select: {
      sourceFolderId: true
    }
  });

  if (!pipeline) {
    redirect("/pipelines?error=PipelineNotFound");
  }

  const folderChanged = pipeline.sourceFolderId !== sourceFolderId;

  await prisma.pipeline.update({
    where: { id: pipelineId },
    data: {
      errorMessage: null,
      mode,
      name,
      pollingIntervalMinutes: Number.isFinite(pollingIntervalMinutes)
        ? Math.max(5, pollingIntervalMinutes)
        : 15,
      privacyStatus,
      sourceFolderId,
      sourceFolderName,
      ...(folderChanged ? { lastDetectionAt: null, processedFromTime: new Date() } : {})
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?updated=true");
}

function getRequiredFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getEnumValue<T extends string>(formData: FormData, key: string, values: T[]) {
  const value = String(formData.get(key) || "");
  return values.includes(value as T) ? (value as T) : values[0];
}

function pipelineErrorMessage(error: string) {
  const messages: Record<string, string> = {
    DemoReadOnly: "Demo mode is read-only. Log in to create your own pipeline.",
    MissingActiveConnections: "Connect one active Drive account and one active YouTube account first.",
    MissingActiveDriveConnection: "Reconnect Google Drive before running detection.",
    MissingPipelineFields: "Fill out every required pipeline field.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    PipelineNotEnabled: "Enable the pipeline before running detection.",
    PipelineNotFound: "Pipeline not found.",
    TokenRefreshFailed: "Google could not refresh the Drive token. Reconnect Drive and try again.",
    DriveListFailed: "Google Drive could not list files in this folder."
  };

  return messages[error] || `Pipeline setup failed: ${error}`;
}
