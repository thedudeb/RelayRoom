# RelayRoom — System Architecture Overview

This document fulfils the SPEC §7 written-architecture deliverable. It explains how the system is shaped today and what would change to take it from "demo on Vercel hobby" to "thousands of pipelines, tens of thousands of files per day."

---

## 1. System shape at a glance

| Layer | Choice | Why |
|---|---|---|
| Frontend + backend | Next.js 14 (App Router, TypeScript) | One repo, server components for data-heavy pages, server actions for mutations, route handlers for the REST API and webhooks. |
| Database | PostgreSQL on Neon | Free-tier-friendly serverless Postgres, ergonomic with Prisma. |
| ORM | Prisma | Typed query API + versioned migrations checked into the repo. |
| Auth | Auth.js with PrismaAdapter, Google provider | Built-in session model + adapter that writes through to Postgres. |
| Hosting | Vercel | Cron triggers + serverless function model fits the worker pattern. |
| Object storage | None — files stream Drive → YouTube directly | Avoids a third party in the data path; halves the bandwidth bill. |

The flow at the highest level:

```
   ┌────────────────┐   push     ┌─────────────────────┐
   │  Google Drive  │ ─────────► │  /api/webhooks/drive│ ─► flag pipeline due
   │  (watched      │            └─────────────────────┘
   │   folder)      │ poll       ┌─────────────────────┐
   └────────────────┘ ◄────────► │  /api/cron/detect   │ ─► run detection,
                                 └─────────────────────┘    renew watch channels
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │  Routing engine  │ ─► fan out per pipeline,
                                  │  (rule trees)    │    evaluate conditions,
                                  └──────────────────┘    persist QueueItem + trace
                                          │
                                          ▼
                                ┌──────────────────────────┐
                                │ /api/cron/process-uploads│ ─► claim DETECTED,
                                │ (every minute)           │    stream Drive → YT
                                └──────────────────────────┘    chunked w/ Content-Range
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │ Operations queue │ ◄─ operator routes /
                                  │ + REST API       │    approves / retries
                                  └──────────────────┘
```

---

## 2. Data model

Defined in [`prisma/schema.prisma`](../prisma/schema.prisma).

| Model | Purpose | Notable fields |
|---|---|---|
| `User` | Authenticated identity | `role` (`OWNER` / `MEMBER`), `disabledAt`, `timezone` |
| `Account`, `Session`, `VerificationToken` | Auth.js bookkeeping for Google sign-in | — |
| `ApiKey` | Per-user read-only API key | `keyHash` (HMAC-peppered or legacy SHA-256), `revokedAt`, `lastUsedAt` |
| `OAuthConnection` | One per (user, Drive or YouTube channel) | `kind`, `status`, `encryptedAccessToken`, `encryptedRefreshToken`, `expiresAt`, `channelId` for YouTube |
| `Pipeline` | Source folder → destination channel binding | `mode`, `status`, `processedFromTime` (cold-start watermark), `driveChannelId` + `driveChannelToken` + `driveChannelExpiresAt` (push subscription), `archivedAt` |
| `Rule` | Ordered routing rule on a pipeline | `priority`, `conditionTree` (JSON), `youtubePlaylistId`, template overrides |
| `QueueItem` | One row per detected `(pipeline, drive_file)` | `status`, `previousStatus`, `failureReason`, `ruleEvaluationTrace`, `intendedPlaylistId`, `renderedTitle` / `renderedDescription` (operator may override on edit-and-route), `youtubeVideoId` after success, `userId` (for owner-scoped mutations and API key visibility) |
| `UploadAttempt` | One row per upload try | `attemptNumber`, `failureReason`, `rawError`, `youtubeVideoId` |
| `ActivityLogEntry` | Append-only audit log per queue item | `actorType`, `message`, `metadata` JSON |
| `WebhookEvent` | Replay protection for signed webhooks | `replayKey` (unique), `expiresAt` |

### Idempotency mapping

`(pipelineId, driveFileId)` is unique on `QueueItem`. Re-detection of an already-known file becomes an in-place verification rather than a new row (see §5).

### Per-pipeline scope

