# RelayRoom

RelayRoom is an authenticated operations platform for routing Google Drive recordings into YouTube playlists with visual rules, queue visibility, and recovery flows.

This repository is being built from `SPEC.md`. The current implementation slice includes the Next.js app shell, typed domain model, Prisma schema, Auth.js Google sign-in routes, a pure rule engine, Prisma-backed demo queries with in-memory fallback, and read-only demo API routes.

## Architecture

- **Web app:** Next.js App Router with TypeScript.
- **Database:** PostgreSQL through Prisma.
- **Auth:** Google sign-in for platform sessions, plus separate OAuth grants for Drive and YouTube connections.
- **Detection path:** Custom polling is the initial implementation target. It is easier to reproduce in Codespaces and satisfies the spec's one-hour latency target.
- **Workers:** Upload and polling workers will run outside request/response paths. The queue state model is already represented in Prisma.
- **Rule engine:** Pure TypeScript module under `lib/rules`. It evaluates ordered rules, supports nested AND/OR groups, and returns a full trace for dashboard debugging.

## Current Build Slice

Implemented now:

- Dashboard UI with seeded queue items across `uploaded`, `failed`, `needs_approval`, `needs_routing`, `skipped`, and `externally_handled`.
- Connections surface showing separate Drive and YouTube grants.
- Pipeline list with cold-start watermark, mode, privacy, and waiting counts.
- Rule preview for nested condition trees.
- Read-only demo endpoints:
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
- Unit tests for first-match-wins routing, regex validation, token encryption, and queue transitions.

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

The callbacks encrypt Google access and refresh tokens before saving them to `OAuthConnection`.

## Detection Design

Initial path: polling.

- Each enabled pipeline has a `processedFromTime` watermark.
- When a pipeline is enabled, existing files are not processed.
- Polling lists files in the selected folder newer than the watermark.
- Every detected Drive file fans out per pipeline.
- Idempotency is enforced with a unique `(pipeline_id, drive_file_id)` mapping.
- Duplicate detections no-op through the unique queue mapping.
- Vercel Cron invokes `GET /api/cron/detect` every five minutes. The endpoint only runs pipelines whose `pollingIntervalMinutes` cadence is due.

Drive push notifications can be added later once the core queue and upload state machine are stable.

For production, set `CRON_SECRET` in Vercel. Vercel automatically sends it as a bearer token when invoking cron jobs. For local/manual calls, `DETECTION_WEBHOOK_SECRET` can use the same value.

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

Refresh tokens are stored encrypted at rest. The current helper in `lib/security/token-vault.ts` uses AES-256-GCM and requires `TOKEN_ENCRYPTION_KEY` to decode to exactly 32 bytes.

Generate a local key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Next Implementation Steps

1. Implement Drive and YouTube connection callback routes with encrypted refresh-token storage.
2. Add editable rule builder controls and the rule tester.
3. Implement polling worker and queue item creation.
4. Implement upload worker with YouTube resumable uploads and playlist-add recovery.
5. Add user-scoped dashboard queries for real signed-in accounts.
6. Add end-to-end tests for login, demo navigation, routing, and queue actions.
