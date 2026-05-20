# RelayRoom

RelayRoom is an authenticated operations platform for routing Google Drive recordings into YouTube playlists with visual rules, queue visibility, and recovery flows.

This repository is built from `SPEC.md`. Implemented surfaces: Next.js App Router shell, Prisma + Postgres data layer, Auth.js Google sign-in, separate Drive + YouTube OAuth connections, AAD-bound AES-256-GCM token storage, all three detection paths (Drive push notifications + polling + signed webhook), streaming chunked YouTube uploads, full operations queue with rule-evaluation trace + recovery flows, read-only REST API, and a demo mode that simulates queue actions client-side so reviewers can exercise the lifecycle without OAuth.

## Architecture

- **Web app:** Next.js App Router with TypeScript.
- **Database:** PostgreSQL through Prisma.
- **Auth:** Google sign-in for platform sessions, plus separate OAuth grants for Drive and YouTube connections.
- **Detection path:** Drive push notifications (`files.watch`) are the preferred low-latency path, with polling as the always-on backstop and a signed webhook receiver for external automation. All three reuse the same dedup/cold-start/rule-evaluation pipeline.
- **Workers:** Detection runs on Vercel Cron; uploads run on an independent worker cron that drains `DETECTED` queue items with atomic per-item claims. A stale-`UPLOADING` reaper recovers items orphaned by a worker crash.
- **Rule engine:** Pure TypeScript module under `lib/rules`. It evaluates ordered rules, supports nested AND/OR groups, and returns a full trace for dashboard debugging.

## Current Build Slice

Implemented now:

- **Dashboard:** queue across all 8 statuses with status-card filter buttons, labeled queue filters (pipeline / sort / matched rule / detected date range), owner filter for workspace visibility, and a detail panel showing the full **per-condition rule-evaluation trace** + upload attempt history + activity log.
- **Pipelines:** create, edit, enable/disable, archive, hard-delete (after archive), unarchive, duplicate, manual detection, Drive folder probe.
- **Rule builder:** visual nested AND/OR groups, drag-to-reorder conditions, all spec operators (`contains` / `starts_with` / `ends_with` / `equals` / `matches_wildcard` / `matches_regex` for filename; `equals` / `is_one_of` for extension + MIME; `is` / `is_not` / `is_one_of` for day-of-week; `between` / `before` / `after` for time-of-day), case-sensitivity toggle, regex input length-capped to bound CPU.
- **Rule tester (bonus):** paste a sample filename + tweak day/time, see which rule fires and which playlist routes.
- **Inline playlist creation** from both the pipeline form and the queue's manual-route action — RelayRoom calls YouTube `playlists.insert` directly so reviewers don't need to switch tabs.
- **Privacy toggle** with a two-step modal: switching Unlisted → Public requires typing the pipeline name in a confirmation dialog that names the destination channel.
- **Connections:** separate Drive + YouTube grants with multi-account support; the connect buttons relabel to "Connect another" once at least one of that kind exists. YouTube grants are keyed by channel id so multiple channels under one Google account don't overwrite each other.
- **Demo mode** simulates queue actions (approve / route / retry / skip / mark handled / restore) client-side so reviewers without OAuth still see the lifecycle. Seeded data covers every status.
- **Read-only REST API:** per-user keys (HMAC-peppered when `API_KEY_PEPPER` is set, plain SHA-256 fallback), method-gated to `GET`/`HEAD`/`OPTIONS` so a stolen key can't write.
- **Detection:** Drive push notifications via `files.watch` + polling cron + signed HMAC webhook receiver, all sharing one downstream pipeline.
- **Upload pipeline:** streaming Drive → YouTube in 8 MiB chunks with `Content-Range`, 308 Resume Incomplete handling, classified failure reasons, pre-flight file-too-large check, stale-`UPLOADING` reaper.
- **Workspace-wide visibility** (per spec clarification): every signed-in user can see other users' pipelines, connections, and queue items; mutations are still owner-scoped.
- **Error surfaces:** OAuth callback errors redirect to a labelled error code instead of hanging; data-layer failures throw to the app's error boundary instead of returning fake empty state.
- **Honest token handling:** encryption-at-rest with AAD bound to the connection id, refresh tokens wiped on disconnect, token revoke on post-exchange config failures, NextAuth cookie/session options explicitly pinned.
- **Mobile pass:** sidebar collapses to a hamburger drawer (slides in from the right), metric cards become a 2×2 grid, rule tester + trace rows stack at 375 px.
- **Demo endpoints:** `GET /api/health`, plus all read endpoints work in demo mode at `?demo=true`.
- **Unit tests** (41): rule engine, regex validation, token vault, queue transitions, workspace users, queue ordering, read-only API scoping, request guard, webhook signature, Drive folder verification, cron scheduler, YouTube supported formats, video file validation.