Idempotency is enforced per `(pipelineId, driveFileId)`, **not** globally. The same Drive file in two pipelines legitimately produces two `QueueItem` rows mapping to different YouTube videos on different channels.

---

## 3. Multi-account OAuth

Sign-in and per-service authorization are deliberately **separate flows**:

- **Sign-in**: `GET /api/auth/[...nextauth]/...` — Auth.js + Google provider, `email + profile` scope only. Identity, not capability.
- **Drive connection**: `GET /api/oauth/drive/start` → Google consent (`drive.readonly`) → `GET /api/oauth/drive/callback`. Persists an `OAuthConnection` with `kind=DRIVE`.
- **YouTube connection**: same shape with `youtube.upload + youtube` scopes. Lookup keyed on **channel id** (not account email) so a Google account with multiple channels yields multiple `OAuthConnection` rows.

Each connection is reusable across pipelines. Disconnect:
1. Calls Google's `oauth2/revoke` endpoint.
2. Wipes both `encryptedAccessToken` and `encryptedRefreshToken` from the row.
3. Marks the row `ERRORED` and flips dependent pipelines to `ERRORED` so the dashboard surfaces the break.

In-flight `QueueItem`s belonging to those pipelines stay visible — no silent deletion.

### Refresh lifecycle

On every API call that needs a token, callers go through `getUsable{Drive,YouTube}AccessToken(connection, tokenKey)`:

1. Decrypt access token (AAD-bound to `connectionId`).
2. If `expiresAt > now + 60s`, return it.
3. Otherwise refresh via Google with the decrypted refresh token; persist new access token + expiry.
4. On refresh failure: call `markConnectionRefreshFailed` which sets the connection to `ERRORED` and pauses dependent pipelines.

---

## 4. Authentication flow

```
1. User clicks "Sign in with Google" on /
   → Auth.js redirects to Google's consent screen.

2. Google callback hits Auth.js's PrismaAdapter.
   → A User row is created automatically on first sign-in.
   → A Session row is opened (database strategy, not JWT).

3. The signIn callback enforces an allowlist:
   - If AUTH_ALLOWED_EMAILS / INITIAL_ADMIN_EMAIL match the signing-in email → allow.
   - Otherwise → redirect to /?error=AccessDenied.
   - Empty allowlist fails closed in production; dev opt-in via AUTH_ALLOW_ANY=true.

4. The createUser event promotes INITIAL_ADMIN_EMAIL to role=OWNER on first sign-in.

5. Subsequent requests resolve the session via auth(); requireAppAccess() in
   server components and getApiAccess() in route handlers branch on demo /
   session / API key.

6. Per-service OAuth (Drive, YouTube) is a separate consent screen and a
   separate database row, so revoking either has no effect on the other.
```

Session cookies are pinned: `httpOnly`, `SameSite=Lax` (sign-in cookie) / `SameSite=Strict` (per-service OAuth state cookies), `Secure` in production, with explicit `maxAge` and `updateAge` so a NextAuth dependency bump can't silently relax them.

---

## 5. Trigger mechanism

The spec accepts any one of three paths. **We implement all three** and route them through the same downstream code so idempotency, cold-start, and rule evaluation are exactly one path.

### 5.1 Drive push notifications (preferred)

On pipeline enable, [`subscribeDriveFolderWatch`](../lib/drive/watch.ts) calls `files.watch` on the source folder. The response carries the channel id, resource id, and Google-assigned expiry (≤7 days). We store all four fields on `Pipeline` (`driveChannelId`, `driveChannelResourceId`, `driveChannelToken`, `driveChannelExpiresAt`).

