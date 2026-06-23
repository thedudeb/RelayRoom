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
import { PrivacyPicker } from "@/components/pipelines/PrivacyPicker";
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
import { CreateDriveSourceFields } from "@/components/pipelines/CreateDriveSourceFields";
import { DriveFolderPicker } from "@/components/pipelines/DriveFolderPicker";
import { PollingCadenceField } from "@/components/pipelines/PollingCadenceField";
import { RuleConditionEditor } from "@/components/pipelines/RuleConditionEditor";
import { RuleBuilderModeToggle } from "@/components/pipelines/RuleBuilderModeToggle";
import { RulePlaylistSelect } from "@/components/pipelines/RulePlaylistSelect";
import { RuleTester } from "@/components/pipelines/RuleTester";
import { ClassicConditionInputs } from "@/components/pipelines/ClassicConditionInputs";
import { DriveSampleRulePreview } from "@/components/pipelines/DriveSampleRulePreview";
import { verifyDriveFolderSelection } from "@/lib/oauth/drive-folder-verification";
import { getUsableYouTubeAccessToken } from "@/lib/detection/drive-detection";
import { verifyChannelPlaylist } from "@/lib/oauth/youtube-playlists";
import {
  finalPriorityForIndex,
  reorderRuleIds,
  temporaryPriorityForIndex,
  type RuleMoveDirection
} from "@/lib/rules/rule-ordering";
import { YouTubePlaylistPicker } from "@/components/pipelines/YouTubePlaylistPicker";
import Link from "next/link";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Pipelines management page. This single file holds the server component that
// renders the list/edit UI plus all the server actions behind its forms
// (create/update/archive pipelines, CRUD + reorder rules) and the form-parsing
// helpers that turn raw FormData into validated domain objects. Co-locating the
// actions with the page keeps each form's contract in one place.

interface ConnectionOption {
  id: string;
  label: string;
  detail: string;
}

// Server component entry point. Resolves access, loads the user's (or demo's)
// pipelines + queue + connection options, and renders everything inside the app
// shell. The many ?-params are post-action redirect flags that drive the
// success/error notices at the top of the page.
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
      <div className="view-toolbar" data-tour="pipeline-owner-filter">
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
              {/* Only the pipeline's creator (and never in demo mode) may edit,
                  run detection, or change status — others get a read-only view. */}
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
                <div data-tour="pipeline-actions">
                  <PipelineStatusControls
                    initialStatus={pipeline.status}
                    pipelineId={pipeline.id}
                  />
                </div>
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
          <div className="panel" data-tour="routing-rules">
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

// Builds a /pipelines URL that preserves the current demo flag, owner filter,
// and active/archived view when navigating between the two view tabs.
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

// The "new pipeline" form. Disabled (read-only) unless the user has at least one
// active Drive *and* one active YouTube connection, since a pipeline needs both
// endpoints to function.
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
    <div className="panel" data-tour="new-pipeline">
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
        <YouTubePlaylistPicker disabled={!canCreate} youtubeConnections={youtubeConnections} />
        <CreateDriveSourceFields disabled={!canCreate} driveConnections={driveConnections} />
        <PrivacyPicker
          defaultValue="UNLISTED"
          disabled={!canCreate}
        />
        <label>
          <span>Mode</span>
          <select className="select" defaultValue={PipelineMode.MANUAL_APPROVAL} disabled={!canCreate} name="mode">
            <option value={PipelineMode.MANUAL_APPROVAL}>Manual approval</option>
            <option value={PipelineMode.AUTO}>Auto upload</option>
          </select>
        </label>
        <PollingCadenceField disabled={!canCreate} hint="Saved as minutes internally." />
        <TemplateFields
          disabled={!canCreate}
          descriptionDefault="Recorded on {date} at {time}. Routed by RelayRoom from {source_folder_name}."
          titleDefault="{filename}"
        />
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

// Reuses the queue-status badge palette for pipeline status so colors stay
// consistent: enabled→green (uploaded), errored→red (failed), disabled→amber.
function pipelineStatusBadgeClass(status: Pipeline["status"]) {
  if (status === "enabled") return "uploaded";
  if (status === "errored") return "failed";
  return "needs_routing";
}

