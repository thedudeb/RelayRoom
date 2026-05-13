# Recording Pipeline Platform — Build Spec

> **Source:** Full-Stack Developer Take-Home Assessment
> **Purpose of this document:** A reformatted, build-ready version of the original assessment intended to be handed to an LLM (or developer) as the authoritative spec. Every requirement from the original is preserved; reorganization and a few derived helper sections (data model sketch, open questions, suggested build order) are clearly marked.

---

## TL;DR

Build a multi-user web platform that:

1. Lets each user connect **multiple Google Drive accounts** (sources) and **multiple YouTube channels** (destinations) via OAuth.
2. Lets the user define **pipelines** that watch a specific Drive folder and target a specific YouTube channel.
3. Provides a **visual AND/OR rule builder** that decides which playlist a new recording lands in, based on filename / extension / day-of-week / time-of-day conditions.
4. Reliably **detects** new files in watched folders (push notifications, polling, or external webhook), runs them through the rule engine, **uploads** them to YouTube as unlisted, and adds them to the matched playlist.
5. Surfaces everything in an **operations dashboard** with full queue lifecycle, error remediation, manual routing, approval mode, retry, and "mark as already uploaded."

Reliability is paramount: no lost recordings, no duplicates, no misroutes. Quota, token, and failure handling must be observable and recoverable.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack & Platform](#2-tech-stack--platform)
3. [Derived Domain Model (helper)](#3-derived-domain-model-helper)
4. [Functional Requirements](#4-functional-requirements)
   - 4.1 [Authentication & User Accounts](#41-authentication--user-accounts)
   - 4.2 [Connections](#42-connections)
   - 4.3 [Pipelines](#43-pipelines)
   - 4.4 [Routing Rule Builder](#44-routing-rule-builder)
   - 4.5 [Detection & Dispatch](#45-detection--dispatch)
   - 4.6 [Routing Engine](#46-routing-engine)
   - 4.7 [Upload Pipeline](#47-upload-pipeline)
   - 4.8 [Operations Queue & Dashboard](#48-operations-queue--dashboard)
   - 4.9 [Error Handling](#49-error-handling)
   - 4.10 [Read-Only REST API](#410-read-only-rest-api)
5. [UX Expectations](#5-ux-expectations)
6. [QA Checklist](#6-qa-checklist)
7. [Deliverables](#7-deliverables)
8. [Evaluation Criteria](#8-evaluation-criteria)
9. [Open Questions / Ambiguities](#9-open-questions--ambiguities)
10. [Suggested Build Order (helper)](#10-suggested-build-order-helper)

---

## 1. Product Overview

The platform automates moving meeting recordings from Google Drive into a centralized YouTube video library. Four primary capabilities:

- **Connection management** — link multiple Google Drive accounts and YouTube channels via OAuth.
- **Pipeline configuration** — visual rule builder that decides which Drive recording goes into which YouTube playlist.
- **Detection & dispatch** — reliable trigger mechanism that picks up new recordings and runs them through the pipeline.
- **Operations dashboard** — review activity, handle exceptions, recover from failures.

### Core User Journey

1. User signs in with Google.
2. Connects one or more Drive accounts (sources) and one or more YouTube channels (destinations).
3. Creates a pipeline that watches a specific Drive folder and targets a specific YouTube channel.
4. Builds routing rules in the visual builder (filename patterns, metadata, time of day, etc., with AND/OR groups).
5. Enables the pipeline.
6. System detects a new recording → rule engine picks the playlist → uploads to YouTube as unlisted with auto-generated title/description → activity appears in the dashboard.
7. Exceptions (no rule matched, upload failed, manual approval required) are surfaced for resolution.

### Time Expectation

~5 to 7 days assuming effective use of AI coding tools.

### Tone of the Rule Builder

> Think of how Zapier, Notion automations, or Linear's filter builder feel — visual, forgiving, and immediately understandable.

---

## 2. Tech Stack & Platform

### Platform

Web app with an authenticated dashboard. No public-facing surface required.

### Recommended Stack

| Layer | Recommendation |
| --- | --- |
| Frontend | React or any React-based framework (Next.js, Remix, etc.) |
| Backend | Node.js or Python |
| Database | Any persistent storage (Firebase, MongoDB, PostgreSQL, etc.) |
| Infrastructure | Google Cloud preferred, but equivalent architecture is acceptable |

### Required Integrations

| Capability | Options |
| --- | --- |
| Google Drive API | `drive.file` scope (paired with Google Picker for folder selection) |
| YouTube Data API v3 | `youtube.upload` and `youtube` (playlist management) |
| Google OAuth 2.0 | Sign-in **and** per-service connection authorization (separate flows) |

### Trigger Mechanism (pick one)

| Approach | Notes |
| --- | --- |
| **Path A — External automation service** | Zapier, Make.com, n8n, Pipedream, Pabbly, etc. Platform exposes a signed webhook receiver. |
| **Path B — Custom implementation (preferred)** | Drive push notifications via `files.watch` (preferred for latency) or polling on a configurable interval. |

Either path must work end-to-end on the deployed app and be reproducible from the README.

### Coding Tools

AI-assisted development is encouraged (Cursor, Claude Code, etc.). Push to GitHub. Test in **GitHub Codespaces** before submitting to ensure reproducibility in a clean environment.

---

## 3. Derived Domain Model (helper)

> **Note:** This section is *derived* from the spec to help orient implementation. The original assessment does not prescribe a schema; treat this as a suggested starting point, not a requirement.

Core entities the spec implies:

- **User** — Google-authenticated account; has timezone; may be platform owner.
- **DriveConnection** — one user → many; OAuth grant scoped to specific Picker-selected folder(s); has status (`active`, `expired`, `errored`).
- **YouTubeConnection** — one user → many; OAuth grant for `youtube.upload` + `youtube`; same status set.
- **Pipeline** — belongs to a user; references one `DriveConnection` + a folder ID, and one `YouTubeConnection`; has mode (`auto` | `manual_approval`), status (`enabled` | `disabled` | `errored`), privacy (`unlisted` | `public`), default title/description templates.
- **Rule** — belongs to a pipeline; ordered (priority); has name, condition tree, action (target playlist), optional title/description override.
- **ConditionNode** — recursive tree; either a group (`AND`/`OR` + children) or a leaf (field + operator + value + case-sensitivity flag).
- **QueueItem** — one per `(pipeline_id, drive_file_id)` per detection; carries lifecycle status, file metadata snapshot, matched rule (if any), rule evaluation trace, upload attempts, YouTube video ID after success.
- **ActivityLogEntry** — append-only log of state transitions per queue item, with actor and timestamp.
- **ApiKey** — per-user, used for the read-only REST API.

Idempotency mapping is `(pipeline_id, drive_file_id) → youtube_video_id, youtube_playlist_id` (see §4.5 Idempotency for the verification rule).

---

## 4. Functional Requirements

### 4.1 Authentication & User Accounts

The platform is **multi-user**. Every authenticated user manages their own connections, pipelines, and operations queue independently.

#### Sign-in

- Users sign in with Google OAuth (basic profile + email scope only).
- New sign-ins via Google **create a user account automatically**.
- Sessions must be secure (httpOnly cookies or secure token storage).
- Session expiration and renewal must be handled.

#### Platform Owner

- The **first user** is bootstrapped via an environment variable (e.g., `INITIAL_ADMIN_EMAIL`). When that email signs in for the first time, the account is automatically marked as the platform owner.
- The platform owner can **disable or remove other user accounts**.
- The platform owner does **NOT** have visibility into other users' connections, pipelines, queue items, or any other private data. Their elevated power is account management only.

#### User Privacy

- Each user's connections, pipelines, and operations data are **private** to that user.
  > ⚠️ See [Open Questions §9](#9-open-questions--ambiguities) — the source document phrases this contradictorily; the intent (cross-referenced with Platform Owner privacy and the API scoping rule) is unambiguously "private per user."

---

### 4.2 Connections

A user can connect multiple Drive accounts and multiple YouTube channels. **Each connection is a separate OAuth grant distinct from sign-in and is reusable across multiple pipelines.**

#### Connecting a Google Drive Account

- The user initiates a "Connect Drive" flow from the connections page.
- A separate Google OAuth flow runs with `drive.file` scope, **paired with Google Picker for folder selection**. The user picks the source folder (typically their Meet Recordings folder) through Picker during connection setup; the granted token only has access to that folder and the files inside it.
- The app cannot browse, read, or list anything else in the user's Drive. The OAuth consent screen reflects this narrowed access.
- File watching, listing, and downloading all operate scoped to the picked folder.
- The user can repeat this flow to connect additional Drive accounts (e.g., personal + work).
- Each Drive connection displays: **account email**, **connected date**, **granted scopes**, **connection status** (active / expired / errored), **disconnect action** (revokes the token and removes the connection).

#### Connecting a YouTube Channel

- The user initiates a "Connect YouTube" flow from the connections page.
- Separate Google OAuth flow with `youtube.upload` + `youtube` (for playlist management).
- The user can repeat this flow to connect additional channels.
- Each YouTube connection displays: **channel name and handle**, **connected date**, **granted scopes**, **connection status**, **disconnect action**.

#### Token Lifecycle

- Refresh tokens must be stored securely and used to refresh access tokens silently before they expire.
- If a refresh token is invalidated (user revoked access from their Google account, password reset, etc.), the connection must surface as **errored** with a clear remediation path ("Re-authenticate this connection").
- All pipelines that depend on an errored connection must be marked errored and pause processing until reconnection.

#### Disconnection

- Disconnecting must revoke the token via Google's revocation endpoint and remove stored credentials.
- Pipelines that reference the disconnected source or destination must be marked errored.
- In-flight queue items belonging to those pipelines must remain visible in the dashboard with their last known status (**no silent deletion**).

---

### 4.3 Pipelines

A pipeline is the connection between a source Drive folder and a destination YouTube channel, with the rules that determine routing.

#### Pipeline Structure

- **Name** — descriptive (e.g., "Engineering Meeting Recordings", "Client Calls — Acme").
- **Source** — a Drive folder belonging to one of the user's connected Drive accounts.
- **Destination channel** — one of the user's connected YouTube channels (rules within the pipeline can route to any playlist on this channel).
- **Mode** — `auto` (default) or `manual approval required`.
- **Status** — `enabled` or `disabled`.
- **Default title template** — used when no rule overrides it (see Templating in §4.4).
- **Default description template** — same.
- **Rules** — an ordered list of routing rules (see §4.4).

#### Selecting a Source Folder

- Folder selection happens through **Google Picker**, launched from the pipeline configuration UI. The app receives only the picked folder's ID and permission to access it.
- **Pasting a raw folder URL/ID is not supported** — the app has no permission to access folders not granted via Picker.
- If the user wants to add another source folder later, they re-launch Picker from the same connection (which extends the connection's grant to include the new folder).
- Selecting a subfolder of an existing pipeline's source is allowed (each pipeline operates independently).
- **Multiple pipelines may watch the same Drive folder.** Common and intentional. When a new file is detected, **every** matching pipeline evaluates it independently (see §4.6).

#### Selecting a Destination Channel

- The destination channel is fixed at the pipeline level — every video uploaded by this pipeline goes to that single channel.
- Rules within the pipeline pick which **playlist** on that channel each video lands in.

#### Pipeline Mode

- **Auto** (default) — when a rule matches, the upload runs immediately.
- **Manual approval required** — every detected file goes to the **Needs Approval** queue. The dashboard shows the rule that would have fired (and the resulting playlist, title, and description); the operator approves, edits, or skips before the upload runs.

#### Pipeline Status

- **Enabled** — actively processes new files.
- **Disabled** — detection is paused. Existing queue items remain in their current state but no new items are added.

#### Pipeline Management

- Create, edit, delete, enable, disable.
- The pipeline list view shows each pipeline's name, source folder, destination channel, mode, status, last detection timestamp, and a **count of items waiting** in the queue (broken down by **Needs Approval / Needs Routing / Failed**).

#### Privacy Toggle (pipeline-level)

- YouTube privacy **defaults to `unlisted`** for every upload.
- Each pipeline configuration UI must include a toggle to switch the destination privacy to `public` (a YouTube-listed video, searchable).
- Switching **unlisted → public** must trigger a clear confirmation prompt that:
  - States plainly that listed videos are publicly searchable on YouTube.
  - Names the pipeline being modified and the destination channel.
  - Requires explicit confirmation (e.g., type the pipeline name, or a clearly labeled two-step "Yes, make public" action) — not a single click that's easy to misfire.
- Switching back from public → unlisted does **not** require this confirmation.
- Already-uploaded videos are **not** retroactively changed when the toggle flips — only future uploads honor the new setting.

---

### 4.4 Routing Rule Builder

**This is the centerpiece of the product.** Each pipeline has its own ordered list of rules. When a new file is detected, rules evaluate top-to-bottom and **first match wins**. The matched rule determines playlist, title, and description.

#### Rule Structure

- **Name** — required, descriptive (e.g., "Engineering Standup", "Acme Client Calls", "Friday Demos").
- **Priority** — position in the pipeline's rule list (drag-and-drop reorderable).
- **Conditions** — a tree combined by AND/OR group operators.
- **Action** — assign to a specific playlist on the pipeline's destination channel.
  - Playlist picker must show all playlists on the connected channel.
  - User must also be able to **create a new playlist inline** from the picker (calls the YouTube API to create the playlist on the connected channel).
- **Optional title template override** — overrides the pipeline default for files matched by this rule.
- **Optional description template override** — same.

#### Condition Tree

Conditions are combined into AND/OR groups. The builder must support **at least one level of nesting** — for example:

```
(filename contains "Standup" OR filename contains "Sync")
  AND
day-of-week is one of [Mon, Wed, Fri]
```

UI requirements:

- Visual representation of AND/OR grouping (indented blocks, color coding, or similar).
- Inline addition and removal of conditions.
- Inline addition, removal, and **conversion** of groups (AND ↔ OR).
- Real-time validation (e.g., regex syntax errors, missing values).
- Clear empty state when a rule has no conditions yet.

#### Supported Condition Fields & Operators

| Field | Operators |
| --- | --- |
| **Filename** | `contains` *(default)*, `starts with`, `ends with`, `equals`, `matches wildcard`, `matches regex` |
| **File extension or MIME type** | `equals`, `is one of` |
| **Day of week** | `is`, `is not`, `is one of` |
| **Time of day** | `between`, `before`, `after` |

Notes on filename operators:

- **Contains** is the default operator when a new condition is created.
- The operator selection must be a **clearly labeled dropdown** so users can switch.
- All filename operators must be **case-insensitive by default**, with a **visible toggle** to make a specific condition case-sensitive.
- Wildcard supports `*` and `?` (POSIX-style) as the user-friendly middle ground between contains and regex.
- Regex must be **PCRE-compatible** (or your runtime's standard flavor) and **surface syntax errors clearly during editing**.

Notes on day-of-week and time-of-day:

- Evaluated against the file's **`createdTime`** from the Drive API.
- Time-of-day uses the **user's account timezone** (which the user must be able to set in their profile; default to the browser's timezone on first sign-in).

#### First-Match-Wins

- Rules are evaluated in order, top to bottom.
- The first rule whose condition tree evaluates to true determines routing.
- Subsequent rules are **not** evaluated.
- If no rule matches, the file goes to the **Needs Routing** queue.

#### Templating

Title and description templates support these variables:

| Variable | Substitutes |
| --- | --- |
| `{filename}` | Full original filename including extension |
| `{filename_no_ext}` | Filename without extension |
| `{date}` | Drive `createdTime` formatted `YYYY-MM-DD` (user's timezone) |
| `{time}` | Drive `createdTime` formatted `HH:mm` (user's timezone) |
| `{rule_name}` | Name of the matched rule |
| `{playlist_name}` | Name of the destination playlist |
| `{source_folder_name}` | Name of the pipeline's source folder |

Each pipeline has a **default** title and description template. Each rule may **optionally override**. If no override, the pipeline default is used.

Example title template: `{rule_name} — {date}`
Example description template: `Recorded on {date} at {time}. Source: {source_folder_name}.`

#### Realistic Rule Examples (for the recorded demo)

Candidates should configure something like this to show the builder under realistic load:

| Rule name | Conditions | Playlist |
| --- | --- | --- |
| Engineering Standup | filename contains "Engineering" AND filename contains "Standup" | Engineering Standups |
| Acme Client Calls | filename contains "Acme" | Acme — Client Project |
| 1:1s with John | filename contains "1:1" AND filename contains "John" | 1:1s — John |
| Friday Demos | filename contains "Demo" AND day-of-week is Friday | Friday Demos |

#### Bonus: Rule Tester

A bonus that strong submissions include: a **rule tester** — paste a sample filename (and optionally other metadata), see which rule would match and which playlist the file would route to. Massively reduces the cost of authoring rules confidently.

---

### 4.5 Detection & Dispatch

The system must reliably detect new files in pipelines' source folders and run them through the rule engine.

#### Trigger Mechanism

Pick **one** of:

##### Path A — External Automation Service

- Wire up Zapier, Make.com, n8n, Pipedream, etc. to fire a webhook to your platform when a new file appears in a connected Drive folder.
- Platform exposes a **signed webhook receiver endpoint**.
- The webhook payload must be **authenticated** (HMAC signature, shared secret, or equivalent) so unauthorized callers cannot inject fake detections.
- Document the operator setup steps in the README: which automation tool was used, the trigger configuration, and how to wire it to a new pipeline.

##### Path B — Custom Implementation (preferred)

- Either Drive push notifications via `files.watch` (preferred for latency) or polling on a configurable interval per pipeline.
- For **push notifications**: handle channel renewal before the 7-day expiration, handle the cold-start subscription, and verify the `X-Goog-Channel-Token` header on incoming notifications.
- For **polling**: handle the cold-start problem (below) and avoid hammering the API.

#### Cold Start

When a pipeline is first enabled (or a freshly connected Drive folder is selected), files that **already existed** in the source folder must **NOT** be reprocessed. Only files created after the pipeline becomes active should be picked up. Candidate must implement this and document the approach (e.g., recording a `processedFromTime` watermark, snapshotting existing file IDs at enable time).

#### Idempotency

"Already processed" means **both** of the following are true for a given `(pipeline_id, drive_file_id)` pair:

1. The platform's database has a stored mapping recording the upload, including the resulting `youtube_video_id` and `youtube_playlist_id`.
2. The YouTube video at the recorded ID still exists on YouTube.

The mapping is written on every successful upload. The platform must persist enough state per uploaded item to support the verification rule below.

**Verification rule.** When a trigger event arrives for a Drive file that already has a stored mapping in the relevant pipeline, the platform must call YouTube (`videos.list?id=<youtube_video_id>&part=id`, costing 1 quota unit) to verify the destination still exists.

- **Video exists** → duplicate detection is a no-op. Record the verification event in the queue item's activity log.
- **Video does not exist** (404 or empty result) → the stored mapping is invalidated. The platform **reruns rule evaluation** against the current pipeline state and processes the file as if fresh. The queue item is updated **in place** — same item, new `youtube_video_id`, new `youtube_playlist_id`, fresh `uploaded_at`. Activity log records the destination-deleted event and the reprocess outcome.

The verification check happens only on duplicate detection events, **not** as a continuous background reconciliation. This keeps quota usage bounded — one extra unit per duplicate detection.

**Suppressing reprocess.** If the operator deletes a YouTube video on purpose and does not want the platform to re-upload, they must mark the queue item as **Skipped**. Skipped items are skipped on every future detection event regardless of YouTube state.

**Per-pipeline scope.** Idempotency is enforced **per `(pipeline_id, drive_file_id)` pair**, NOT globally. When multiple pipelines watch the same folder, each maintains its own mapping. The same Drive file can legitimately have one mapping per pipeline pointing to different YouTube videos on different channels.

#### Detection Latency Target

New files should reach the operations queue within approximately **one hour** of appearing in Drive. **No real-time requirement.**

---

### 4.6 Routing Engine

When a new detection event reaches the platform:

1. Identify **every pipeline** that watches the file's source folder (zero, one, or many).
2. For each matching pipeline, **fan out a separate evaluation**:
   - If the pipeline is disabled, errored, or its connections are broken → record the detection for that pipeline as `not_processed` with a reason and skip to the next pipeline.
   - Evaluate the pipeline's rules in priority order.
   - Determine the outcome:
     - **Match found, auto mode** → enqueue a queue item for upload to the matched playlist with the matched rule's templates.
     - **Match found, manual approval mode** → enqueue a queue item in **Needs Approval** with the rule's intended action.
     - **No match** (regardless of mode) → enqueue a queue item in **Needs Routing**.
   - Persist the rule evaluation result on every queue item so the dashboard can show which rule fired (or didn't) and why.

Each pipeline produces its **own queue item** for the same Drive file. This is intended — the same recording can legitimately land on multiple destinations.

If no pipeline watches the source folder, the trigger event is **discarded with a logged note** (do not silently lose data).

The evaluation result must be **inspectable per queue item**: which conditions matched/failed for each rule that was tried, in order.

---

### 4.7 Upload Pipeline

Items ready to upload (auto mode after a match, operator-approved, operator-routed, operator-retried) flow through the upload pipeline.

#### Upload Behavior

For each upload:

1. Download the file content from Drive using the source connection's credentials.
2. Initiate a YouTube **resumable upload** to the destination connection's channel.
3. Set `privacyStatus` according to the pipeline's privacy setting (defaults to `unlisted`; can be set to `public` per §4.3).
4. Set the title and description from the rule's templates (or the pipeline defaults).
5. After upload completes, **add the video to the matched playlist** via the YouTube playlist API.
6. Store the YouTube video ID and URL on the queue item.
7. Mark the item as **uploaded**.

#### Failure Handling

- **Transient failures** (network timeout, rate limit, transient 5xx) are **auto-retried with exponential backoff** up to a reasonable cap.
- **Quota errors and permanent failures** (auth revoked, playlist deleted, file too large, validation errors) are **not auto-retried** — the operator decides when to retry once the underlying issue is resolved.
- **Operator-initiated retry** is available at any time, including after auto-retry exhausts.

When an upload fails, the item is marked **failed** with:

- The error code/category (transient: rate limit, network timeout; permanent: auth revoked, playlist deleted, file not found, file too large).
- The raw error message from Google.
- The attempt count and last attempt timestamp.

The item remains in the dashboard as failed until the operator retries, marks it as already uploaded, or skips it. Persistent retries that keep failing must **accumulate the attempt history** (visible in the item detail view).

#### YouTube Quota Awareness

YouTube Data API v3 has a default daily quota of **10,000 units per project**. Each video upload consumes **1,600 units** → a fresh project can upload roughly **6 videos per day** before exhaustion. This will likely be hit during testing and the demo.

The platform must:

- Detect quota-exhausted errors specifically (HTTP 403 with `quotaExceeded` reason).
- Mark affected items with a clear `quota_exceeded` failure reason rather than a generic error.
- Surface this distinctly in the dashboard so the operator understands the failure is recoverable by waiting for quota reset (midnight Pacific Time).

Candidates should either request a quota increase from Google early (and mention in the architecture overview) or design the demo to fit within the default quota.

---

### 4.8 Operations Queue & Dashboard

Every detected file becomes a queue item with a lifecycle status.

#### Queue Item Statuses

| Status | Meaning |
| --- | --- |
| `detected` | Just received from the trigger; rule evaluation in progress (transient) |
| `needs_routing` | Detected and evaluated, no rule matched |
| `needs_approval` | Detected and matched, but the pipeline is in manual approval mode |
| `uploading` | Currently being uploaded to YouTube |
| `uploaded` | Successfully uploaded to YouTube and added to the matched playlist |
| `failed` | Upload attempt failed |
| `skipped` | Operator decided this file should not be uploaded |
| `externally_handled` | Operator manually downloaded the file from Drive and uploaded it to YouTube outside the system, then marked this item as already handled |

#### Dashboard Layout

A list view of every queue item, with:

**Tabs / quick filters:** All, Uploaded, Failed, Needs Approval, Needs Routing, Skipped, Externally Handled.

**Filters:** Pipeline, Date range (detection date), Status, Rule that matched (when applicable).

**Sorting:** Detection time (default: newest first), Filename, Status, Last action time.

**Per-row display:**

- Filename
- Source folder + pipeline name
- Detected at (compact relative form: `1h`, `20h`, `3d`, `2w`, `2mo`, `1yr`, with absolute timestamp on hover)
- Status badge
- Current/intended playlist (if applicable)
- Matched rule name (if applicable)
- Last action timestamp
- Action buttons appropriate to current status (see below)

**Per-item detail drawer or page:**

- All file metadata (Drive ID, MIME type, size, original filename, Drive `createdTime`)
- **Full rule evaluation result** — for each rule the engine tried, show which conditions matched and which failed (helpful for debugging "why didn't my rule fire?")
- Upload history with timestamps, attempt count, and full error messages
- YouTube link (if uploaded)
- Activity log (every state transition with timestamp and acting user)

#### Available Actions per Status

| Status | Available actions |
| --- | --- |
| `needs_routing` | **Route now** (pick playlist, optionally edit title/description, then upload), **Mark as already uploaded**, **Skip** |
| `needs_approval` | **Approve** (run as-is), **Edit and route** (change playlist, title, or description before upload), **Mark as already uploaded**, **Skip** |
| `failed` | **Retry**, **Mark as already uploaded**, **Skip** |
| `uploaded` | **Open on YouTube** (link to the video) |
| `skipped` | **Restore to queue** (returns to `needs_routing` or `needs_approval` depending on whether a rule matched originally) |
| `externally_handled` | **Open on YouTube** (if the operator entered a YouTube URL when marking) |
| `uploading` / `detected` | None (transient — show progress where applicable) |

#### "Mark as Already Uploaded"

Important escape hatch. The action must:

- **Optionally accept a YouTube URL** so the operator can link the manually-uploaded video back to the queue item.
- Move the item to `externally_handled` status.
- Remove the item from active queues (Needs Routing, Needs Approval, Failed) but keep it visible in the **Externally Handled** tab and **All** view.
- Be **reversible** (operator can restore the item to its previous state if they made a mistake).

#### Edit-and-Route

When the operator routes an unmatched file or edits an approval-mode item before upload, they must be able to:

- Pick any playlist on the pipeline's destination channel (or create a new one inline).
- Optionally override the title (**rendered preview shown**).
- Optionally override the description (**rendered preview shown**).
- Confirm — the upload runs with the operator's overrides.

---

### 4.9 Error Handling

The system must gracefully handle:

- **Drive folder deleted, moved, or access revoked** → pipeline marked errored, alert in dashboard with remediation steps.
- **YouTube channel disconnected or scope revoked** → all pipelines using that channel marked errored.
- **YouTube API quota exhausted** → items marked failed with `quota_exceeded` reason.
- **YouTube API rate-limit responses** (HTTP 403/429 with `userRateLimitExceeded` or `rateLimitExceeded`) → mark as failed with a transient reason; operator can retry once quotas reset.
- **Network timeouts** during download from Drive or upload to YouTube → mark as failed.
- **File too large for YouTube** (256 GB or 12-hour limits) → reject upfront with a clear reason.
- **File is not actually a video** (e.g., a stray PDF) → skip with reason and mark as `skipped` automatically, OR surface in **Needs Routing** with a non-video flag (candidate's call, **document the choice**).
- **Trigger fires for a file ID that has already been processed** → no-op, log to the item's activity log.
- **Trigger fires for a file in a folder no pipeline watches** → discard with a logged note (do not silently lose data).
- **Token refresh failure** → connection marked errored, all dependent pipelines paused.
- **Webhook signature verification failure** (Path A) → reject with 401 and log the attempt.

System must ensure:

- Errors are surfaced clearly with appropriate remediation copy.
- **Partial failures do not corrupt the queue** — e.g., a YouTube upload that succeeded but the playlist-add step failed must be handled: either retry just the playlist-add or mark as a partial success with a clear message.
- Failed operations can be retried where applicable.
- The system is **observably honest about its state** — if a pipeline is broken, it should look broken in the UI, **not silently swallow files**.

---

### 4.10 Read-Only REST API

In addition to the dashboard UI, the platform must expose a small read-only REST API so external automation (CLI tools, AI agents, monitoring scripts) can check progress without logging into the web UI.

**Minimum endpoints:**

- **List queue items** with filters (pipeline, status, date range).
- **Get a single queue item's full detail.**
- **Get aggregate counts per pipeline** (e.g., total, needs approval, needs routing, failed, uploaded today).

**Authentication:** per-user API key generated from the user's profile page. API access is **scoped to that user's pipelines and queue items only**.

Endpoints must be documented in the README with request/response examples so an operator can wire them into their agent of choice.

---

## 5. UX Expectations

### Configuration Surfaces

The configuration UI is where this product is judged hardest. It should demonstrate:

- A rule builder that feels **visual, fluid, and forgiving** (drag-and-drop, inline editing, real-time validation).
- Clear visual nesting for AND/OR groups.
- An obvious correspondence between a rule's conditions and what files it will match.
- Friendly empty states (*"No rules yet — every file will land in Needs Routing for manual handling"*).
- Obvious affordances for adding rules, conditions, groups, and templates.

**Bonus (strong submissions):** a **rule tester** (described in §4.4).

### Connections Surface

- Clearly distinguish active, expired, and errored connections.
- Show **what each connection is used by** (which pipelines depend on it).
- Make reconnection a **one-click flow** (resume the OAuth handshake, preserve the connection's identity so dependent pipelines aren't disrupted).

### Operations Dashboard

- Information-dense without clutter.
- Status badges immediately distinguishable (color, icon, label).
- Per-row actions require zero hunting — common actions are always visible.
- The detail view must explain **"why"** — especially the rule evaluation breakdown for items in **Needs Routing**.

### Cross-cutting

- Loading states must not jank the layout.
- Empty states must guide the user to the next step.
- Forms must show inline validation, not modal alerts.
- Long-running operations (token refresh, playlist creation, upload submission) need progress feedback.
- **The entire interface must be mobile-friendly** — every surface (connections, pipelines, rule builder, operations dashboard, item detail views) usable on a phone, not just desktop.

---

## 6. QA Checklist

Candidates must explicitly consider the following.

Testing should include:

- [ ] Connecting **multiple Drive accounts** to a single user.
- [ ] Connecting **multiple YouTube channels** to a single user.
- [ ] Creating a pipeline against a real Drive folder and a real YouTube channel.
- [ ] Building rules with multiple condition fields, multiple operators, AND/OR groups, and **at least one level of group nesting**.
- [ ] Verifying **first-match-wins** behavior across multiple overlapping rules.
- [ ] Detecting a real new file appearing in a watched folder, watching it flow through the pipeline, confirming the YouTube upload as **unlisted** in the correct playlist with the templated title and description.
- [ ] Testing the **Needs Routing** flow — upload a file the rules don't match, manually route it from the dashboard.
- [ ] Testing **manual approval mode** end-to-end.
- [ ] Testing **Mark as already uploaded** and verifying it can be reversed.
- [ ] Testing **Skip** and verifying restoration.
- [ ] Triggering a deliberate failure (revoke YouTube access mid-flight, exhaust quota, point a pipeline at a deleted folder) and verifying the dashboard surfaces the right state and remediation.
- [ ] Verifying **idempotency**: the same Drive file ID detected twice does not produce two uploads.
- [ ] Verifying **cold-start**: enabling a pipeline on a folder containing existing files does not retroactively process them.
- [ ] **Token expiration and refresh.**
- [ ] Running the complete flow **on the deployed app**, not just locally.

**Seed data** for the operations dashboard so reviewers can see a meaningful queue without waiting for real Drive events is **highly valued**. A seeding script that injects synthetic queue items across all statuses (uploaded, failed, needs_routing, needs_approval, skipped, externally_handled) — with varied filenames, timestamps, sizes — so the dashboard demonstrates filtering and sorting meaningfully.

If you implement seeding, make it **clearly distinguishable from real production activity** (e.g., a "test mode" pipeline, a flag on the seed records, or a separate seeded user account) so reviewers don't confuse seed data with real uploads.

---

## 7. Deliverables

### GitHub Repository

Repository must contain:

- Clean project structure.
- Clear README with:
  - Architecture overview.
  - Local development setup instructions.
  - Environment variable configuration.
  - Database setup instructions.
  - **OAuth setup instructions** — exactly what scopes to enable in the Google Cloud Console, what redirect URIs to register, what consent screen settings to use, and how to add test users.
  - **Trigger mechanism setup** — Path A: step-by-step Zapier/Make/n8n/etc. wiring; Path B: explanation of how detection works and how to verify it.
  - **YouTube quota note** — explicit mention that the default project quota allows ~6 uploads/day and how to request an increase.
  - Seeding instructions for test data.
- `.env.example` with all required variables documented (including `INITIAL_ADMIN_EMAIL`, Google client IDs/secrets, encryption key for stored OAuth tokens, etc.).

**The project must run in GitHub Codespaces.**

### Deployed Application

- Live, deployed version.
- Dashboard must be accessible.
- Real OAuth flows for Drive and YouTube must work end-to-end against the deployed URL.
- Include the deployment URL in the README.
- Deployed version must match the repository code.

### Recorded Demo (15–30 minutes)

Show:

- **Connection management**
  - Signing in with Google.
  - Connecting a Drive account (showing the OAuth consent screen).
  - Connecting a YouTube channel (separate flow).
  - Connecting a second Drive or YouTube account to demonstrate multi-account support.
- **Pipeline creation**
  - Creating a new pipeline, picking a Drive folder, picking a destination channel.
  - Setting the pipeline default title and description templates.
- **Rule building**
  - Creating multiple rules with different condition types.
  - Demonstrating AND/OR groups with **at least one level of nesting**.
  - Showing the playlist picker (and inline playlist creation if implemented).
  - Showing the rule tester (if implemented).
- **End-to-end flow**
  - Uploading a file to the connected Drive folder.
  - Detection appearing in the dashboard.
  - Rule evaluation deciding the playlist.
  - Upload to YouTube as unlisted.
  - Verifying the video appears in the correct playlist on the YouTube channel.
- **Operations dashboard**
  - Browsing the queue with filters and sorting.
  - Drilling into the detail view of a queue item, including the rule evaluation breakdown.
  - Manually routing an item from Needs Routing.
  - Approving an item in manual approval mode.
  - Marking an item as already uploaded (with a YouTube URL link-back).
  - Retrying a failed item.
- **Failure scenarios**
  - What happens when a rule does not match (Needs Routing).
  - What happens when an upload fails (revoke a token, or use a stale connection — surface the failure clearly).
  - YouTube quota error surface, if reachable.

Present the demo as if showing the product to a non-technical operator who will use this tool every day.

### System Architecture Overview (written)

Explain:

- Overall system architecture.
- **Data model** — users, connections, pipelines, rules, queue items, audit logs.
- **Multi-account OAuth design** — how the platform stores and refreshes tokens for an arbitrary number of Drive and YouTube connections per user.
- **Rule engine design** — how the AND/OR condition tree is stored and evaluated, how first-match-wins is implemented, how the rule evaluation breakdown is computed for the dashboard.
- **Trigger mechanism** — which path you chose and why; how authenticity is verified; how cold start is handled; how idempotency is enforced.
- **Upload pipeline** — how downloads from Drive and uploads to YouTube are orchestrated, how partial failures are recovered, how quota errors are detected and surfaced.
- **Authentication flow** — sign-in with Google, env-var bootstrap for the platform owner, session management, per-connection OAuth grants.
- **Token storage** — how OAuth refresh tokens are stored securely (encryption at rest, key management approach).

Also explain:

- How the system would handle scaling to **thousands of pipelines and tens of thousands of detected files per day**.
- How YouTube quota limits would be managed at scale (project sharding, quota increase requests, quota-aware scheduling).
- Key architectural tradeoffs made during development.
- What you would change or add given more time.

---

## 8. Evaluation Criteria

### Product Understanding

- Rule builder usability and expressiveness.
- Pipeline configuration ergonomics.
- Operations dashboard clarity.
- Practical UX decisions for a non-technical operator.
- How obvious it is to recover from common failures (no rule matched, upload failed, connection revoked).
- **Mobile usability** across every surface of the application.

### Engineering Judgment

- Multi-account OAuth implementation.
- Token storage and refresh.
- Rule engine design and correctness.
- Idempotency and cold-start handling.
- Error handling completeness.
- Quota awareness and graceful degradation.
- Code organization and maintainability.
- Database query efficiency for the queue and rule evaluation.

### Rule Builder and Configuration Quality

- Visual quality of the AND/OR group representation.
- Inline validation.
- How well the builder communicates the rule's behavior before any file is processed.
- Reordering, editing, and deletion ergonomics.
- Per-rule action configuration (playlist picker, template overrides).

### End-to-End Experience Quality

- Complete, working flow from Drive detection to YouTube upload to dashboard reflection.
- Reliability across the entire workflow on the deployed app.
- **Honest, observable system state (no silent failures).**
- Production-level deployment with real OAuth flows.

> This exercise evaluates your ability to build a reliable operational tool that orchestrates two third-party APIs, expresses non-trivial business logic through a configuration UI a non-technical user can confidently operate, and surfaces every meaningful state through a dashboard that supports recovery and exception handling.
>
> The best submissions will feel like a product an operator would happily configure once and trust to run quietly in the background — surfacing only the things that genuinely need a human decision.

---

## 9. Open Questions / Ambiguities

Things in the source that an implementer should resolve before building, with my best interpretation:

1. **User Privacy contradiction.** The "User Privacy" subsection literally says *"Each user's connections, pipelines, and operations data are visible to all other users."* This contradicts:
   - The Platform Owner section: *"The platform owner does not have visibility into other users' connections, pipelines, queue items, or any other private data."*
   - The API section: *"API access is scoped to that user's pipelines and queue items only."*
   - The product framing as a multi-user SaaS-like operations tool.
   **Best interpretation:** the "visible to all other users" line is a typo and should read *"NOT visible to all other users"* (i.e., user data is private). This document assumes that interpretation in §4.1. **Confirm with the assigner.**

2. **Non-video files in a video folder.** The spec explicitly leaves this to the candidate: either auto-skip with reason, or surface in Needs Routing with a non-video flag. **Pick one and document.**

3. **Trigger path.** Path B (custom) is *preferred* but Path A is *acceptable*. The candidate must pick one and document why.

4. **Polling interval (Path B, polling variant).** The spec says "configurable interval per pipeline" but doesn't give bounds. Detection latency target is ~1 hour, so any default <= 1 hour is acceptable; a sensible default might be 5–15 minutes.

5. **Restoring a `skipped` item.** Spec says it returns to `needs_routing` or `needs_approval` depending on whether a rule originally matched. The original rule evaluation must therefore be **preserved** on the queue item even after it's skipped — note this in the data model.

6. **"Reverse" of Mark as Already Uploaded.** The spec requires reversibility but doesn't specify the target state. Reasonable interpretation: restore to the state the item was in immediately before being marked (record `previous_status` on the item).

---

## 10. Suggested Build Order (helper)

> **Note:** This section is *derived* — a recommended phasing, not part of the original spec. Adjust to taste.

A reasonable phasing that frontloads risk and produces a demoable slice early:

### Phase 0 — Project scaffold
- Repo, deployment target, Codespaces config, `.env.example`, DB migrations skeleton, CI sanity check.

### Phase 1 — Auth & user model
- Google sign-in (basic profile + email scope).
- User account auto-creation.
- Session management (secure cookies).
- `INITIAL_ADMIN_EMAIL` bootstrap → platform owner role.
- User profile page with timezone + API key generation.
- Platform owner: disable/remove user accounts.

### Phase 2 — Connections (the OAuth-heavy bit)
- Drive connection flow with `drive.file` + Google Picker for folder selection.
- YouTube connection flow with `youtube.upload` + `youtube`.
- Encrypted token storage at rest.
- Silent refresh; errored state on refresh failure.
- Disconnect flow with token revocation.
- Connections list UI showing usage by pipelines.

### Phase 3 — Pipelines & rule builder (the centerpiece)
- Pipeline CRUD (source folder picked via Picker, destination channel, mode, status, defaults).
- Rule data model (ordered list, tree of AND/OR conditions).
- Visual rule builder UI: nested groups, condition leaves, all operator/field combinations, case-sensitivity toggle, regex validation, drag-to-reorder.
- Playlist picker with inline playlist creation.
- Template editor with variable substitution preview.
- Pipeline-level privacy toggle with the two-step confirmation on unlisted → public.
- **Bonus:** rule tester.

### Phase 4 — Detection & rule evaluation
- Pick trigger path (A or B); implement.
- Cold-start watermark on enable.
- Webhook signature verification (Path A) or `X-Goog-Channel-Token` verification + channel renewal (Path B push) or polling loop (Path B polling).
- Routing engine: fan out to every pipeline watching the folder; evaluate rules top-to-bottom; persist full evaluation trace; create queue items per pipeline.
- Idempotency mapping `(pipeline_id, drive_file_id)` + YouTube `videos.list` verification on duplicate detection.

### Phase 5 — Upload pipeline
- Drive download → YouTube resumable upload → playlist add.
- Title/description templating from rule (or pipeline defaults).
- Privacy from pipeline setting.
- Transient retry with exponential backoff.
- Permanent failures: classify (`quota_exceeded`, `auth_revoked`, `playlist_deleted`, `file_too_large`, etc.) and persist attempt history.
- Partial-failure recovery (upload succeeded, playlist-add failed).

### Phase 6 — Operations dashboard
- List view with all tabs, filters, sorting, per-row actions.
- Detail drawer/page with metadata, rule evaluation breakdown, upload history, activity log.
- Actions per status: Route now, Approve, Edit and route, Retry, Skip, Restore, Mark as already uploaded, Open on YouTube.
- Mark-as-already-uploaded with optional YouTube URL and reversibility.

### Phase 7 — Read-only REST API
- Per-user API key auth.
- List queue items (with filters), get item detail, get pipeline aggregate counts.
- README docs with request/response examples.

### Phase 8 — Polish & QA
- Mobile responsiveness across every surface.
- Inline validation, loading states, empty states, progress feedback.
- Seed script for the operations dashboard (distinguishable from real activity).
- Run through the entire QA checklist on the **deployed** app.
- Record the demo.
- Write the architecture overview.