## Local Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables and fill in any local secrets you want to exercise:

   ```bash
   cp .env.example .env
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000`.

## Database Setup

The target database is PostgreSQL.

```bash
npm run prisma:generate
npm run prisma:migrate
```

Seed demo rows after the migration has run:

```bash
npm run seed
```

If `DATABASE_URL` is omitted, the dashboard, connection list, pipeline list, and demo APIs fall back to the in-memory fixtures in `lib/data/seed.ts`.

## OAuth Setup

Google Cloud Console will need three OAuth clients:

- **Sign-in client:** basic profile and email scopes.
- **Drive connection client:** `drive.readonly`, paired with Google Picker for folder selection.
- **YouTube connection client:** `youtube.upload` and `youtube`.

The assignment reviewers approved `drive.readonly` for RelayRoom. During testing, `drive.file` only exposed files that RelayRoom created or that were explicitly opened through Picker, which made watched-folder detection miss existing user-uploaded recordings. `drive.readonly` lets RelayRoom list the chosen folder reliably while still keeping Drive access read-only; uploads remain handled through the separate YouTube grant.

For local development, register these redirect URIs:

- `http://localhost:3000/api/auth/callback/google`
- `http://127.0.0.1:3000/api/auth/callback/google`
- `http://localhost:3000/api/oauth/drive/callback`
- `http://127.0.0.1:3000/api/oauth/drive/callback`
- `http://localhost:3000/api/oauth/youtube/callback`
- `http://127.0.0.1:3000/api/oauth/youtube/callback`

**For deployed environments, add the production equivalents to both your OAuth clients in Google Cloud Console AND set them as `GOOGLE_DRIVE_REDIRECT_URI` / `GOOGLE_YOUTUBE_REDIRECT_URI` env vars.** Without both halves, OAuth callbacks land on localhost (because the redirect-uri fallback in code is localhost) and the consent flow appears to hang.

While you're in Google Cloud Console, also confirm the **YouTube Data API v3** is enabled under APIs & Services → Enabled APIs. Without it, playlist listing returns 403.

If the app is in "Testing" publishing status (the default), every Google account you want to sign in with — including for Drive + YouTube OAuth — needs to be on the **Test users** list under the OAuth consent screen / Audience tab. Restricted scopes like `drive.readonly` also need this.

Google sign-in is wired through Auth.js. Set `GOOGLE_SIGNIN_CLIENT_ID`, `GOOGLE_SIGNIN_CLIENT_SECRET`, `NEXTAUTH_URL`, and `AUTH_SECRET`/`NEXTAUTH_SECRET` before testing the real Google login button. Sign-in is restricted to `INITIAL_ADMIN_EMAIL` plus any comma-separated emails in `AUTH_ALLOWED_EMAILS`. `INITIAL_ADMIN_EMAIL` is promoted to the `OWNER` role the first time that account signs in. An empty allowlist **fails closed in production** — set `AUTH_ALLOW_ANY=true` (dev only, never in production) if you want to let any Google account sign in during local development.

Drive and YouTube connections are separate OAuth grants. Set these before testing the Connections page buttons:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI` — must point at your deployed callback, e.g. `https://<your-app>.vercel.app/api/oauth/drive/callback`
- `GOOGLE_YOUTUBE_CLIENT_ID`
- `GOOGLE_YOUTUBE_CLIENT_SECRET`
- `GOOGLE_YOUTUBE_REDIRECT_URI` — same pattern, `…/api/oauth/youtube/callback`
- `TOKEN_ENCRYPTION_KEY` — 32 bytes, base64-encoded
- `GOOGLE_PICKER_API_KEY`
- `GOOGLE_PICKER_APP_ID` — required, no fallback
- `DETECTION_WEBHOOK_SECRET` — for the signed-webhook trigger path (must NOT share value with `CRON_SECRET`)
- `CRON_SECRET` — Vercel sends this as a bearer token on cron invocations
- `API_KEY_PEPPER` — optional; enables HMAC-hashed API keys, legacy SHA-256 keys keep working
- `DRIVE_WATCH_WEBHOOK_URL` — optional; defaults to `${request origin}/api/webhooks/drive`. Override when the deployment URL Vercel reports doesn't match the one Google should call.