// Count of this pipeline's queue items that need operator attention — the
// "N waiting" pill on each pipeline card.
function waitingCount(queueItems: QueueItem[], pipelineId: string): number {
  return queueItems.filter(
    (item) =>
      item.pipelineId === pipelineId &&
      ["needs_approval", "needs_routing", "failed"].includes(item.status)
  ).length;
}

// Collapsible edit form for an existing pipeline. Maps the app-layer string
// enums back to Prisma enums for the form controls' default values.
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
          connectionId={pipeline.driveConnectionId}
          disabled={false}
          initialFolderId={pipeline.sourceFolderId}
          initialFolderName={pipeline.sourceFolderName}
        />
        <PrivacyPicker
          defaultValue={privacyStatus === PrivacyStatus.PUBLIC ? "PUBLIC" : "UNLISTED"}
          destinationChannelName={pipeline.destinationChannelName ?? undefined}
          fallbackPipelineName={pipeline.name}
        />
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
        <TemplateFields
          descriptionDefault={pipeline.defaultDescriptionTemplate}
          titleDefault={pipeline.defaultTitleTemplate}
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

// Shared title/description template inputs used by both the create and edit
// forms. Templates support {filename}/{date}/{rule_name}/etc. placeholders that
// the upload step interpolates per file.
function TemplateFields({
  descriptionDefault,
  disabled = false,
  titleDefault
}: {
  descriptionDefault: string;
  disabled?: boolean;
  titleDefault: string;
}) {
  return (
    <fieldset className="template-fields">
      <legend>Upload templates</legend>
      <label>
        <span>Default YouTube title</span>
        <input
          className="input"
          defaultValue={titleDefault}
          disabled={disabled}
          name="defaultTitleTemplate"
          required
        />
        <small className="field-hint">
          Variables: {"{filename}"}, {"{filename_no_ext}"}, {"{date}"}, {"{time}"}, {"{rule_name}"}, {"{playlist_name}"}.
        </small>
      </label>
      <label>
        <span>Default YouTube description</span>
        <textarea
          className="input"
          defaultValue={descriptionDefault}
          disabled={disabled}
          name="defaultDescriptionTemplate"
          required
          rows={3}
        />
      </label>
    </fieldset>
  );
}

