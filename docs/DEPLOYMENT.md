# RelayRoom Deployment Runbook

Use this checklist when moving RelayRoom from local testing to Vercel production.

## 1. Database

- Create a Neon Postgres project.
- Use the pooled Postgres connection string for `DATABASE_URL`.
- Run migrations before relying on production traffic:

  ```bash
  npm run prisma:deploy
  ```

- Confirm the latest migration batch includes notification preferences and delivery attempts. Those tables power Settings notifications and the Health delivery log.
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

RelayRoom requests Drive `drive.readonly`; the assignment reviewers confirmed this is acceptable. `drive.file` did not reliably expose all user-uploaded files inside selected watched folders during local testing, so `drive.readonly` is the supported scope for polling-based folder detection.

## 4. OAuth Consent

- Audience should be External unless all operators are in one Google Workspace org.
- Add every testing Google account under Test users while the app is in testing mode.
- Add the public legal URLs before broader release:
  - Privacy Policy: `https://relay-room-one.vercel.app/privacy`
  - Terms of Service: `https://relay-room-one.vercel.app/terms`
- Keep the approved Drive scope note above visible in deployment notes and any submission docs.

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

## 6. Signed Detection Webhook

RelayRoom also exposes the spec's Path A receiver for external automation services:

```text
POST /api/webhooks/detection
```

Send the raw JSON body with these headers:

```text
x-relayroom-timestamp: 2026-05-18T12:00:00.000Z
x-relayroom-signature: sha256=<hex hmac>
```

The HMAC input is:

```text
<timestamp>.<raw JSON body>
```

Example body for a folder event:

```json
{
  "sourceFolderId": "DRIVE_FOLDER_ID",
  "driveFileId": "OPTIONAL_FILE_ID",
  "eventId": "OPTIONAL_AUTOMATION_EVENT_ID"
}
```

Example body for one known pipeline:

```json
{
  "pipelineId": "PIPELINE_ID",
  "eventId": "OPTIONAL_AUTOMATION_EVENT_ID"
}
```

If no enabled pipeline watches the folder, RelayRoom returns `202` with `ignored: true`. Matching pipelines fan out separately and still use the same watermark and duplicate protection as cron.

Local signature smoke test:

```bash
BODY='{"sourceFolderId":"DRIVE_FOLDER_ID","eventId":"manual-smoke"}'
SECRET=$(grep '^DETECTION_WEBHOOK_SECRET=' .env | cut -d= -f2-)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
SIGNATURE=$(node -e "const crypto=require('crypto'); const [secret,ts,body]=process.argv.slice(1); console.log('sha256='+crypto.createHmac('sha256', secret).update(ts+'.'+body).digest('hex'))" "$SECRET" "$TIMESTAMP" "$BODY")
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-relayroom-timestamp: $TIMESTAMP" \
  -H "x-relayroom-signature: $SIGNATURE" \
  --data "$BODY" \
  http://localhost:3000/api/webhooks/detection
```

## 7. Automated Smoke Test

Run the public/demo smoke script after each deploy:

```bash
SMOKE_BASE_URL=https://relay-room-one.vercel.app npm run smoke:local
```

The smoke pass checks:

- Public and demo pages: landing, queue, pipelines, connections, settings, activity, health, privacy, and terms.
- Dependency-free health API: `GET /api/health`.
- Demo read APIs: `GET /api/queue?demo=true` and `GET /api/pipelines?demo=true`.
- Demo CSV exports: `GET /api/export/queue?demo=true` and `GET /api/export/activity?demo=true`.
- Auth guards for cron and signed detection webhook endpoints.

On localhost, the guard checks tolerate missing cron/webhook secrets so developers can run the demo smoke pass against a fresh env. Against deployed URLs, a missing secret is a failure.

## 8. Manual Production Smoke Test

1. Log in with the owner account.
2. Connect Drive and YouTube.
3. Create a pipeline with a test Drive folder and private/unlisted YouTube playlist.
4. Enable the pipeline.
5. Upload one small MP4 into the Drive folder.
6. Run detection manually or wait for cron.
7. Confirm a queue item appears.
8. Bulk-select queue items and confirm approve/skip/restore controls only enable for valid states.
9. Export queue CSV and activity CSV from the UI; confirm filters are reflected in the downloaded files.
10. Approve upload.
11. Confirm the video appears in the connected YouTube account and playlist.
12. Open Settings and confirm timezone, accessibility, notification, webhook smoke, and API key panels render.
13. Open Health and confirm pipeline health plus notification delivery rows render.
14. Log in with a second allowed user and confirm shared workspace visibility plus user filtering.

## 9. Operational Notes

- YouTube uploads cost 1,600 quota units each.
- Failed, skipped, externally handled, and uploaded queue items stay visible for auditability.
- Archived pipelines are read-only and do not run detection.
- Disconnecting a Google connection pauses dependent pipelines until the connection is restored.
- CSV exports are available from the Queue and Activity pages and through read-only API keys.
- Settings can generate a read-only API key for external reporting scripts. Store the raw `rrp_live_...` key immediately; RelayRoom cannot display it again after creation.
- Read-only API keys are scoped to the key owner's queue and pipeline data. The browser UI can show workspace-wide data, but API keys should not be used to export another user's private rows.
- Read-only API smoke test:

  ```bash
  curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/queue
  curl -H "Authorization: Bearer rrp_live_..." "https://relay-room-one.vercel.app/api/queue?detectedFrom=2026-05-01&detectedTo=2026-05-18"
  curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/pipelines
  curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/export/queue
  curl -H "Authorization: Bearer rrp_live_..." https://relay-room-one.vercel.app/api/export/activity
  ```
