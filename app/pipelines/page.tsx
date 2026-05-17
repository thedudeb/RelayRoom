import {
  ConnectionKind,
  ConnectionStatus,
  PipelineMode,
  PipelineStatus,
  PrivacyStatus
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/empty/EmptyState";
import { WorkspaceUserFilter } from "@/components/workspace/WorkspaceUserFilter";
import {
  ArchivedPipelineControls,
  PipelineStatusControls
} from "@/components/pipelines/PipelineAsyncActions";
import { requireAppAccess } from "@/lib/auth/account";
import {
  getPipelinesForDemo,
  getPipelinesForUser,
  getQueueItemsForDemo,
  getQueueItemsForUser,
  getWorkspaceUsers
} from "@/lib/data/repository";
import { prisma } from "@/lib/db/prisma";
import type {
  ConditionField,
  ConditionGroup,
  ConditionLeaf,
  ConditionNode,
  ConditionOperator,
  Pipeline,
  QueueItem
} from "@/lib/domain/types";
import { displayWorkspaceUser, selectedWorkspaceUserId } from "@/lib/workspace/users";
import { DriveFolderPicker } from "@/components/pipelines/DriveFolderPicker";
import { PollingCadenceField } from "@/components/pipelines/PollingCadenceField";
import { YouTubePlaylistPicker } from "@/components/pipelines/YouTubePlaylistPicker";
import Link from "next/link";
import type { Route } from "next";
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
    archived?: string;
    created?: string;
    demo?: string;
    detected?: string;
    duplicated?: string;
    error?: string;
    ignored?: string;
    probe?: string;
    ruleCreated?: string;
    ruleDeleted?: string;
    ruleUpdated?: string;
    restored?: string;
    skipped?: string;
    updated?: string;
    userId?: string;
    view?: string;
  }>;
}) {
  const params = await searchParams;
  const access = await requireAppAccess(params);
  const showingArchived = params?.view === "archived";
  const workspaceUsers = access.isDemo ? [] : await getWorkspaceUsers();
  const selectedUserId = selectedWorkspaceUserId(params?.userId, workspaceUsers);
  const [pipelines, queueItems] = access.isDemo
    ? await Promise.all([
        getPipelinesForDemo({ archived: showingArchived }),
        getQueueItemsForDemo()
      ])
    : await Promise.all([
        getPipelinesForUser(access.userId, {
          archived: showingArchived,
          userId: selectedUserId
        }),
        getQueueItemsForUser(access.userId, { userId: selectedUserId })
      ]);
  const connectionOptions = access.isDemo
    ? { driveConnections: [], youtubeConnections: [] }
    : await getPipelineConnectionOptions(access.userId);
  const activePipelinesHref = pipelinesViewHref({ isDemo: access.isDemo, selectedUserId });
  const archivedPipelinesHref = pipelinesViewHref({
    isDemo: access.isDemo,
    selectedUserId,
    view: "archived"
  });

  return (
    <AppShell
      title="Pipelines"
      subtitle="Configure watched Drive folders, destination channels, privacy, and routing rules."
      account={access.account}
      isDemo={access.isDemo}
    >
      {params?.created ? (
        <div className="notice success" role="status">
          Pipeline created in review mode. Check the folder and playlist, then click Enable pipeline
          to start watching for new recordings.
        </div>
      ) : null}
      {params?.duplicated ? (
        <div className="notice success" role="status">
          Pipeline duplicated as disabled. Review the copy before enabling detection.
        </div>
      ) : null}
      {params?.updated ? (
        <div className="notice success" role="status">
          Pipeline updated.
        </div>
      ) : null}
      {params?.archived ? (
        <div className="notice success" role="status">
          Pipeline archived. Existing queue history remains visible.
        </div>
      ) : null}
      {params?.restored ? (
        <div className="notice success" role="status">
          Pipeline restored as disabled. Review it before enabling detection.
        </div>
      ) : null}
      {params?.ruleCreated ? (
        <div className="notice success" role="status">
          Routing rule created.
        </div>
      ) : null}
      {params?.ruleUpdated ? (
        <div className="notice success" role="status">
          Routing rule updated.
        </div>
      ) : null}
      {params?.ruleDeleted ? (
        <div className="notice success" role="status">
          Routing rule deleted.
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
      <div className="view-toolbar">
        <div className="actions" aria-label="Pipeline views">
          <Link className={showingArchived ? "button" : "button primary"} href={activePipelinesHref}>
            Active pipelines
          </Link>
          <Link
            className={showingArchived ? "button primary" : "button"}
            href={archivedPipelinesHref}
          >
            Archived pipelines
          </Link>
        </div>
        <WorkspaceUserFilter
          currentUserId={access.isDemo ? undefined : access.userId}
          selectedUserId={selectedUserId}
          selfLabel="My pipelines"
          title="Owner"
          users={workspaceUsers}
        />
      </div>
      <div className="split">
        <section className="stack">
          {showingArchived ? (
            <div className="notice" role="status">
              Archived pipelines are read-only and do not run detection. Queue history stays on
              the Queue page.
            </div>
          ) : (
            <CreatePipelinePanel
              driveConnections={connectionOptions.driveConnections}
              isDemo={access.isDemo}
              youtubeConnections={connectionOptions.youtubeConnections}
            />
          )}
          {pipelines.map((pipeline) => (
            <div className="panel" key={pipeline.id}>
              {(() => {
                const canManagePipeline = !access.isDemo && pipeline.owner.id === access.userId;

                return (
                  <>
              <div className="section-header">
                <div>
                  <h2>{pipeline.name}</h2>
                  <p className="muted">
                    <span data-private>{pipeline.sourceFolderName}</span> →{" "}
                    <span data-private>{pipeline.destinationChannelName}</span>
                  </p>
                  <p className="muted">
                    Created by <span data-private>{displayWorkspaceUser(pipeline.owner)}</span>
                  </p>
                </div>
                <span className={`badge ${pipelineStatusBadgeClass(pipeline.status)}`}>
                  {showingArchived ? "archived" : pipeline.status}
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
                {showingArchived
                  ? `Archived: ${pipeline.archivedAt ? new Date(pipeline.archivedAt).toLocaleString() : "date unknown"}`
                  : `Cold start watermark: ${new Date(pipeline.processedFromTime).toLocaleString()}`}
              </p>
              {!showingArchived && canManagePipeline && pipeline.status === "disabled" ? (
                <div className="pipeline-next-step" role="status">
                  <strong>Next: enable this pipeline</strong>
                  <p>
                    RelayRoom is not watching this folder yet. Enable it when the Drive folder,
                    YouTube playlist, privacy, and cadence look right.
                  </p>
                </div>
              ) : null}
              {!showingArchived && pipeline.status === "errored" ? (
                <div className="pipeline-next-step danger" role="alert">
                  <strong>Connection attention needed</strong>
                  <p>
                    This pipeline is paused by an account or token issue. Reconnect Drive or
                    YouTube, then enable the pipeline again.
                  </p>
                </div>
              ) : null}
              {!showingArchived && canManagePipeline ? <EditPipelinePanel pipeline={pipeline} /> : null}
              {!showingArchived && canManagePipeline ? (
                <RuleManager
                  pipeline={pipeline}
                  playlistOptions={playlistOptionsForConnection(pipelines, pipeline.youtubeConnectionId)}
                />
              ) : null}
              {!showingArchived && !canManagePipeline ? (
                <div className="notice" role="status">
                  View-only pipeline. Only the user who created it can edit settings, run
                  detection, or change its status.
                </div>
              ) : null}
              {!showingArchived && canManagePipeline ? (
                <PipelineStatusControls
                  initialStatus={pipeline.status}
                  pipelineId={pipeline.id}
                />
              ) : null}
              {showingArchived && canManagePipeline ? (
                <ArchivedPipelineControls pipelineId={pipeline.id} />
              ) : null}
                  </>
                );
              })()}
            </div>
          ))}
          {pipelines.length === 0 ? (
            <EmptyState
              illustration="pipeline"
              title={showingArchived ? "No archived pipelines yet" : "No pipelines yet"}
              body={
                showingArchived
                  ? "Pipelines you archive will show here for reference."
                  : "Use the new pipeline form above to create your first watched-folder pipeline."
              }
            />
          ) : null}
        </section>
        <aside className="stack">
          <div className="panel">
            <h2>Routing rules</h2>
            <p className="muted">
              Rules run from lowest priority number to highest. The first matching rule assigns
              the playlist, title, and upload path for each detected file.
            </p>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function pipelinesViewHref({
  isDemo,
  selectedUserId,
  view
}: {
  isDemo: boolean;
  selectedUserId?: string;
  view?: "archived";
}) {
  const params = new URLSearchParams();
  if (isDemo) params.set("demo", "true");
  if (selectedUserId) params.set("userId", selectedUserId);
  if (view) params.set("view", view);
  const query = params.toString();
  return (query ? `/pipelines?${query}` : "/pipelines") as Route;
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
          <select className="select" data-private disabled={!canCreate} name="driveConnectionId" required>
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
        <label className="checkbox-field public-privacy-confirmation">
          <input disabled={!canCreate} name="publicPrivacyConfirmed" type="checkbox" />
          <span>I understand public uploads can be visible on YouTube.</span>
        </label>
        <label>
          <span>Mode</span>
          <select className="select" defaultValue={PipelineMode.MANUAL_APPROVAL} disabled={!canCreate} name="mode">
            <option value={PipelineMode.MANUAL_APPROVAL}>Manual approval</option>
            <option value={PipelineMode.AUTO}>Auto upload</option>
          </select>
        </label>
        <PollingCadenceField disabled={!canCreate} hint="Saved as minutes internally." />
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

function pipelineStatusBadgeClass(status: Pipeline["status"]) {
  if (status === "enabled") return "uploaded";
  if (status === "errored") return "failed";
  return "needs_routing";
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
        <label className="checkbox-field public-privacy-confirmation">
          <input name="publicPrivacyConfirmed" type="checkbox" />
          <span>I understand public uploads can be visible on YouTube.</span>
        </label>
        <label>
          <span>Mode</span>
          <select className="select" defaultValue={mode} name="mode">
            <option value={PipelineMode.MANUAL_APPROVAL}>Manual approval</option>
            <option value={PipelineMode.AUTO}>Auto upload</option>
          </select>
        </label>
        <PollingCadenceField
          hint="Changing cadence affects future scheduled runs."
          initialMinutes={pipeline.pollingIntervalMinutes}
        />
        <div className="form-actions">
          <button className="button primary" type="submit">
            Save changes
          </button>
        </div>
      </form>
    </details>
  );
}

function RuleManager({
  pipeline,
  playlistOptions
}: {
  pipeline: Pipeline;
  playlistOptions: { id: string; name: string }[];
}) {
  const defaultPlaylist = playlistOptions[0];

  return (
    <details className="edit-panel">
      <summary>Routing rules</summary>
      <div className="rule-editor">
        {pipeline.rules.map((rule) => {
          const playlistValue = playlistOptionValue(rule.playlist.id, rule.playlist.name);

          return (
            <div className="rule-card" key={rule.id}>
              <div className="rule-card-header">
                <div>
                  <h3>{rule.priority}. {rule.name}</h3>
                  <p className="muted">
                    Routes to {rule.playlist.name}. {conditionTreeSummary(rule.conditions)}
                  </p>
                </div>
                <span className="rule-pill">first match wins</span>
              </div>
              <form action={updateRuleAction} className="form-grid compact">
                <input name="ruleId" type="hidden" value={rule.id} />
                <RuleFields
                  conditions={rule.conditions}
                  defaultName={rule.name}
                  defaultPlaylistValue={playlistValue}
                  playlistOptions={playlistOptions}
                />
                <div className="form-actions">
                  <button className="button primary" type="submit">
                    Save rule
                  </button>
                </div>
              </form>
              <form action={deleteRuleAction}>
                <input name="ruleId" type="hidden" value={rule.id} />
                <button className="button danger subtle" type="submit">
                  Delete rule
                </button>
              </form>
            </div>
          );
        })}

        <details className="add-rule-panel">
          <summary className="button primary">Add rule</summary>
          <div className="rule-card add-rule">
            <div className="rule-card-header">
              <div>
                <h3>Add rule</h3>
                <p className="muted">Create a simple first-match routing rule for this pipeline.</p>
              </div>
            </div>
            <form action={createRuleAction} className="form-grid compact">
              <input name="pipelineId" type="hidden" value={pipeline.id} />
              <RuleFields
                defaultName="New routing rule"
                defaultPlaylistValue={
                  defaultPlaylist
                    ? playlistOptionValue(defaultPlaylist.id, defaultPlaylist.name)
                    : undefined
                }
                playlistOptions={playlistOptions}
              />
              <div className="form-actions">
                <button className="button primary" disabled={playlistOptions.length === 0} type="submit">
                  Add rule
                </button>
                {playlistOptions.length === 0 ? (
                  <span className="muted">Create or select a playlist before adding rules.</span>
                ) : null}
              </div>
            </form>
          </div>
        </details>
      </div>
    </details>
  );
}

function RuleFields({
  conditions,
  defaultName,
  defaultPlaylistValue,
  playlistOptions
}: {
  conditions?: ConditionGroup;
  defaultName: string;
  defaultPlaylistValue?: string;
  playlistOptions: { id: string; name: string }[];
}) {
  const primaryCondition = conditions ? conditionChildAt(conditions, 0) : undefined;
  const secondCondition = conditions ? conditionChildAt(conditions, 1) : undefined;
  const nestedGroup = conditions ? firstNestedGroup(conditions) : undefined;
  const nestedPrimaryCondition = nestedGroup ? conditionChildAt(nestedGroup, 0) : undefined;
  const nestedSecondCondition = nestedGroup ? conditionChildAt(nestedGroup, 1) : undefined;

  return (
    <>
      <label>
        <span>Rule name</span>
        <input className="input" defaultValue={defaultName} name="ruleName" required />
      </label>
      <label>
        <span>Route to playlist</span>
        <select
          className="select"
          defaultValue={defaultPlaylistValue}
          name="playlist"
          required
        >
          {playlistOptions.map((playlist) => (
            <option key={playlist.id} value={playlistOptionValue(playlist.id, playlist.name)}>
              {playlist.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="logic-graph">
        <legend>Logic graph</legend>
        <div className="logic-graph-canvas">
          <div className="logic-node logic-node-group logic-node-root">
            <span className="logic-port logic-port-out" aria-hidden="true" />
            <div className="logic-node-header">
              <span className="logic-node-kicker">Root group</span>
              <strong>Match mode</strong>
            </div>
            <label>
              <span>Root match</span>
              <select className="select" defaultValue={conditions?.combinator || "AND"} name="rootCombinator">
                <option value="AND">All top-level conditions must match</option>
                <option value="OR">Any top-level condition can match</option>
              </select>
            </label>
          </div>
          <div className="logic-branches">
            <LogicConditionNode condition={primaryCondition} required title="Condition 1" />
            <LogicConditionNode
              condition={secondCondition}
              enableName="condition2Enabled"
              prefix="condition2"
              title="Condition 2"
            />
            <div className="logic-node logic-node-group logic-node-nested">
              <span className="logic-port logic-port-in" aria-hidden="true" />
              <span className="logic-port logic-port-out" aria-hidden="true" />
              <div className="logic-node-header">
                <span className="logic-node-kicker">Nested group</span>
                <label className="checkbox-field compact">
                  <input
                    defaultChecked={Boolean(nestedGroup)}
                    name="nestedGroupEnabled"
                    type="checkbox"
                  />
                  <span>Use group</span>
                </label>
              </div>
              <label>
                <span>Nested match</span>
                <select className="select" defaultValue={nestedGroup?.combinator || "AND"} name="nestedCombinator">
                  <option value="AND">All nested conditions must match</option>
                  <option value="OR">Any nested condition can match</option>
                </select>
              </label>
              <div className="logic-nested-stack">
                <LogicConditionNode
                  condition={nestedPrimaryCondition}
                  prefix="nested1"
                  title="Nested condition 1"
                />
                <LogicConditionNode
                  condition={nestedSecondCondition}
                  enableName="nested2Enabled"
                  prefix="nested2"
                  title="Nested condition 2"
                />
              </div>
            </div>
          </div>
        </div>
      </fieldset>
    </>
  );
}

function LogicConditionNode({
  condition,
  enableName,
  prefix,
  required = false,
  title
}: {
  condition?: ConditionLeaf;
  enableName?: string;
  prefix?: string;
  required?: boolean;
  title: string;
}) {
  return (
    <div className={`logic-node logic-node-condition${enableName ? " optional" : ""}`}>
      <span className="logic-port logic-port-in" aria-hidden="true" />
      <div className="logic-node-header">
        <div>
          <span className="logic-node-kicker">Condition</span>
          <strong>{title}</strong>
        </div>
        {enableName ? (
          <label className="checkbox-field compact">
            <input defaultChecked={Boolean(condition)} name={enableName} type="checkbox" />
            <span>Use</span>
          </label>
        ) : (
          <span className="rule-pill">required</span>
        )}
      </div>
      <div className="logic-node-fields">
        <ConditionInputs condition={condition} prefix={prefix} required={required} />
      </div>
    </div>
  );
}

function ConditionInputs({
  condition,
  prefix = "",
  required = false
}: {
  condition?: ConditionLeaf;
  prefix?: string;
  required?: boolean;
}) {
  const field = condition?.field || "filename";

  return (
    <>
      <label>
        <span>Match field</span>
        <select className="select" defaultValue={field} name={prefixedFieldName(prefix, "field")}>
          <option value="filename">Filename</option>
          <option value="file_type">File type</option>
          <option value="day_of_week">Day of week</option>
          <option value="time_of_day">Time of day</option>
        </select>
      </label>
      <label>
        <span>Operator</span>
        <select
          className="select"
          defaultValue={operatorFormValue(condition)}
          name={prefixedFieldName(prefix, "operator")}
        >
          <optgroup label="Filename">
            <option value="contains">contains</option>
            <option value="starts_with">starts with</option>
            <option value="ends_with">ends with</option>
            <option value="equals">equals</option>
            <option value="matches_wildcard">matches wildcard</option>
            <option value="matches_regex">matches regex</option>
          </optgroup>
          <optgroup label="File type">
            <option value="file_type_equals">equals</option>
            <option value="file_type_is_one_of">is one of</option>
          </optgroup>
          <optgroup label="Day">
            <option value="day_is">is</option>
            <option value="day_is_not">is not</option>
            <option value="day_is_one_of">is one of</option>
          </optgroup>
          <optgroup label="Time">
            <option value="time_between">between</option>
            <option value="time_before">before</option>
            <option value="time_after">after</option>
          </optgroup>
        </select>
      </label>
      <label>
        <span>Value</span>
        <input
          className="input"
          defaultValue={condition ? ruleValueToInput(condition.value) : ""}
          name={prefixedFieldName(prefix, "value")}
          placeholder="Engineering, mp4, Mon, or 09:30"
          required={required}
        />
        <small className="field-hint">
          Use commas for “is one of”. Days use Mon, Tue, Wed. Times use HH:mm or HH:mm-HH:mm.
        </small>
      </label>
      <label className="checkbox-field">
        <input
          defaultChecked={condition?.caseSensitive || false}
          name={prefixedFieldName(prefix, "caseSensitive")}
          type="checkbox"
        />
        <span>Case-sensitive filename matching</span>
      </label>
    </>
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
  if (privacyStatus === PrivacyStatus.PUBLIC && !hasPublicPrivacyConfirmation(formData)) {
    redirect("/pipelines?error=PublicPrivacyConfirmationRequired");
  }
  const pollingIntervalMinutes = parsePollingIntervalMinutes(formData);
  if (!pollingIntervalMinutes) {
    redirect("/pipelines?error=InvalidPollingCadence");
  }

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
      pollingIntervalMinutes,
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
  const pollingIntervalMinutes = parsePollingIntervalMinutes(formData);
  if (!pollingIntervalMinutes) {
    redirect("/pipelines?error=InvalidPollingCadence");
  }

  if (!pipelineId || !name || !sourceFolderId || !sourceFolderName) {
    redirect("/pipelines?error=MissingPipelineFields");
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: {
      archivedAt: null,
      id: pipelineId,
      userId: access.userId
    },
    select: {
      privacyStatus: true,
      sourceFolderId: true
    }
  });

  if (!pipeline) {
    redirect("/pipelines?error=PipelineNotFound");
  }

  const folderChanged = pipeline.sourceFolderId !== sourceFolderId;
  const switchingToPublic =
    pipeline.privacyStatus !== PrivacyStatus.PUBLIC && privacyStatus === PrivacyStatus.PUBLIC;
  if (switchingToPublic && !hasPublicPrivacyConfirmation(formData)) {
    redirect("/pipelines?error=PublicPrivacyConfirmationRequired");
  }

  await prisma.pipeline.update({
    where: { id: pipelineId },
    data: {
      errorMessage: null,
      mode,
      name,
      pollingIntervalMinutes,
      privacyStatus,
      sourceFolderId,
      sourceFolderName,
      ...(folderChanged ? { lastDetectionAt: null, processedFromTime: new Date() } : {})
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?updated=true");
}

async function createRuleAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const pipelineId = getRequiredFormValue(formData, "pipelineId");
  const ruleName = getRequiredFormValue(formData, "ruleName");
  const playlist = parsePlaylistValue(getRequiredFormValue(formData, "playlist"));
  const conditionTree = buildConditionTree(formData);

  if (!pipelineId || !ruleName || !playlist || !conditionTree) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  const pipeline = await prisma.pipeline.findFirst({
    where: {
      archivedAt: null,
      id: pipelineId,
      userId: access.userId
    },
    select: {
      youtubeConnectionId: true,
      rules: {
        orderBy: { priority: "asc" },
        select: { priority: true }
      }
    }
  });

  if (!pipeline) {
    redirect("/pipelines?error=PipelineNotFound");
  }

  const knownPlaylists = await prisma.rule.findMany({
    where: {
      pipeline: {
        archivedAt: null,
        userId: access.userId,
        youtubeConnectionId: pipeline.youtubeConnectionId
      }
    },
    select: {
      youtubePlaylistId: true,
      youtubePlaylistName: true
    }
  });
  const playlistIsKnown = knownPlaylists.some(
    (rule) => rule.youtubePlaylistId === playlist.id && rule.youtubePlaylistName === playlist.name
  );
  if (!playlistIsKnown) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  const nextPriority =
    pipeline.rules.reduce((max, rule) => Math.max(max, rule.priority), 0) + 1;

  await prisma.rule.create({
    data: {
      conditionTree: conditionTree as unknown as Prisma.InputJsonValue,
      name: ruleName,
      pipelineId,
      priority: nextPriority,
      titleTemplateOverride: null,
      descriptionTemplateOverride: null,
      youtubePlaylistId: playlist.id,
      youtubePlaylistName: playlist.name
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?ruleCreated=true");
}

async function updateRuleAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const ruleId = getRequiredFormValue(formData, "ruleId");
  const ruleName = getRequiredFormValue(formData, "ruleName");
  const playlist = parsePlaylistValue(getRequiredFormValue(formData, "playlist"));
  const conditionTree = buildConditionTree(formData);

  if (!ruleId || !ruleName || !playlist || !conditionTree) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  const rule = await prisma.rule.findFirst({
    where: {
      id: ruleId,
      pipeline: { archivedAt: null, userId: access.userId }
    },
    select: {
      pipelineId: true,
      pipeline: {
        select: {
          youtubeConnectionId: true
        }
      }
    }
  });

  if (!rule) {
    redirect("/pipelines?error=RuleNotFound");
  }

  const knownPlaylists = await prisma.rule.findMany({
    where: {
      pipeline: {
        archivedAt: null,
        userId: access.userId,
        youtubeConnectionId: rule.pipeline.youtubeConnectionId
      }
    },
    select: {
      youtubePlaylistId: true,
      youtubePlaylistName: true
    }
  });
  const playlistIsKnown = knownPlaylists.some(
    (candidate) =>
      candidate.youtubePlaylistId === playlist.id &&
      candidate.youtubePlaylistName === playlist.name
  );
  if (!playlistIsKnown) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  await prisma.rule.update({
    where: { id: ruleId },
    data: {
      conditionTree: conditionTree as unknown as Prisma.InputJsonValue,
      name: ruleName,
      youtubePlaylistId: playlist.id,
      youtubePlaylistName: playlist.name
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?ruleUpdated=true");
}

async function deleteRuleAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const ruleId = getRequiredFormValue(formData, "ruleId");
  if (!ruleId) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  const rule = await prisma.rule.findFirst({
    where: {
      id: ruleId,
      pipeline: { archivedAt: null, userId: access.userId }
    },
    select: {
      pipelineId: true
    }
  });

  if (!rule) {
    redirect("/pipelines?error=RuleNotFound");
  }

  const rules = await prisma.rule.findMany({
    where: { pipeline: { archivedAt: null }, pipelineId: rule.pipelineId },
    orderBy: { priority: "asc" },
    select: { id: true }
  });

  if (rules.length <= 1) {
    redirect("/pipelines?error=LastRuleRequired");
  }

  const remainingRules = rules.filter((candidate) => candidate.id !== ruleId);

  await prisma.$transaction([
    prisma.rule.delete({ where: { id: ruleId } }),
    ...remainingRules.map((candidate, index) =>
      prisma.rule.update({
        where: { id: candidate.id },
        data: { priority: index + 1 }
      })
    )
  ]);

  revalidatePath("/pipelines");
  redirect("/pipelines?ruleDeleted=true");
}

function getRequiredFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getEnumValue<T extends string>(formData: FormData, key: string, values: readonly T[]) {
  const value = String(formData.get(key) || "");
  return values.includes(value as T) ? (value as T) : values[0];
}

function playlistOptionsForConnection(pipelines: Pipeline[], youtubeConnectionId: string) {
  const seen = new Set<string>();
  return pipelines
    .filter((pipeline) => pipeline.youtubeConnectionId === youtubeConnectionId)
    .flatMap((pipeline) => pipeline.rules.map((rule) => rule.playlist))
    .filter((playlist) => {
      if (seen.has(playlist.id)) {
        return false;
      }

      seen.add(playlist.id);
      return true;
    });
}

function playlistOptionValue(id: string, name: string) {
  return `${encodeURIComponent(id)}::${encodeURIComponent(name)}`;
}

function parsePlaylistValue(value: string) {
  const [encodedId, encodedName] = value.split("::");
  if (!encodedId || !encodedName) {
    return undefined;
  }

  return {
    id: decodeURIComponent(encodedId),
    name: decodeURIComponent(encodedName)
  };
}

function conditionChildAt(group: ConditionGroup, index: number): ConditionLeaf | undefined {
  return group.children.filter((child): child is ConditionLeaf => child.type === "condition")[index];
}

function firstNestedGroup(group: ConditionGroup): ConditionGroup | undefined {
  return group.children.find((child): child is ConditionGroup => child.type === "group");
}

function conditionTreeSummary(group: ConditionGroup) {
  const directConditions = group.children.filter((child) => child.type === "condition").length;
  const nestedGroups = group.children.filter((child) => child.type === "group").length;
  const parts = [`${group.combinator} group`, `${directConditions} condition${directConditions === 1 ? "" : "s"}`];
  if (nestedGroups > 0) {
    parts.push(`${nestedGroups} nested group${nestedGroups === 1 ? "" : "s"}`);
  }
  return `${parts.join(" with ")}.`;
}

function ruleValueToInput(value: ConditionLeaf["value"]) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "object") {
    return `${value.start}-${value.end}`;
  }
  return String(value);
}

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

function buildConditionTree(formData: FormData) {
  const rootCombinator = getEnumValue(formData, "rootCombinator", ["AND", "OR"] as const);
  const primaryCondition = parseConditionFromForm(formData);
  if (!primaryCondition) {
    return undefined;
  }

  const children: ConditionNode[] = [primaryCondition];

  if (formData.get("condition2Enabled") === "on") {
    const secondCondition = parseConditionFromForm(formData, "condition2");
    if (!secondCondition) {
      return undefined;
    }
    children.push(secondCondition);
  }

  if (formData.get("nestedGroupEnabled") === "on") {
    const nestedPrimaryCondition = parseConditionFromForm(formData, "nested1");
    if (!nestedPrimaryCondition) {
      return undefined;
    }

    const nestedChildren: ConditionNode[] = [nestedPrimaryCondition];
    if (formData.get("nested2Enabled") === "on") {
      const nestedSecondCondition = parseConditionFromForm(formData, "nested2");
      if (!nestedSecondCondition) {
        return undefined;
      }
      nestedChildren.push(nestedSecondCondition);
    }

    children.push({
      id: `group-${randomUUID()}`,
      type: "group",
      combinator: getEnumValue(formData, "nestedCombinator", ["AND", "OR"] as const),
      children: nestedChildren
    });
  }

  return {
    id: `group-${randomUUID()}`,
    type: "group" as const,
    combinator: rootCombinator,
    children
  };
}

function parseConditionFromForm(formData: FormData, prefix = ""): ConditionLeaf | undefined {
  const field = getEnumValue<ConditionField>(formData, prefixedFieldName(prefix, "field"), [
    "filename",
    "file_type",
    "day_of_week",
    "time_of_day"
  ]);
  const operator = normalizeOperator(field, getRequiredFormValue(formData, prefixedFieldName(prefix, "operator")));
  const rawValue = getRequiredFormValue(formData, prefixedFieldName(prefix, "value"));
  if (!rawValue) {
    return undefined;
  }

  return {
    id: `cond-${randomUUID()}`,
    type: "condition",
    field,
    operator,
    value: conditionValue(operator, rawValue),
    ...(field === "filename" && formData.get(prefixedFieldName(prefix, "caseSensitive")) === "on"
      ? { caseSensitive: true }
      : {})
  };
}

function prefixedFieldName(prefix: string, key: string) {
  return prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;
}

function normalizeOperator(field: ConditionField, rawOperator: string): ConditionOperator {
  const withoutPrefix = rawOperator
    .replace(/^file_type_/, "")
    .replace(/^day_/, "")
    .replace(/^time_/, "");

  const allowed: Record<ConditionField, ConditionOperator[]> = {
    filename: ["contains", "starts_with", "ends_with", "equals", "matches_wildcard", "matches_regex"],
    file_type: ["equals", "is_one_of"],
    day_of_week: ["is", "is_not", "is_one_of"],
    time_of_day: ["between", "before", "after"]
  };

  return allowed[field].includes(withoutPrefix as ConditionOperator)
    ? (withoutPrefix as ConditionOperator)
    : allowed[field][0];
}

function conditionValue(operator: ConditionOperator, value: string) {
  if (operator === "is_one_of") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (operator === "between") {
    const [start = "", end = ""] = value.split(/[-,]/).map((item) => item.trim());
    return { start, end };
  }

  return value;
}

function hasPublicPrivacyConfirmation(formData: FormData) {
  return formData.get("publicPrivacyConfirmed") === "on";
}

function parsePollingIntervalMinutes(formData: FormData) {
  const preset = String(formData.get("pollingIntervalPreset") || "15");
  const rawMinutes =
    preset === "custom" ? parseCustomCadence(formData.get("pollingIntervalCustom")) : Number(preset);

  if (!Number.isFinite(rawMinutes) || rawMinutes < 5 || rawMinutes > 10080) {
    return null;
  }

  return Math.floor(rawMinutes);
}

function parseCustomCadence(value: FormDataEntryValue | null) {
  const rawValue = String(value || "").trim();
  const match = rawValue.match(/^([0-9]{1,3}):([0-5][0-9])$/);
  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

function pipelineErrorMessage(error: string) {
  const messages: Record<string, string> = {
    DemoReadOnly: "Demo mode is read-only. Log in to create your own pipeline.",
    FolderAlreadyWatched:
      "Another enabled pipeline is already watching this Drive folder. Disable it before using this folder here.",
    LastRuleRequired: "Keep at least one routing rule on each pipeline.",
    MissingActiveConnections: "Connect one active Drive account and one active YouTube account first.",
    MissingActiveDriveConnection: "Reconnect Google Drive before running detection.",
    InvalidPollingCadence: "Use a polling cadence from 00:05 to 168:00.",
    MissingPipelineFields: "Fill out every required pipeline field.",
    MissingRuleFields: "Fill out every required routing rule field.",
    MissingTokenKey: "TOKEN_ENCRYPTION_KEY is missing.",
    PipelineArchived: "This pipeline has been archived.",
    PipelineNotEnabled: "Enable the pipeline before running detection.",
    PipelineNotFound: "Pipeline not found.",
    PublicPrivacyConfirmationRequired:
      "Confirm that public uploads can be visible on YouTube before saving public privacy.",
    RuleNotFound: "Routing rule not found.",
    TokenRefreshFailed: "Google could not refresh the Drive token. Reconnect Drive and try again.",
    DriveListFailed: "Google Drive could not list files in this folder."
  };

  return messages[error] || `Pipeline setup failed: ${error}`;
}