The callbacks encrypt Google access and refresh tokens before saving them to `OAuthConnection`. Disconnect wipes both the access token and refresh token from the row.

## Detection Design

RelayRoom supports all three detection paths from the spec; they share the same downstream rule-evaluation and idempotency code.

Path B (preferred): Drive push notifications.

- On pipeline enable, RelayRoom subscribes to `files.watch` on the source folder, storing the channel id, resource id, secret token, and expiry on the pipeline row.
- `POST /api/webhooks/drive` verifies `X-Goog-Channel-Token` with a constant-time compare, ignores Drive's initial `sync` handshake, and refuses unknown channel ids with 404 so Google stops retrying.
- The receiver doesn't run detection inline — it just nulls `lastDetectionAt` for the matching pipeline, which the next cron tick treats as "due now." This keeps the webhook response fast (Google retries on slow acks) and lets the upload worker drain at its own rate.
- A renewal pass inside `/api/cron/detect` re-subscribes any pipeline whose channel is within 24 hours of expiry (or missing entirely), capped to 10 channels per tick so a Drive outage can't stretch the cron.
- Pipeline disable / archive stops the channel via `/channels/stop`.

Path B: polling.

- Each enabled pipeline has a `processedFromTime` watermark.
- When a pipeline is enabled, existing files are not processed.
- Polling lists files in the selected folder newer than the watermark.
- Every detected Drive file fans out per pipeline.
- Idempotency is enforced with a unique `(pipeline_id, drive_file_id)` mapping.
- Duplicate detections no-op through the unique queue mapping.
- Vercel Cron invokes `GET /api/cron/detect` every five minutes. The endpoint only runs pipelines whose `pollingIntervalMinutes` cadence is due.
- `GET /api/cron/process-uploads` runs every minute and drains `DETECTED` queue items into YouTube. It atomically claims items with a `status` filter on `updateMany` so two workers can't race the same item, and the stale-`UPLOADING` reaper cleans up after worker crashes.

Path A: signed webhook receiver.

- External automation tools can call `POST /api/webhooks/detection`.
- Requests must include `x-relayroom-timestamp` and `x-relayroom-signature`.
- The signature is `sha256=` plus `HMAC_SHA256(DETECTION_WEBHOOK_SECRET, timestamp + "." + raw_json_body)`.
- Payloads can identify either one pipeline or every enabled pipeline watching a Drive folder:

  ```json
  { "sourceFolderId": "DRIVE_FOLDER_ID", "driveFileId": "OPTIONAL_FILE_ID", "eventId": "OPTIONAL_EVENT_ID" }
  ```

  ```json
  { "pipelineId": "PIPELINE_ID", "eventId": "OPTIONAL_EVENT_ID" }
  ```

- If no enabled pipeline watches the folder, the endpoint returns `202` with an ignored result instead of creating queue work.
- Webhook-triggered detection reuses the same watermark, queue idempotency, and YouTube duplicate verification as polling.

For production, set `CRON_SECRET` in Vercel — Vercel automatically sends it as a bearer token when invoking cron jobs. `DETECTION_WEBHOOK_SECRET` is a **separate** value used only by the signed-webhook trigger path; they intentionally don't fall back to each other so a compromise of one doesn't break both trust domains.

See `docs/DEPLOYMENT.md` for the production deployment checklist covering Vercel environment variables, Google OAuth, Neon, cron, and smoke testing.

For a full system overview — data model, multi-account OAuth, rule engine, trigger paths, upload pipeline, token storage, scaling story, tradeoffs — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Demo Mode

Append `?demo=true` to any app URL (or click **Demo login** on the landing page) to see RelayRoom against the seeded demo workspace without signing in. What works:

- Browsing the dashboard, queue, pipelines, connections, and settings against rich seeded data covering every queue status.
- **Queue actions (approve, route, retry, skip, mark handled, restore)** simulate client-side — the queue item transitions visibly through the spec-correct states with a toast labelled "Demo mode — sign in to run this against your own Drive + YouTube." Changes don't persist; refresh resets to seeded data.
- Read-only API endpoints accept the `?demo=true` query string.

