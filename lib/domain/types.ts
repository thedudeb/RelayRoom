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

export interface QueueItem {
  id: string;
  pipelineId: string;
  pipelineName: string;
  sourceFolderName: string;
  driveFileId: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  driveCreatedTime: string;
  detectedAt: string;
  status: QueueStatus;
  intendedPlaylistId?: string;
  matchedRuleName?: string;
  intendedPlaylistName?: string;
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

export interface ConnectionSummary {
  id: string;
  kind: ConnectionKind;
  label: string;
  accountEmail: string;
  status: ConnectionStatus;
  connectedAt: string;
  scopes: string[];
  usedByPipelines: string[];
  owner: UserSummary;
}
