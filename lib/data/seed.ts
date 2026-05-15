import type { ConnectionSummary, Pipeline, QueueItem } from "@/lib/domain/types";

export const demoTimezone = "America/Halifax";

export const demoConnections: ConnectionSummary[] = [
  {
    id: "drive-work",
    kind: "drive",
    label: "Work Drive",
    accountEmail: "alex@acme.example",
    status: "active",
    connectedAt: "2026-05-10T14:00:00.000Z",
    scopes: ["drive.readonly"],
    usedByPipelines: ["Engineering Meeting Recordings", "Client Calls"]
  },
  {
    id: "drive-personal",
    kind: "drive",
    label: "Personal Drive",
    accountEmail: "alex.personal@example.com",
    status: "expired",
    connectedAt: "2026-04-28T10:30:00.000Z",
    scopes: ["drive.readonly"],
    usedByPipelines: []
  },
  {
    id: "youtube-main",
    kind: "youtube",
    label: "Acme Knowledge Library",
    accountEmail: "youtube-admin@acme.example",
    status: "active",
    connectedAt: "2026-05-10T14:12:00.000Z",
    scopes: ["youtube.upload", "youtube"],
    usedByPipelines: ["Engineering Meeting Recordings", "Client Calls"]
  }
];

export const demoPipelines: Pipeline[] = [
  {
    id: "pipe-eng",
    name: "Engineering Meeting Recordings",
    sourceFolderId: "folder-eng-meet",
    sourceFolderName: "Meet Recordings / Engineering",
    driveConnectionId: "drive-work",
    youtubeConnectionId: "youtube-main",
    destinationChannelName: "Acme Knowledge Library",
    mode: "auto",
    status: "enabled",
    privacyStatus: "unlisted",
    pollingIntervalMinutes: 15,
    defaultTitleTemplate: "{filename_no_ext} - {date}",
    defaultDescriptionTemplate:
      "Recorded on {date} at {time}. Source: {source_folder_name}.",
    processedFromTime: "2026-05-12T12:00:00.000Z",
    lastDetectionAt: "2026-05-13T13:12:00.000Z",
    rules: [
      {
        id: "rule-standup",
        name: "Engineering Standup",
        priority: 1,
        playlist: { id: "pl-standups", name: "Engineering Standups" },
        titleTemplate: "{rule_name} - {date}",
        conditions: {
          id: "group-standup-root",
          type: "group",
          combinator: "AND",
          children: [
            {
              id: "cond-eng",
              type: "condition",
              field: "filename",
              operator: "contains",
              value: "Engineering"
            },
            {
              id: "cond-standup",
              type: "condition",
              field: "filename",
              operator: "contains",
              value: "Standup"
            }
          ]
        }
      },
      {
        id: "rule-demo",
        name: "Friday Demos",
        priority: 2,
        playlist: { id: "pl-demos", name: "Friday Demos" },
        conditions: {
          id: "group-demo-root",
          type: "group",
          combinator: "AND",
          children: [
            {
              id: "cond-demo",
              type: "condition",
              field: "filename",
              operator: "contains",
              value: "Demo"
            },
            {
              id: "cond-friday",
              type: "condition",
              field: "day_of_week",
              operator: "is",
              value: "Fri"
            }
          ]
        }
      }
    ]
  },
  {
    id: "pipe-client",
    name: "Client Calls",
    sourceFolderId: "folder-client-calls",
    sourceFolderName: "Meet Recordings / Clients",
    driveConnectionId: "drive-work",
    youtubeConnectionId: "youtube-main",
    destinationChannelName: "Acme Knowledge Library",
    mode: "manual_approval",
    status: "enabled",
    privacyStatus: "unlisted",
    pollingIntervalMinutes: 30,
    defaultTitleTemplate: "{filename_no_ext}",
    defaultDescriptionTemplate:
      "Client recording captured on {date} at {time}. Routed by {rule_name}.",
    processedFromTime: "2026-05-11T09:00:00.000Z",
    lastDetectionAt: "2026-05-13T12:40:00.000Z",
    rules: [
      {
        id: "rule-acme",
        name: "Acme Client Calls",
        priority: 1,
        playlist: { id: "pl-acme", name: "Acme - Client Project" },
        conditions: {
          id: "group-acme-root",
          type: "group",
          combinator: "OR",
          children: [
            {
              id: "cond-acme",
              type: "condition",
              field: "filename",
              operator: "contains",
              value: "Acme"
            },
            {
              id: "cond-project-code",
              type: "condition",
              field: "filename",
              operator: "matches_wildcard",
              value: "ACM-????-*"
            }
          ]
        }
      }
    ]
  }
];