What doesn't work in demo mode: pipeline/rule CRUD and OAuth-bound actions (real uploads, Drive folder picker). Sign in with an allowlisted Google account to exercise those flows live.

## Read-Only API Keys

Allowed users can generate or rotate a read-only API key from Settings. RelayRoom only shows the raw key once; it stores a salted HMAC-SHA256 (`h1:…`) when `API_KEY_PEPPER` is set, falling back to plain SHA-256 in environments without it. Lookups try both forms so existing keys keep working after a pepper is provisioned. API key authentication is restricted to `GET`/`HEAD`/`OPTIONS` requests — mutating endpoints require a browser session. The keys are scoped to the key owner's own queue and pipeline data, even though the signed-in web UI can show workspace-wide views with filters. Use the key as a bearer token:

```bash
curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/queue
curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/pipelines
```

Supported read-only endpoints:

- `GET /api/queue`
- `GET /api/queue?status=failed`
- `GET /api/queue?detectedFrom=2026-05-01&detectedTo=2026-05-18`
- `GET /api/queue/:id`
- `GET /api/pipelines`

## Upload Pipeline

- Drive → YouTube is fully streamed: the Drive download body becomes a `ReadableStream`, and RelayRoom uploads 8 MiB chunks with `Content-Range` headers to YouTube's resumable session. No part of the file is buffered in memory beyond a single chunk, so the only ceiling is YouTube's hard 256 GiB / 12-hour limit.
- A pre-flight check against the stored `sizeBytes` snapshot rejects oversize files before any session is opened; a second check against the live Drive `Content-Length` catches files that grew between detection and upload.
- The resumable session `POST` is one-shot (no retries — duplicate retries would leak sessions). Chunk `PUT`s are idempotent under `Content-Range` and are retried on transient 408 / 429 / 5xx with exponential backoff. The 308 "Resume Incomplete" response resumes from the server-acknowledged byte offset.
- Permanent failures are classified (`quota_exceeded`, `auth_revoked`, `playlist_deleted`, `file_too_large`, `file_not_found`, `not_video`, `network_timeout`, `validation_error`, `rate_limited`, `unknown`) so the dashboard distinguishes "wait for quota" from "the operator needs to reconnect."

## YouTube Quota Note

The YouTube Data API default daily quota is 10,000 units. A video upload costs 1,600 units, so a fresh project can usually upload about six videos per day. The app will classify quota errors distinctly as `quota_exceeded` and surface them in the dashboard.

## Rule Engine

The rule engine supports:

- First-match-wins evaluation.
- Nested AND/OR groups.
- Filename operators: contains, starts with, ends with, equals, wildcard, regex.
- Case-insensitive filename matching by default.
- File type, day-of-week, and time-of-day conditions.
- Template rendering for title and description variables.
- Full evaluation traces for queue item detail views.

Run tests:

```bash
npm test
```

## Token Storage

Refresh tokens are stored encrypted at rest. The current helper in `lib/security/token-vault.ts` uses AES-256-GCM with an Associated Authenticated Data (AAD) string bound to the connection id, so a ciphertext copied into a different row fails to decrypt instead of silently succeeding. Older v1 ciphertexts (no AAD) still decrypt unchanged and re-encrypt as v2 on the next refresh. `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes.

Generate a local key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Next Implementation Steps

1. **Detection fan-out worker** mirroring the upload-worker pattern. Today `/api/cron/detect` processes pipelines sequentially within a single function invocation — at thousands of pipelines that doesn't fit (SPEC §7).
2. **`changes.watch` instead of `files.watch`**. One subscription per Drive connection with dispatch by file parent at the receiver — reduces channel count from `pipelines` to `drive_connections`.
3. **Per-channel YouTube quota tracking** so the upload worker can pause non-urgent uploads before exhaustion instead of reacting to `quotaExceeded` errors after the fact.
4. **Production telemetry / alerting** — per-pipeline detection latency, upload success rate, quota burn. Inferable from the activity log today; should be metrics.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §12 for the full "what I would change with more time" list.

## Smoke Checks

Run a lightweight public/demo smoke pass before deployment:

```bash
npm run smoke:local
```

To check production after Vercel deploys:

```bash
SMOKE_BASE_URL=https://relay-room-one.vercel.app npm run smoke:local
```

The smoke script checks the landing page, demo app pages, public legal pages, and demo read-only APIs.
