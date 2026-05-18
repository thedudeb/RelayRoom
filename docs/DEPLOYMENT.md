# RelayRoom Deployment Runbook

Use this checklist when moving RelayRoom from local testing to Vercel production.

## 1. Database

- Create a Neon Postgres project.
- Use the pooled Postgres connection string for `DATABASE_URL`.
- Run migrations before relying on production traffic:

  ```bash
  npm run prisma:deploy
  ```

- Keep `TOKEN_ENCRYPTION_KEY` stable forever for that environment. Changing it makes existing encrypted OAuth tokens unreadable.

## 2. App Secrets

Set these in Vercel project settings for Production, Preview, and Development as needed:

```bash
NEXTAUTH_URL=https://relay-room-one.vercel.app
AUTH_SECRET=...
NEXTAUTH_SECRET=...
INITIAL_ADMIN_EMAIL=owner@example.com
AUTH_ALLOWED_EMAILS=operator1@example.com,operator2@example.com
DATABASE_URL=postgresql://...
TOKEN_ENCRYPTION_KEY=...
CRON_SECRET=...
DETECTION_WEBHOOK_SECRET=...
```

`AUTH_SECRET` and `NEXTAUTH_SECRET` can use the same long random value. `CRON_SECRET` and `DETECTION_WEBHOOK_SECRET` can also use the same value.

Generate local-quality secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 3. Google Cloud

Enable these APIs on the Google Cloud project:

- Google Drive API
- Google Picker API
- YouTube Data API v3

Create OAuth clients or reuse one web OAuth client with these redirect URIs:

```text
https://relay-room-one.vercel.app/api/auth/callback/google
https://relay-room-one.vercel.app/api/oauth/drive/callback
https://relay-room-one.vercel.app/api/oauth/youtube/callback
http://localhost:3000/api/auth/callback/google
http://localhost:3000/api/oauth/drive/callback
http://localhost:3000/api/oauth/youtube/callback
```

Set these in Vercel:

```bash
GOOGLE_SIGNIN_CLIENT_ID=...
GOOGLE_SIGNIN_CLIENT_SECRET=...
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REDIRECT_URI=https://relay-room-one.vercel.app/api/oauth/drive/callback
GOOGLE_YOUTUBE_CLIENT_ID=...
GOOGLE_YOUTUBE_CLIENT_SECRET=...
GOOGLE_YOUTUBE_REDIRECT_URI=https://relay-room-one.vercel.app/api/oauth/youtube/callback
GOOGLE_PICKER_API_KEY=...
```

Restrict the Picker API key to websites and the Google Picker API / Google Drive API once production is stable.

RelayRoom intentionally requests Drive `drive.readonly` instead of the spec's `drive.file` scope. `drive.file` did not reliably expose all user-uploaded files inside selected watched folders during local testing, so `drive.readonly` is the current working tradeoff for polling-based folder detection.

## 4. OAuth Consent

- Audience should be External unless all operators are in one Google Workspace org.
- Add every testing Google account under Test users while the app is in testing mode.
- Add Privacy Policy and Terms URLs before broader release.
- Keep the Drive scope tradeoff above visible in deployment notes and any submission docs.

## 5. Vercel Cron

`vercel.json` schedules:

```text
/api/cron/detect
```

The endpoint checks all enabled pipelines and only runs pipelines whose stored cadence is due. A 5-minute cron can safely support 15-minute, hourly, daily, and custom cadence pipelines.

Manual smoke test:

```bash
SECRET=$(grep '^CRON_SECRET=' .env | cut -d= -f2-)
curl -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/detect
```

Expected result includes `checkedAt`, `enabledPipelines`, `due`, `results`, and `skippedNotDue`.

## 6. Production Smoke Test

1. Log in with the owner account.
2. Connect Drive and YouTube.
3. Create a pipeline with a test Drive folder and private/unlisted YouTube playlist.
4. Enable the pipeline.
5. Upload one small MP4 into the Drive folder.
6. Run detection manually or wait for cron.
7. Confirm a queue item appears.
8. Approve upload.
9. Confirm the video appears in the connected YouTube account and playlist.
10. Log in with a second allowed user and confirm shared workspace visibility plus user filtering.

## 7. Operational Notes

- YouTube uploads cost 1,600 quota units each.
- Failed, skipped, externally handled, and uploaded queue items stay visible for auditability.
- Archived pipelines are read-only and do not run detection.
- Disconnecting a Google connection pauses dependent pipelines until the connection is restored.
- Settings can generate a read-only API key for external reporting scripts. Store the raw `rrp_live_...` key immediately; RelayRoom cannot display it again after creation.
- Read-only API smoke test:

  ```bash
  curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/queue
  curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/pipelines
  ```