The receiver [`POST /api/webhooks/drive`](../app/api/webhooks/drive/route.ts):
1. Reads `X-Goog-Channel-Id`.
2. Verifies `X-Goog-Channel-Token` against the stored value using a constant-time compare.
3. Ignores `X-Goog-Resource-State: sync` (Google's initial handshake).
4. Looks up the pipeline; refuses unknown channel ids with `404` so Google stops retrying.
5. Refuses inactive (disabled/archived) pipelines with a `200` ack so Google stops retrying.
6. If valid: nulls `lastDetectionAt` and returns immediately.

The webhook never runs detection inline — it just promotes the pipeline to the head of the cron queue. This keeps the response under Google's slow-ack retry threshold and lets the existing rate/quota logic apply uniformly to push and poll alike.

A renewal pass inside `/api/cron/detect` re-subscribes any channel within 24h of expiry (or missing) up to 10 per tick.

### 5.2 Polling

`/api/cron/detect` runs every 5 minutes. It picks ENABLED pipelines whose `pollingIntervalMinutes` cadence is due (oldest `lastDetectionAt` first, capped at `MAX_PIPELINE_LIMIT=50` per tick), and for each one calls `runDriveDetectionForPipeline`.

### 5.3 Signed webhook (external automation)

`POST /api/webhooks/detection` accepts a JSON body identifying either a pipeline or a Drive folder. Authentication:
- `x-relayroom-signature` = `sha256=` + HMAC-SHA256(`DETECTION_WEBHOOK_SECRET`, `timestamp + "." + body`).
- `x-relayroom-timestamp` in canonical Unix-seconds or strict RFC3339.
- Replay protection: a `WebhookEvent` row is inserted keyed on `eventId` (or a hash of timestamp+signature+body); the unique constraint rejects duplicates.

### 5.4 Cold-start watermark

When a pipeline is enabled, `processedFromTime` is set to `now()`. Detection refuses to run on pipelines with a null watermark — this prevents the historical fallback to `pipeline.createdAt` from re-importing files that existed before enable. If a legacy enabled pipeline has a null watermark, the next detection logs `MissingDetectionWatermark` and surfaces it in the dashboard.

### 5.5 Idempotency verification

When detection sees a Drive file that already has a `QueueItem`:

| Existing status | Action |
|---|---|
| `SKIPPED` | Suppress — user dismissed this item. |
| `UPLOADED` with `youtubeVideoId` | Call YouTube `videos.list?id=<id>&part=id` (1 quota unit). If video exists → log verification, no-op. If 404 → reprocess in place (clears YouTube fields, re-evaluates rules, returns to the queue with fresh `uploaded_at`). |
| `UPLOADED` with missing video id | Treat as the 404 case — reprocess. |
| Everything else (`DETECTED`, `NEEDS_APPROVAL`, `NEEDS_ROUTING`, `FAILED`, `UPLOADING`, `EXTERNALLY_HANDLED`) | Suppress — operator owns the next move. |

The unique constraint plus a transactional `P2002` recovery path handle concurrent-detection races (two cron ticks or a push + poll arriving in parallel).

---

## 6. Routing engine

`lib/rules/rule-engine.ts` evaluates a pipeline's rule list against a Drive file. Pure functions, no IO.

### 6.1 Condition tree storage

The rule's condition tree is stored as JSON on `Rule.conditionTree`. Shape:

```ts
type ConditionNode =
  | { kind: "group"; operator: "AND" | "OR"; children: ConditionNode[] }
  | {
      kind: "leaf";
      field: "filename" | "extension" | "mime_type" | "day_of_week" | "time_of_day";
      operator: string;   // contains, starts_with, equals, matches_regex, between, ...
      value: string | string[] | { start: string; end: string };
      caseSensitive?: boolean;
    };
```

Storing the tree as JSON means the UI builder, the engine, and the dashboard trace all read from the same source of truth without an intermediate schema.

### 6.2 Evaluation

For each pipeline that watches the file's source folder:

1. Walk the ordered rule list (`priority` ascending).
2. For each rule, recursively evaluate its tree. Leaves dispatch on `field` then `operator`; groups short-circuit (`AND` bails on first false, `OR` on first true).
3. **First match wins** — the engine returns the matched rule with its target playlist, rendered title, rendered description, and the per-rule trace.
4. The trace records, for every rule attempted (matched or not), each condition's input and result. This is what the dashboard renders in the queue item detail view to answer "why didn't my rule fire?".

Regex inputs and patterns are bounded (`MAX_REGEX_INPUT=1024`, `MAX_PATTERN=256`) to defend against catastrophic-backtracking patterns submitted by an attacker with a stolen session.

Templates use `??` substitution (not `||`) so explicit empty strings render as empty rather than disappearing.

---

## 7. Upload pipeline

[`lib/upload/youtube-upload.ts`](../lib/upload/youtube-upload.ts) is the entry point. Triggered by:
- The upload worker (`/api/cron/process-uploads`) for auto-mode `DETECTED` items.
- The dashboard for approve / retry actions on `NEEDS_APPROVAL` / `FAILED` items.

The caller passes an explicit `trigger: "auto" | "approve" | "retry"`. The function asserts the queue item's current status matches the trigger's allowed set, so a stray "approve" can't accidentally re-fire on a `DETECTED` item or a stale UI state.

### 7.1 Streaming pipeline

```
Drive download (GET ?alt=media)
   ResponseBody (ReadableStream<Uint8Array>)
        │
        ▼
Read into 8 MiB buffer
        │
        ▼ inspect first 16 bytes → magic-byte non-video check (PDF / JPEG / etc.)
        │   (full ISO box completeness check skipped — that needs the full file)
        ▼
For each 8 MiB chunk:
   PUT to YouTube resumable upload URL with Content-Range: bytes <start>-<end>/<total>
        ▼ retried on 408 / 429 / 5xx (Content-Range is idempotent)
        ▼ 308 Resume Incomplete → resume from server's Range header offset
        ▼ 200 / 201 → final body has videoId
        │
        ▼
videos.list?id=<videoId>&part=id  (confirm upload landed)
playlistItems.insert (POST — NOT retried; duplicate retries would create duplicate entries)
```

Pre-flight: reject upfront if `QueueItem.sizeBytes` exceeds YouTube's 256 GiB limit; a second check on the live Drive `Content-Length` catches files that grew between detection and upload.

### 7.2 Partial-failure recovery

- **Upload succeeded, playlist-add failed** → item is marked `FAILED` with `youtubeUrl` and `youtubeVideoId` preserved. The next retry skips the upload entirely (verifies the existing video still exists) and re-attempts only the playlist add.
- **Upload session abandoned mid-stream** → no terminal status reaches Google; the reaper (see §7.4) flips stuck `UPLOADING` rows to `FAILED` after 90 minutes with a clear reason.
- **Operator can mark externally handled** at any time, including after auto-retry exhausts. Restoring clears the YouTube link fields so the row can't be confused with a real upload.

### 7.3 Failure classification

Errors are mapped to `FailureReason` enum values: `QUOTA_EXCEEDED`, `RATE_LIMITED`, `AUTH_REVOKED`, `PLAYLIST_DELETED`, `FILE_NOT_FOUND`, `FILE_TOO_LARGE`, `NOT_VIDEO`, `NETWORK_TIMEOUT`, `VALIDATION_ERROR`, `UNKNOWN`. The dashboard renders distinct copy per reason so an operator knows whether waiting (quota) or reconnecting (auth) is the fix.

### 7.4 Stale-upload reaper

`reapStaleUploads` is called from `/api/cron/detect` (every 5 minutes). It finds `UPLOADING` items whose `lastActionAt` is more than 90 minutes ago, flips them to `FAILED` with `failureReason=NETWORK_TIMEOUT`, and logs the reap event.

---

## 8. Token storage

`lib/security/token-vault.ts`.

- **Cipher**: AES-256-GCM. IV is 12 random bytes per ciphertext; 16-byte auth tag.
- **AAD**: callers pass `oauthTokenAad(connectionId)` (returns `"oauth:<id>"`). The auth tag is computed over (ciphertext + AAD), so a ciphertext copy-pasted into another row fails to decrypt instead of silently succeeding (NIST SP 800-38D §5.2).
- **Versioned format**: new ciphertexts are prefixed with `v2.`. Legacy ciphertexts without the prefix decrypt without AAD; once they refresh, they re-encrypt as v2 transparently.
- **Key**: `TOKEN_ENCRYPTION_KEY` (base64, must decode to exactly 32 bytes). Validated at process startup via `assertTokenKey`.

API key storage uses HMAC-SHA256 with an env-scoped `API_KEY_PEPPER` (prefix `h1:`); lookup tries both the HMAC form and the legacy SHA-256 form so keys minted before the pepper was provisioned keep working.

---

## 9. Read-only REST API

`/api/queue`, `/api/queue/[id]`, `/api/pipelines`. Documented in [README.md](../README.md#read-only-api-keys).

- **Auth**: per-user API key as `Authorization: Bearer rrp_live_...`. The key is generated at `/settings`, shown once, stored hashed.
- **Method gate**: API keys authorize **only** safe HTTP methods (`GET` / `HEAD` / `OPTIONS`). Mutating routes silently ignore API key headers and require a session, so a stolen key can't write.
- **Scope**: API-key reads are self-scoped (`userId` filter); session reads are workspace-wide per the spec clarification.

---

## 10. Scaling — what changes at 10× and 1000×

### 10.1 What works today

- **Detection**: ~50 pipelines per 5-minute cron tick. Sufficient for a single Vercel hobby project doing demo-scale load.
- **Uploads**: 1-minute worker tick, 5 items per tick by default, with per-item soft time budget. Each upload streams without buffering, so we don't hit memory caps even on 50 GB files.
- **Idempotency / cold-start**: O(1) via the unique constraint + watermark. Scales with row count, not active workload.

### 10.2 Hard limits we'd hit at scale

| Limit | Constraint | Mitigation |
|---|---|---|
| 50 pipelines / 5min cron tick | Vercel cron + serverless function timeout | Shard detection across N worker functions; trigger via a job queue (Inngest, Vercel Queues, or a `DetectionJob` table) |
| 5 uploads / minute worker tick | Same | Parallel workers, each claiming items independently — the atomic `updateMany` claim already supports this |
| 10,000 YouTube quota units / day / project | YouTube hard limit (~6 uploads/day fresh project) | Quota-aware scheduling, multi-project sharding (one OAuth client per N channels), formal quota increase request |
| Drive `files.watch` channels per app | Per-app channel ceiling | Switch to `changes.watch` at the user level — one channel per Drive connection instead of per pipeline, dispatch by file parent at the receiver |
| Drive list quota | "drive.readonly" listing rate | Already use `newerThan` to bound results; rate-limit per-connection retries |

### 10.3 Quota strategy

- **Detection cost**: `files.list` is 1 unit; we list once per detection (Wave 4 fixed the prior double-list bug).
- **Duplicate verification**: `videos.list` is 1 unit per duplicate detection — bounded, only fires when a `(pipeline, file)` reappears.
- **Upload cost**: `videos.insert` is 1,600 units regardless of file size. The dashboard surfaces `quota_exceeded` distinctly so the operator knows waiting for midnight Pacific resets the budget.
- **Future**: bucket pipelines by destination channel and per-bucket quota tracking; defer uploads via the worker when a bucket nears exhaustion.

---

## 11. Tradeoffs taken

| Decision | What we did | What we didn't |
|---|---|---|
| Drive scope | `drive.readonly` (per assigner clarification) | `drive.file` — Picker-only access made watched-folder detection miss existing user-uploaded recordings |
| Workspace visibility | Reads are workspace-wide for sessions; mutations stay owner-scoped; API keys stay self-scoped | Per-user privacy on reads (the SPEC §4.1 literal reading) — overridden by the spec clarification mid-build |
| Streaming validator | Header-only magic-byte check on first 16 bytes | Full ISO MP4 box completeness check requires buffering the entire file — incompatible with streaming. Tradeoff: broken MP4s now fail at YouTube instead of pre-flight |
| Detection trigger | All three paths implemented (push preferred, polling backstop, signed webhook) | Picking only one and shipping faster |
| Worker design | DB-backed atomic claim via `updateMany(status filter)` | Inngest / Vercel Queues / SQS — keeps zero infra commitments at the cost of polling semantics |
| Drive push subscription | `files.watch` per pipeline | `changes.watch` per Drive connection — more efficient at high pipeline counts but adds dispatch complexity |
| Token storage versioning | v1 (no AAD) reads continue working; v2 writes bind AAD | Forced migration of all stored tokens at once |

---

## 12. What I would change with more time

1. **Detection fan-out worker** mirroring the upload-worker pattern. Today `/api/cron/detect` processes pipelines sequentially within a single function invocation — at 1000 pipelines that doesn't fit.
2. **`changes.watch` instead of `files.watch`**. One subscription per Drive connection, with dispatch by file parent at the receiver. Reduces channel count from `pipelines` to `drive_connections` and gracefully handles the same folder being watched by multiple pipelines.
3. **Per-channel quota tracking**. Today we react to `quotaExceeded` errors after the fact. With a `quota_used_today` counter per `OAuthConnection` (resetting at midnight Pacific) the upload worker could pause non-urgent uploads before exhaustion.
4. **Rule tester→pipeline preview**. The existing rule tester evaluates a single rule. A "if I drop this filename now, what happens?" mode that runs the full pipeline (including watermark, idempotency, and connection-status checks) would catch more authoring errors before files exist.
5. **Background workers as long-lived processes**. Vercel cron is convenient but adds per-tick cold start. A long-lived worker (Cloud Run, Fly, Railway) eliminates cold start and lets us hold connections open.
6. **Telemetry**. Per-pipeline detection latency, upload success rate, quota burn — all currently inferable from the activity log but not surfaced as metrics. Wiring this to Datadog/Honeycomb is the next reliability investment.
7. **Demo data partitioning**. The seed script currently lives in the same tables as real data, distinguished by a flag. A separate `seedRun` table + `is_seed` column on every row would let reviewers see synthetic data without polluting their own.
8. **Mobile QA pass**. The CSS has breakpoints at 480/700/980 — they need a real-device walkthrough we haven't done.

---

## 13. Index of code

| Topic | File(s) |
|---|---|
| Auth | [`auth.ts`](../auth.ts), [`lib/auth/account.ts`](../lib/auth/account.ts) |
| OAuth connections | [`lib/oauth/google-connections.ts`](../lib/oauth/google-connections.ts), [`lib/oauth/google-errors.ts`](../lib/oauth/google-errors.ts) |
| Token vault | [`lib/security/token-vault.ts`](../lib/security/token-vault.ts) |
| API keys | [`lib/security/api-keys.ts`](../lib/security/api-keys.ts) |
| Request guards | [`lib/security/request-guard.ts`](../lib/security/request-guard.ts), [`lib/security/webhook-signature.ts`](../lib/security/webhook-signature.ts), [`lib/security/cron-auth.ts`](../lib/security/cron-auth.ts) |
| Rule engine | [`lib/rules/rule-engine.ts`](../lib/rules/rule-engine.ts) |
| Detection | [`lib/detection/drive-detection.ts`](../lib/detection/drive-detection.ts), [`lib/detection/youtube-supported-formats.ts`](../lib/detection/youtube-supported-formats.ts) |
| Drive push | [`lib/drive/watch.ts`](../lib/drive/watch.ts), [`lib/drive/renewal.ts`](../lib/drive/renewal.ts), [`app/api/webhooks/drive/route.ts`](../app/api/webhooks/drive/route.ts) |
| Upload | [`lib/upload/youtube-upload.ts`](../lib/upload/youtube-upload.ts), [`lib/upload/video-file-validation.ts`](../lib/upload/video-file-validation.ts) |
| YouTube playlist helpers | [`lib/oauth/youtube-playlists.ts`](../lib/oauth/youtube-playlists.ts) |
| Cron entry points | [`app/api/cron/detect/route.ts`](../app/api/cron/detect/route.ts), [`app/api/cron/process-uploads/route.ts`](../app/api/cron/process-uploads/route.ts) |
| Webhook entry points | [`app/api/webhooks/detection/route.ts`](../app/api/webhooks/detection/route.ts), [`app/api/webhooks/drive/route.ts`](../app/api/webhooks/drive/route.ts) |
| REST API | [`app/api/queue/route.ts`](../app/api/queue/route.ts), [`app/api/queue/[id]/route.ts`](../app/api/queue/[id]/route.ts), [`app/api/pipelines/route.ts`](../app/api/pipelines/route.ts) |
| Queue actions | [`app/api/queue/[id]/actions/route.ts`](../app/api/queue/[id]/actions/route.ts) |
| Dashboard UI | [`components/dashboard/QueueDashboard.tsx`](../components/dashboard/QueueDashboard.tsx) |
| Schema + migrations | [`prisma/schema.prisma`](../prisma/schema.prisma), [`prisma/migrations/`](../prisma/migrations/) |