// Renders the full rule list for a pipeline: a live rule tester, per-rule edit
// forms, priority reorder controls (Top/Up/Down/Bottom, each its own form
// posting to moveRuleAction), delete, and an add-rule form. The Up/Top buttons
// disable on the first rule and Down/Bottom on the last.
function RuleManager({
  pipeline,
  playlistOptions
}: {
  pipeline: Pipeline;
  playlistOptions: { id: string; name: string }[];
}) {
  const defaultPlaylist = playlistOptions[0];

  return (
    <details className="edit-panel" data-tour="routing-rules">
      <summary>Routing rules</summary>
      <div className="rule-editor">
        <RuleTester pipeline={pipeline} />
        <DriveSampleRulePreview pipeline={pipeline} />
        {pipeline.rules.map((rule, index) => {
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
                  defaultDescriptionTemplate={rule.descriptionTemplate || ""}
                  defaultName={rule.name}
                  defaultPlaylistValue={playlistValue}
                  defaultTitleTemplate={rule.titleTemplate || ""}
                  playlistOptions={playlistOptions}
                  youtubeConnectionId={pipeline.youtubeConnectionId}
                />
                <div className="form-actions">
                  <button className="button primary" type="submit">
                    Save rule
                  </button>
                </div>
              </form>
              <div className="rule-order-panel" aria-label={`Change priority for ${rule.name}`}>
                <span className="muted">Priority</span>
                <form action={moveRuleAction}>
                  <input name="ruleId" type="hidden" value={rule.id} />
                  <input name="direction" type="hidden" value="top" />
                  <button className="button compact-button" disabled={index === 0} type="submit">
                    Top
                  </button>
                </form>
                <form action={moveRuleAction}>
                  <input name="ruleId" type="hidden" value={rule.id} />
                  <input name="direction" type="hidden" value="up" />
                  <button className="button compact-button" disabled={index === 0} type="submit">
                    Up
                  </button>
                </form>
                <form action={moveRuleAction}>
                  <input name="ruleId" type="hidden" value={rule.id} />
                  <input name="direction" type="hidden" value="down" />
                  <button className="button compact-button" disabled={index === pipeline.rules.length - 1} type="submit">
                    Down
                  </button>
                </form>
                <form action={moveRuleAction}>
                  <input name="ruleId" type="hidden" value={rule.id} />
                  <input name="direction" type="hidden" value="bottom" />
                  <button className="button compact-button" disabled={index === pipeline.rules.length - 1} type="submit">
                    Bottom
                  </button>
                </form>
                <span className="muted">Rules evaluate from top to bottom.</span>
              </div>
              <div className="actions">
                <form action={deleteRuleAction}>
                  <input name="ruleId" type="hidden" value={rule.id} />
                  <button className="button danger subtle" type="submit">
                    Delete rule
                  </button>
                </form>
              </div>
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
                defaultDescriptionTemplate=""
                defaultName="New routing rule"
                defaultPlaylistValue={
                  defaultPlaylist
                    ? playlistOptionValue(defaultPlaylist.id, defaultPlaylist.name)
                    : undefined
                }
                defaultTitleTemplate=""
                playlistOptions={playlistOptions}
                youtubeConnectionId={pipeline.youtubeConnectionId}
              />
              <div className="form-actions">
                <button className="button primary" type="submit">
                  Add rule
                </button>
                {playlistOptions.length === 0 ? (
                  <span className="muted">Load or create a playlist before adding rules.</span>
                ) : null}
              </div>
            </form>
          </div>
        </details>
      </div>
    </details>
  );
}

// The shared body of both the create- and edit-rule forms: name, playlist
// target, the condition editor (offered in a visual builder or a "classic" flat
// form), and optional per-rule template overrides. Pre-extracts the first two
// top-level conditions and first nested group so the classic editor can render
// existing rules into its fixed set of inputs.
function RuleFields({
  conditions,
  defaultDescriptionTemplate,
  defaultName,
  defaultPlaylistValue,
  defaultTitleTemplate,
  playlistOptions,
  youtubeConnectionId
}: {
  conditions?: ConditionGroup;
  defaultDescriptionTemplate: string;
  defaultName: string;
  defaultPlaylistValue?: string;
  defaultTitleTemplate: string;
  playlistOptions: { id: string; name: string }[];
  youtubeConnectionId: string;
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
      <RulePlaylistSelect
        connectionId={youtubeConnectionId}
        defaultValue={defaultPlaylistValue}
        initialOptions={playlistOptions}
      />
      <RuleBuilderModeToggle
        visual={<RuleConditionEditor initial={conditions} />}
        classic={
          <ClassicRuleEditor
            conditions={conditions}
            nestedGroup={nestedGroup}
            nestedPrimaryCondition={nestedPrimaryCondition}
            nestedSecondCondition={nestedSecondCondition}
            primaryCondition={primaryCondition}
            secondCondition={secondCondition}
          />
        }
      />
      <fieldset className="template-fields">
        <legend>Rule template overrides</legend>
        <label>
          <span>Title override</span>
          <input
            className="input"
            defaultValue={defaultTitleTemplate}
            name="titleTemplateOverride"
            placeholder="Leave blank to use pipeline default"
          />
        </label>
        <label>
          <span>Description override</span>
          <textarea
            className="input"
            defaultValue={defaultDescriptionTemplate}
            name="descriptionTemplateOverride"
            placeholder="Leave blank to use pipeline default"
            rows={3}
          />
        </label>
      </fieldset>
    </>
  );
}

// Non-visual fallback rule editor: a fixed-shape form covering a root group of
// up to two conditions plus one optional nested group of up to two conditions.
// This is intentionally less expressive than the visual builder — it's the
// progressive-enhancement path that works without client JS. buildConditionTree
// parses these named fields back into a ConditionGroup.
function ClassicRuleEditor({
  conditions,
  nestedGroup,
  nestedPrimaryCondition,
  nestedSecondCondition,
  primaryCondition,
  secondCondition
}: {
  conditions?: ConditionGroup;
  nestedGroup?: ConditionGroup;
  nestedPrimaryCondition?: ConditionLeaf;
  nestedSecondCondition?: ConditionLeaf;
  primaryCondition?: ConditionLeaf;
  secondCondition?: ConditionLeaf;
}) {
  return (
    <fieldset className="classic-rule-editor">
      <legend>Classic rule form</legend>
      <label>
        <span>Root match</span>
        <select className="select" defaultValue={conditions?.combinator || "AND"} name="rootCombinator">
          <option value="AND">All top-level conditions must match</option>
          <option value="OR">Any top-level condition can match</option>
        </select>
      </label>
      <ClassicConditionInputs condition={primaryCondition} required />
      <fieldset className="rule-subgroup">
        <legend>Additional condition</legend>
        <label className="checkbox-field">
          <input
            defaultChecked={Boolean(secondCondition)}
            name="condition2Enabled"
            type="checkbox"
          />
          <span>Use a second top-level condition</span>
        </label>
        <ClassicConditionInputs condition={secondCondition} prefix="condition2" />
      </fieldset>
      <fieldset className="rule-subgroup">
        <legend>Nested group</legend>
        <label className="checkbox-field">
          <input
            defaultChecked={Boolean(nestedGroup)}
            name="nestedGroupEnabled"
            type="checkbox"
          />
          <span>Use a nested AND/OR group</span>
        </label>
        <label>
          <span>Nested match</span>
          <select className="select" defaultValue={nestedGroup?.combinator || "AND"} name="nestedCombinator">
            <option value="AND">All nested conditions must match</option>
            <option value="OR">Any nested condition can match</option>
          </select>
        </label>
        <ClassicConditionInputs condition={nestedPrimaryCondition} prefix="nested1" />
        <label className="checkbox-field">
          <input
            defaultChecked={Boolean(nestedSecondCondition)}
            name="nested2Enabled"
            type="checkbox"
          />
          <span>Use a second nested condition</span>
        </label>
        <ClassicConditionInputs condition={nestedSecondCondition} prefix="nested2" />
      </fieldset>
    </fieldset>
  );
}

// Loads the user's active Drive and YouTube connections, split into the two
// option lists the create form needs. YouTube options prefer the channel name
// over the raw connection label so the dropdown shows recognizable channels.
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

// Server action: validate the new-pipeline form and create the pipeline plus a
// catch-all "Default route" rule. Validation failures redirect back with an
// ?error code rather than throwing, so the page can show a friendly notice. The
// pipeline is created DISABLED so the user reviews it before detection starts.
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
  const defaultTitleTemplate =
    getRequiredFormValue(formData, "defaultTitleTemplate") || "{filename}";
  const defaultDescriptionTemplate =
    getRequiredFormValue(formData, "defaultDescriptionTemplate") ||
    "Recorded on {date} at {time}. Routed by RelayRoom from {source_folder_name}.";
  const mode = getEnumValue(formData, "mode", [PipelineMode.AUTO, PipelineMode.MANUAL_APPROVAL]);
  const privacyStatus = getEnumValue(formData, "privacyStatus", [
    PrivacyStatus.PUBLIC,
    PrivacyStatus.UNLISTED
  ]);
  // Public uploads are irreversible-ish and high-stakes, so require an explicit
  // typed confirmation (the user must re-type the pipeline name) before allowing
  // PUBLIC privacy.
  if (privacyStatus === PrivacyStatus.PUBLIC && !hasPublicPrivacyConfirmation(formData, name)) {
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
    !sourceFolderId
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

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    redirect("/pipelines?error=MissingTokenKey");
  }

  // Confirm the folder actually exists and is reachable via this connection
  // before persisting, so we don't create a pipeline that can never detect.
  const verifiedFolder = await verifyDriveFolderSelection({
    connection: driveConnection,
    folderId: sourceFolderId,
    tokenKey
  });
  if (!verifiedFolder) {
    redirect("/pipelines?error=InvalidDriveFolder");
  }

  await prisma.pipeline.create({
    data: {
      defaultDescriptionTemplate,
      defaultTitleTemplate,
      destinationChannelName:
        youtubeConnection.channelName || youtubeConnection.channelHandle || youtubeConnection.label,
      driveConnectionId: driveConnection.id,
      mode,
      name,
      pollingIntervalMinutes,
      privacyStatus,
      processedFromTime: new Date(),
      sourceFolderId: verifiedFolder.id,
      sourceFolderName: verifiedFolder.name,
      status: PipelineStatus.DISABLED,
      userId: access.userId,
      youtubeConnectionId: youtubeConnection.id,
      // Seed a catch-all rule (filename matches `.*`) so a brand-new pipeline
      // routes every detected file to the chosen playlist out of the box; the
      // user can refine or add higher-priority rules afterward.
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

// Server action: update an existing pipeline's settings. Mirrors the create
// validation, but only prompts for public-privacy confirmation when actually
// switching INTO public (not when it was already public), and clears any prior
// errorMessage on a successful save.
async function updatePipelineAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const pipelineId = getRequiredFormValue(formData, "pipelineId");
  const name = getRequiredFormValue(formData, "name");
  const sourceFolderId = getRequiredFormValue(formData, "sourceFolderId");
  const defaultTitleTemplate =
    getRequiredFormValue(formData, "defaultTitleTemplate") || "{filename}";
  const defaultDescriptionTemplate =
    getRequiredFormValue(formData, "defaultDescriptionTemplate") ||
    "Recorded on {date} at {time}. Routed by RelayRoom from {source_folder_name}.";
  const mode = getEnumValue(formData, "mode", [PipelineMode.AUTO, PipelineMode.MANUAL_APPROVAL]);
  const privacyStatus = getEnumValue(formData, "privacyStatus", [
    PrivacyStatus.PUBLIC,
    PrivacyStatus.UNLISTED
  ]);
  const pollingIntervalMinutes = parsePollingIntervalMinutes(formData);
  if (!pollingIntervalMinutes) {
    redirect("/pipelines?error=InvalidPollingCadence");
  }

  if (!pipelineId || !name || !sourceFolderId) {
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
      driveConnection: true,
      sourceFolderId: true
    }
  });

  if (!pipeline) {
    redirect("/pipelines?error=PipelineNotFound");
  }

  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!tokenKey) {
    redirect("/pipelines?error=MissingTokenKey");
  }

  const verifiedFolder = await verifyDriveFolderSelection({
    connection: pipeline.driveConnection,
    folderId: sourceFolderId,
    tokenKey
  });
  if (!verifiedFolder) {
    redirect("/pipelines?error=InvalidDriveFolder");
  }

  // If the watched folder changed, reset the watermark and last-detection time
  // so the new folder is treated as a fresh cold start rather than replaying or
  // skipping based on the old folder's history (see the folderChanged block below).
  const folderChanged = pipeline.sourceFolderId !== verifiedFolder.id;
  const switchingToPublic =
    pipeline.privacyStatus !== PrivacyStatus.PUBLIC && privacyStatus === PrivacyStatus.PUBLIC;
  if (switchingToPublic && !hasPublicPrivacyConfirmation(formData, name)) {
    redirect("/pipelines?error=PublicPrivacyConfirmationRequired");
  }

  await prisma.pipeline.update({
    where: { id: pipelineId },
    data: {
      errorMessage: null,
      defaultDescriptionTemplate,
      defaultTitleTemplate,
      mode,
      name,
      pollingIntervalMinutes,
      privacyStatus,
      sourceFolderId: verifiedFolder.id,
      sourceFolderName: verifiedFolder.name,
      ...(folderChanged ? { lastDetectionAt: null, processedFromTime: new Date() } : {})
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?updated=true");
}

// Server action: add a routing rule to a pipeline. The new rule is appended at
// the end (max existing priority + 1) and its target playlist is verified
// against the live YouTube channel before saving.
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
  const titleTemplateOverride = optionalFormValue(formData, "titleTemplateOverride");
  const descriptionTemplateOverride = optionalFormValue(formData, "descriptionTemplateOverride");

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

  const verifiedPlaylist = await verifyRulePlaylist({
    playlistId: playlist.id,
    userId: access.userId,
    youtubeConnectionId: pipeline.youtubeConnectionId
  });
  if (!verifiedPlaylist) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  // Append after the current lowest-priority (highest-number) rule.
  const nextPriority =
    pipeline.rules.reduce((max, rule) => Math.max(max, rule.priority), 0) + 1;

  await prisma.rule.create({
    data: {
      conditionTree: conditionTree as unknown as Prisma.InputJsonValue,
      name: ruleName,
      pipelineId,
      priority: nextPriority,
      titleTemplateOverride,
      descriptionTemplateOverride,
      youtubePlaylistId: verifiedPlaylist.id,
      youtubePlaylistName: verifiedPlaylist.name
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?ruleCreated=true");
}

// Server action: edit an existing rule's name, conditions, playlist, and
// template overrides. Scoped to rules on the caller's own, non-archived
// pipelines, and re-verifies the playlist before saving.
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
  const titleTemplateOverride = optionalFormValue(formData, "titleTemplateOverride");
  const descriptionTemplateOverride = optionalFormValue(formData, "descriptionTemplateOverride");

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

  const verifiedPlaylist = await verifyRulePlaylist({
    playlistId: playlist.id,
    userId: access.userId,
    youtubeConnectionId: rule.pipeline.youtubeConnectionId
  });
  if (!verifiedPlaylist) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  await prisma.rule.update({
    where: { id: ruleId },
    data: {
      conditionTree: conditionTree as unknown as Prisma.InputJsonValue,
      descriptionTemplateOverride,
      name: ruleName,
      titleTemplateOverride,
      youtubePlaylistId: verifiedPlaylist.id,
      youtubePlaylistName: verifiedPlaylist.name
    }
  });

  revalidatePath("/pipelines");
  redirect("/pipelines?ruleUpdated=true");
}

// Confirms a rule's target playlist still exists on the pipeline's YouTube
// channel (using a freshly-refreshed access token) before a rule is saved, so
// routing can't point at a deleted playlist. Returns null on any failure.
async function verifyRulePlaylist({
  playlistId,
  userId,
  youtubeConnectionId
}: {
  playlistId: string;
  userId: string;
  youtubeConnectionId: string;
}) {
  const connection = await prisma.oAuthConnection.findFirst({
    where: {
      id: youtubeConnectionId,
      kind: ConnectionKind.YOUTUBE,
      status: ConnectionStatus.ACTIVE,
      userId
    },
    select: {
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      expiresAt: true,
      id: true,
      kind: true,
      status: true
    }
  });
  const tokenKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!connection || !tokenKey) {
    return null;
  }

  const accessToken = await getUsableYouTubeAccessToken(connection, tokenKey);
  if (!accessToken) {
    return null;
  }

  return verifyChannelPlaylist({ accessToken, playlistId });
}

// Server action: reorder a rule (up/down/top/bottom) within its pipeline. Uses
// the two-pass priority rewrite (see rule-ordering.ts) to avoid colliding on the
// unique (pipeline, priority) constraint mid-update.
async function moveRuleAction(formData: FormData) {
  "use server";

  const access = await requireAppAccess();
  if (access.isDemo) {
    redirect("/pipelines?demo=true&error=DemoReadOnly");
  }

  const ruleId = getRequiredFormValue(formData, "ruleId");
  const direction = getEnumValue(formData, "direction", [
    "up",
    "down",
    "top",
    "bottom"
  ] as const) as RuleMoveDirection;
  if (!ruleId) {
    redirect("/pipelines?error=MissingRuleFields");
  }

  const rule = await prisma.rule.findFirst({
    where: {
      id: ruleId,
      pipeline: { archivedAt: null, userId: access.userId }
    },
    select: { pipelineId: true }
  });

  if (!rule) {
    redirect("/pipelines?error=RuleNotFound");
  }

  const rules = await prisma.rule.findMany({
    where: {
      pipelineId: rule.pipelineId,
      pipeline: { archivedAt: null, userId: access.userId }
    },
    orderBy: { priority: "asc" },
    select: { id: true }
  });
  const ruleIds = rules.map((candidate) => candidate.id);
  const reorderedRuleIds = reorderRuleIds(ruleIds, ruleId, direction);
  if (reorderedRuleIds.join("\0") === ruleIds.join("\0")) {
    redirect("/pipelines?ruleUpdated=true");
  }

  await prisma.$transaction([
    ...reorderedRuleIds.map((candidateId, priorityIndex) =>
      prisma.rule.update({
        where: { id: candidateId },
        data: { priority: temporaryPriorityForIndex(priorityIndex) }
      })
    ),
    ...reorderedRuleIds.map((candidateId, priorityIndex) =>
      prisma.rule.update({
        where: { id: candidateId },
        data: { priority: finalPriorityForIndex(priorityIndex) }
      })
    )
  ]);

  revalidatePath("/pipelines");
  redirect("/pipelines?ruleUpdated=true");
}

// Server action: delete a rule and re-pack the survivors' priorities to a
// contiguous 1..N. Refuses to delete the last rule, since a pipeline with no
// rules could never route a file.
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

  // Delete + renumber in one transaction. Deleting the row first frees its
  // priority, so reassigning the rest to 1..N can't collide on the unique
  // (pipeline, priority) constraint.
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

// --- Form parsing helpers -------------------------------------------------
// The server actions above never trust raw FormData; these helpers coerce and
// validate it. getEnumValue in particular falls back to the first allowed value
// rather than erroring, so a tampered/missing select can't inject a bad enum.

function getRequiredFormValue(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function optionalFormValue(formData: FormData, key: string) {
  const value = getRequiredFormValue(formData, key);
  return value.length ? value : null;
}

// Returns the submitted value only if it's one of the allowed values, else the
// first allowed value as a safe default.
function getEnumValue<T extends string>(formData: FormData, key: string, values: readonly T[]) {
  const value = String(formData.get(key) || "");
  return values.includes(value as T) ? (value as T) : values[0];
}

// Gathers the distinct playlists already referenced by any rule on pipelines
// that share this YouTube connection — used to pre-populate the rule playlist
// dropdown with known-good options.
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

// A <select> option carries only one value, but a playlist needs both id and
// name. Pack them into one "id::name" string (URL-encoded so a "::" inside a
// name can't break parsing) and unpack it on submit with parsePlaylistValue.
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

// --- Condition tree helpers -----------------------------------------------
// Bridge between the stored ConditionGroup tree and the flat "classic" form,
// which only exposes the first couple of leaf conditions and the first nested
// group. These extractors pull those out for rendering existing rules.

function conditionChildAt(group: ConditionGroup, index: number): ConditionLeaf | undefined {
  return group.children.filter((child): child is ConditionLeaf => child.type === "condition")[index];
}

function firstNestedGroup(group: ConditionGroup): ConditionGroup | undefined {
  return group.children.find((child): child is ConditionGroup => child.type === "group");
}

// One-line human summary of a rule's condition tree, shown on each rule card.
function conditionTreeSummary(group: ConditionGroup) {
  const directConditions = group.children.filter((child) => child.type === "condition").length;
  const nestedGroups = group.children.filter((child) => child.type === "group").length;
  const parts = [`${group.combinator} group`, `${directConditions} condition${directConditions === 1 ? "" : "s"}`];
  if (nestedGroups > 0) {
    parts.push(`${nestedGroups} nested group${nestedGroups === 1 ? "" : "s"}`);
  }
  return `${parts.join(" with ")}.`;
}

// Reconstructs a rule's ConditionGroup from a submitted form. Two input paths:
//   1. The visual builder posts the whole tree as JSON in `conditionTree` — we
//      parse and sanitize it.
//   2. The classic form posts discrete fields — we assemble a root group with up
//      to two conditions plus one optional nested group from them.
// Returns undefined if anything is missing/invalid, which the actions treat as a
// validation failure.
function buildConditionTree(formData: FormData) {
  const submittedTree = getRequiredFormValue(formData, "conditionTree");
  if (submittedTree) {
    try {
      const parsed = JSON.parse(submittedTree);
      return sanitizeConditionGroup(parsed);
    } catch {
      return undefined;
    }
  }

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

// Validates an untrusted (JSON-parsed) group node, recursively. Caps nesting at
// depth 2 so a malicious/huge payload can't blow the stack or store an
// unrenderable tree, and drops any group that ends up with no valid children.
function sanitizeConditionGroup(input: unknown, depth = 0): ConditionGroup | undefined {
  if (!isRecord(input) || input.type !== "group") {
    return undefined;
  }

  const rawChildren = Array.isArray(input.children) ? input.children : [];
  const children = rawChildren
    .map((child): ConditionNode | undefined => {
      if (!isRecord(child)) {
        return undefined;
      }
      if (child.type === "condition") {
        return sanitizeConditionLeaf(child);
      }
      if (child.type === "group" && depth < 2) {
        return sanitizeConditionGroup(child, depth + 1);
      }
      return undefined;
    })
    .filter((child): child is ConditionNode => Boolean(child));

  if (children.length === 0) {
    return undefined;
  }

  return {
    id: typeof input.id === "string" && input.id ? input.id : `group-${randomUUID()}`,
    type: "group",
    combinator: input.combinator === "OR" ? "OR" : "AND",
    children
  };
}

// Validates a single untrusted condition leaf: the field must be known, the
// operator is normalized to one valid for that field, and the value is coerced
// to the shape that operator expects. caseSensitive is only honored for filename.
function sanitizeConditionLeaf(input: Record<string, unknown>): ConditionLeaf | undefined {
  const field = isConditionField(input.field) ? input.field : undefined;
  if (!field) {
    return undefined;
  }

  const operator = normalizeOperator(field, String(input.operator || ""));
  const value = sanitizeConditionValue(operator, input.value);
  if (value === undefined) {
    return undefined;
  }

  return {
    id: typeof input.id === "string" && input.id ? input.id : `cond-${randomUUID()}`,
    type: "condition",
    field,
    operator,
    value,
    ...(field === "filename" && input.caseSensitive === true ? { caseSensitive: true } : {})
  };
}

// Coerces a condition's value to match its operator: `is_one_of` → non-empty
// string array, `between` → {start,end} time range, everything else → a single
// trimmed string. Returns undefined when the value is empty/malformed.
function sanitizeConditionValue(operator: ConditionOperator, rawValue: unknown): ConditionLeaf["value"] | undefined {
  if (operator === "is_one_of") {
    const values = (Array.isArray(rawValue) ? rawValue : String(rawValue || "").split(","))
      .map((item) => String(item).trim())
      .filter(Boolean);
    return values.length > 0 ? values : undefined;
  }

  if (operator === "between") {
    const range = isRecord(rawValue)
      ? { start: String(rawValue.start || "").trim(), end: String(rawValue.end || "").trim() }
      : conditionValue(operator, String(rawValue || ""));
    if (
      typeof range === "object" &&
      !Array.isArray(range) &&
      range.start &&
      range.end
    ) {
      return range;
    }
    return undefined;
  }

  const value = String(rawValue || "").trim();
  return value ? value : undefined;
}

// Builds one condition leaf from the classic form's discrete fields. The
// `prefix` namespaces the field names (e.g. "condition2", "nested1") so multiple
// conditions can coexist in a single flat form.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isConditionField(value: unknown): value is ConditionField {
  return (
    value === "filename" ||
    value === "file_type" ||
    value === "day_of_week" ||
    value === "time_of_day"
  );
}

// Combines a prefix and key into a camelCase field name, e.g. ("nested1",
// "operator") → "nested1Operator". No prefix returns the key unchanged.
function prefixedFieldName(prefix: string, key: string) {
  return prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key;
}

// Maps a submitted operator to a valid one for the given field. The classic
// form namespaces operators by field (e.g. "file_type_equals") to keep its
// <select> values unique, so strip that prefix first, then fall back to the
// field's first allowed operator if the result isn't valid for this field.
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

// Parses a single classic-form string into the value shape its operator needs:
// comma-split list for `is_one_of`, a {start,end} pair (split on "-" or ",") for
// `between`, or the raw string otherwise.
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

// Type-to-confirm guard for public uploads: the user must re-type the pipeline
// name exactly, proving the public-privacy choice was deliberate.
function hasPublicPrivacyConfirmation(formData: FormData, pipelineName: string) {
  const confirmation = String(formData.get("publicPrivacyConfirmationText") || "").trim();
  return confirmation === pipelineName.trim();
}

// Resolves the polling cadence from either a preset or a custom HH:MM value, in
// minutes. Enforces a 5-minute floor and 1-week (10080-min) ceiling; returns
// null on anything out of range so the action can reject it.
function parsePollingIntervalMinutes(formData: FormData) {
  const preset = String(formData.get("pollingIntervalPreset") || "15");
  const rawMinutes =
    preset === "custom" ? parseCustomCadence(formData.get("pollingIntervalCustom")) : Number(preset);

  if (!Number.isFinite(rawMinutes) || rawMinutes < 5 || rawMinutes > 10080) {
    return null;
  }

  return Math.floor(rawMinutes);
}

// Parses a custom "HH:MM" cadence into total minutes; NaN if it doesn't match
// the strict HH:MM shape (so the range check above rejects it).
function parseCustomCadence(value: FormDataEntryValue | null) {
  const rawValue = String(value || "").trim();
  const match = rawValue.match(/^([0-9]{1,3}):([0-5][0-9])$/);
  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

// Maps the ?error redirect codes produced by the server actions to friendly
// notice text. Unknown codes fall through to a generic message that still
// includes the raw code for debugging.
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
      "Type the pipeline name exactly to confirm public YouTube uploads.",
    RuleNotFound: "Routing rule not found.",
    TokenRefreshFailed: "Google could not refresh the Drive token. Reconnect Drive and try again.",
    DriveListFailed: "Google Drive could not list files in this folder."
  };

  return messages[error] || `Pipeline setup failed: ${error}`;
}
