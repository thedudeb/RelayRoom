# RelayRoom

RelayRoom is an authenticated operations platform for routing Google Drive recordings into YouTube playlists with visual rules, queue visibility, and recovery flows.

This repository is being built from `SPEC.md`. The current implementation includes the Next.js app shell, typed domain model, Prisma schema, Auth.js Google sign-in, Drive and YouTube OAuth connections, encrypted token storage, polling detection, YouTube uploads, workspace-wide operations views, and a read-only demo mode.

## Architecture

- **Web app:** Next.js App Router with TypeScript.
- **Database:** PostgreSQL through Prisma.
- **Auth:** Google sign-in for platform sessions, plus separate OAuth grants for Drive and YouTube connections.
- **Detection path:** Drive push notifications (`files.watch`) are the preferred low-latency path, with polling as the always-on backstop and a signed webhook receiver for external automation. All three reuse the same dedup/cold-start/rule-evaluation pipeline.
- **Workers:** Detection runs on Vercel Cron; uploads run on an independent worker cron that drains `DETECTED` queue items with atomic per-item claims. A stale-`UPLOADING` reaper recovers items orphaned by a worker crash.
- **Rule engine:** Pure TypeScript module under `lib/rules`. It evaluates ordered rules, supports nested AND/OR groups, and returns a full trace for dashboard debugging.

## Current Build Slice

Implemented now:

- Dashboard UI with real and seeded queue items across `uploaded`, `failed`, `needs_approval`, `needs_routing`, `skipped`, and `externally_handled`.
- Queue filters for owner, status, pipeline, matched rule, detected date range, and sort order.
- Connections surface showing separate Drive and YouTube grants.
- Pipeline creation, editing, archiving, restore, enable/disable, manual detection, and Drive folder probes.
- Routing rule creation and editing for first-match playlist assignment.
- Rule tester and logic preview for validating routing conditions before running detection.
- YouTube upload approval, retry, manual routing, skip, restore, and externally-handled flows.
- Workspace-wide visibility for allowed users, with user filters on queue, pipelines, and connections.
- Public YouTube privacy requires an explicit pipeline-name confirmation before saving.
- Read-only demo endpoints and demo UI:
  - `GET /api/health`
  - `GET /api/queue`
  - `GET /api/queue?status=failed`
  - `GET /api/queue/:id`
  - `GET /api/pipelines`
- Prisma schema for users, API keys, OAuth connections, pipelines, rules, queue items, upload attempts, and activity logs.
- Auth.js Google sign-in route at `GET/POST /api/auth/[...nextauth]`, backed by the Prisma adapter.
- Database seed script for the RelayRoom demo user, connections, pipelines, rules, queue rows, and activity log entries.
- AES-256-GCM token vault helper for encrypting OAuth refresh tokens at rest.
- Queue state transition helper for allowed operator/system actions.
- Unit tests for first-match-wins routing, regex validation, token encryption, queue transitions, workspace user filters, queue ordering, and read-only API scoping.

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

For deployed environments, add the same paths under the production domain.

Google sign-in is wired through Auth.js. Set `GOOGLE_SIGNIN_CLIENT_ID`, `GOOGLE_SIGNIN_CLIENT_SECRET`, `NEXTAUTH_URL`, and `AUTH_SECRET`/`NEXTAUTH_SECRET` before testing the real Google login button. Sign-in is restricted to `INITIAL_ADMIN_EMAIL` plus any comma-separated emails in `AUTH_ALLOWED_EMAILS`. `INITIAL_ADMIN_EMAIL` is promoted to the `OWNER` role the first time that account signs in.

Drive and YouTube connections are separate OAuth grants. Set these before testing the Connections page buttons:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI`
- `GOOGLE_YOUTUBE_CLIENT_ID`
- `GOOGLE_YOUTUBE_CLIENT_SECRET`
- `GOOGLE_YOUTUBE_REDIRECT_URI`
- `TOKEN_ENCRYPTION_KEY`
- `GOOGLE_PICKER_API_KEY`
- `GOOGLE_PICKER_APP_ID` (required — no client-id-prefix fallback)
- `API_KEY_PEPPER` (optional; enables HMAC-hashed API keys)
- `DRIVE_WATCH_WEBHOOK_URL` (optional; defaults to `${request origin}/api/webhooks/drive`. Set when the deployment URL Vercel reports doesn't match the one Google should call.)

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

For production, set `CRON_SECRET` in Vercel. Vercel automatically sends it as a bearer token when invoking cron jobs. For local/manual calls, `DETECTION_WEBHOOK_SECRET` can use the same value.

See `docs/DEPLOYMENT.md` for the production deployment checklist covering Vercel environment variables, Google OAuth, Neon, cron, and smoke testing.

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

1. Detection fan-out to background workers at scale (currently capped at ~50 pipelines per cron tick; SPEC §7).
2. Architecture-overview deliverable (SPEC §7) — flesh out data model diagram, scale story, and tradeoff log into `docs/ARCHITECTURE.md`.
3. Browser-driven QA across the rule builder, queue actions, and mobile widths (375 / 480 / 700 / 980 breakpoints already in CSS — walk each surface in a real browser).
4. Production telemetry / alerting wiring.

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
