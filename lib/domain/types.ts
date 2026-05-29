// Application-layer domain vocabulary. These string-literal unions are the
// shapes the UI and business logic speak in; they intentionally mirror but stay
// decoupled from the Prisma DB enums (which are SCREAMING_CASE) so persistence
// changes don't ripple straight into the front end. The repository layer maps
// between the two.

// --- Status / kind enums --------------------------------------------------

export type ConnectionStatus = "active" | "expired" | "errored";
export type ConnectionKind = "drive" | "youtube";
export type PipelineMode = "auto" | "manual_approval";
export type PipelineStatus = "enabled" | "disabled" | "errored";
export type PrivacyStatus = "unlisted" | "public";

export type QueueStatus =
  | "detected"
  | "needs_routing"
  | "needs_approval"
  | "uploading"
  | "uploaded"
  | "failed"
  | "skipped"
  | "externally_handled";

export type FailureReason =
  | "quota_exceeded"
  | "auth_revoked"
  | "playlist_deleted"
  | "file_not_found"
  | "file_too_large"
  | "not_video"
  | "rate_limited"
  | "network_timeout"
  | "validation_error"
  | "unknown";

// --- Rule conditions ------------------------------------------------------
// A pipeline's routing rules are trees of condition nodes. Each field type has
// its own set of valid operators; the unions below enumerate those pairings.

export type ConditionField = "filename" | "file_type" | "day_of_week" | "time_of_day";

export type FilenameOperator =
  | "contains"
  | "starts_with"
  | "ends_with"
  | "equals"
  | "matches_wildcard"
  | "matches_regex";

export type FileTypeOperator = "equals" | "is_one_of";
export type DayOperator = "is" | "is_not" | "is_one_of";
export type TimeOperator = "between" | "before" | "after";
export type ConditionOperator =
  | FilenameOperator
  | FileTypeOperator
  | DayOperator
  | TimeOperator;

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

// A condition node is either a group (AND/OR of children) or a leaf (a single
// field/operator/value test) — a recursive boolean expression tree.
export type ConditionNode = ConditionGroup | ConditionLeaf;

export interface ConditionGroup {
  id: string;
  type: "group";
  combinator: "AND" | "OR";
  children: ConditionNode[];
}

export interface ConditionLeaf {
  id: string;
  type: "condition";
  field: ConditionField;
  operator: ConditionOperator;
  value: string | string[] | TimeRange;
  caseSensitive?: boolean;
}

export interface TimeRange {
  start: string;
  end: string;
}

// --- Core entities --------------------------------------------------------

export interface Playlist {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name?: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  conditions: ConditionGroup;
  playlist: Playlist;
  titleTemplate?: string;
  descriptionTemplate?: string;
}

// A pipeline ties a Drive source folder to a YouTube destination, with rules
// that decide each detected file's playlist/title/description. `mode` selects
// fully automatic routing vs. a manual-approval gate.
export interface Pipeline {
  id: string;
  name: string;
  sourceFolderId: string;
  sourceFolderName: string;
  driveConnectionId: string;
  youtubeConnectionId: string;
  destinationChannelName: string;
  mode: PipelineMode;
  status: PipelineStatus;
  privacyStatus: PrivacyStatus;
  pollingIntervalMinutes: number;
  defaultTitleTemplate: string;
  defaultDescriptionTemplate: string;
  processedFromTime: string;
  lastDetectionAt?: string;
  archivedAt?: string;
  owner: UserSummary;
  rules: RoutingRule[];
}

export interface DriveFileMetadata {
  id: string;
  filename: string;
  mimeType: string;
  extension?: string;
  sizeBytes?: number;
  createdTime: string;
  sourceFolderId: string;
}

// --- Evaluation traces ----------------------------------------------------
// When rules are evaluated, each node records whether it matched and why. The
// trace mirrors the condition tree so the UI's rule tester can show, node by
// node, exactly how a routing decision was reached.

export interface ConditionTrace {
  nodeId: string;
  type: "condition";
  field: ConditionField;
  operator: ConditionOperator;
  matched: boolean;
  expected: unknown;
  actual: unknown;
  message?: string;
}

export interface GroupTrace {
  nodeId: string;
  type: "group";
  combinator: "AND" | "OR";
  matched: boolean;
  children: EvaluationTrace[];
}

export type EvaluationTrace = ConditionTrace | GroupTrace;

export interface RuleTrace {
  ruleId: string;
  ruleName: string;
  priority: number;
  matched: boolean;
  trace: EvaluationTrace;
}

export interface RoutingResult {
  matchedRule?: RoutingRule;
  playlist?: Playlist;
  title: string;
  description: string;
  ruleTraces: RuleTrace[];
}

// A single detected Drive file as it moves through the upload queue. Carries
// the routing decision (intended playlist, rendered title/description, matched
// rule + trace), the YouTube result once uploaded, and failure detail on error.
// `previousStatus` supports the skip/restore flow in the queue state machine.
export interface QueueItem {
  id: string;
  pipelineId: string;
  pipelineName: string;
  youtubeConnectionId?: string;
  sourceFolderName: string;
  driveFileId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  driveCreatedTime: string;
  detectedAt: string;
  status: QueueStatus;
  intendedPlaylistId?: string;
  matchedRuleId?: string;
  matchedRuleName?: string;
  intendedPlaylistName?: string;
  renderedTitle?: string;
  renderedDescription?: string;
  ruleEvaluationTrace?: RuleTrace[];
  routingOptions?: Playlist[];
  youtubeVideoId?: string;
  youtubePlaylistId?: string;
  youtubeUrl?: string;
  failureReason?: FailureReason;
  lastError?: string;
  lastActionAt: string;
  previousStatus?: QueueStatus;
  isSeedData?: boolean;
  owner: UserSummary;
}

// A connected Google account (Drive or YouTube) as shown on the connections
// page, including which pipelines depend on it so the UI can warn before
// disconnecting.
export interface ConnectionSummary {
  id: string;
  kind: ConnectionKind;
  label: string;
  accountEmail: string;
  status: ConnectionStatus;
  connectedAt: string;
  errorMessage?: string;
  expiresAt?: string;
  scopes: string[];
  usedByPipelines: string[];
  owner: UserSummary;
}