export const demoQueueItems: QueueItem[] = [
  {
    id: "queue-001",
    pipelineId: "pipe-eng",
    pipelineName: "Engineering Meeting Recordings",
    sourceFolderName: "Meet Recordings / Engineering",
    driveFileId: "drive-file-001",
    filename: "Engineering Standup 2026-05-13.mp4",
    mimeType: "video/mp4",
    sizeBytes: 428_100_000,
    driveCreatedTime: "2026-05-13T12:05:00.000Z",
    detectedAt: "2026-05-13T12:17:00.000Z",
    status: "uploaded",
    matchedRuleName: "Engineering Standup",
    intendedPlaylistId: "seed-engineering-standups",
    intendedPlaylistName: "Engineering Standups",
    youtubeVideoId: "yt-001",
    youtubePlaylistId: "seed-engineering-standups",
    youtubeUrl: "https://youtube.com/watch?v=yt-001",
    lastActionAt: "2026-05-13T12:31:00.000Z",
    isSeedData: true
  },
  {
    id: "queue-002",
    pipelineId: "pipe-client",
    pipelineName: "Client Calls",
    sourceFolderName: "Meet Recordings / Clients",
    driveFileId: "drive-file-002",
    filename: "Acme Roadmap Review.mp4",
    mimeType: "video/mp4",
    sizeBytes: 812_500_000,
    driveCreatedTime: "2026-05-13T11:00:00.000Z",
    detectedAt: "2026-05-13T11:12:00.000Z",
    status: "needs_approval",
    matchedRuleName: "Acme Client Calls",
    intendedPlaylistId: "seed-acme-client-project",
    intendedPlaylistName: "Acme - Client Project",
    lastActionAt: "2026-05-13T11:13:00.000Z",
    isSeedData: true
  },
  {
    id: "queue-003",
    pipelineId: "pipe-eng",
    pipelineName: "Engineering Meeting Recordings",
    sourceFolderName: "Meet Recordings / Engineering",
    driveFileId: "drive-file-003",
    filename: "Architecture Deep Dive.mov",
    mimeType: "video/quicktime",
    sizeBytes: 1_130_200_000,
    driveCreatedTime: "2026-05-12T18:20:00.000Z",
    detectedAt: "2026-05-12T18:29:00.000Z",
    status: "needs_routing",
    lastActionAt: "2026-05-12T18:30:00.000Z",
    isSeedData: true
  },
  {
    id: "queue-004",
    pipelineId: "pipe-eng",
    pipelineName: "Engineering Meeting Recordings",
    sourceFolderName: "Meet Recordings / Engineering",
    driveFileId: "drive-file-004",
    filename: "Friday Demo - Search Indexing.mp4",
    mimeType: "video/mp4",
    sizeBytes: 655_900_000,
    driveCreatedTime: "2026-05-08T19:00:00.000Z",
    detectedAt: "2026-05-08T19:09:00.000Z",
    status: "failed",
    matchedRuleName: "Friday Demos",
    intendedPlaylistId: "seed-friday-demos",
    intendedPlaylistName: "Friday Demos",
    failureReason: "quota_exceeded",
    lastError:
      "YouTube quotaExceeded: uploads cost 1,600 units and the project has exhausted its daily quota.",
    lastActionAt: "2026-05-08T19:11:00.000Z",
    isSeedData: true
  },
  {
    id: "queue-005",
    pipelineId: "pipe-client",
    pipelineName: "Client Calls",
    sourceFolderName: "Meet Recordings / Clients",
    driveFileId: "drive-file-005",
    filename: "Vendor Contract Notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 920_000,
    driveCreatedTime: "2026-05-11T15:40:00.000Z",
    detectedAt: "2026-05-11T15:51:00.000Z",
    status: "skipped",
    failureReason: "not_video",
    lastError: "Non-video file detected in a watched folder.",
    lastActionAt: "2026-05-11T15:55:00.000Z",
    isSeedData: true
  },
  {
    id: "queue-006",
    pipelineId: "pipe-client",
    pipelineName: "Client Calls",
    sourceFolderName: "Meet Recordings / Clients",
    driveFileId: "drive-file-006",
    filename: "ACM-2026-Q2 Budget Sync.mp4",
    mimeType: "video/mp4",
    sizeBytes: 553_340_000,
    driveCreatedTime: "2026-05-10T16:10:00.000Z",
    detectedAt: "2026-05-10T16:22:00.000Z",
    status: "externally_handled",
    matchedRuleName: "Acme Client Calls",
    intendedPlaylistId: "seed-acme-client-project",
    intendedPlaylistName: "Acme - Client Project",
    youtubeUrl: "https://youtube.com/watch?v=manual-acme",
    previousStatus: "needs_approval",
    lastActionAt: "2026-05-10T16:47:00.000Z",
    isSeedData: true
  }
];
