# RelayRoom demo script

Target: **20 minutes**. Pacing is generous; you can run faster.

## Before you hit record (15 min prep)

- [ ] **Reset state**: pick a fresh Drive folder ("Demo Recordings") and a YouTube channel you don't mind uploading test videos to. Pre-create maybe 1 existing file in the folder so you can demo cold-start (it should NOT appear after enabling).
- [ ] **Prepare demo recordings** to drop in during the demo:
  - `Engineering-Standup-2026-05-19.mp4` (~30s, any video)
  - `Acme-Sync-2026-05-19.mp4`
  - `Random-File-2026-05-19.mp4` (for "no rule matched" path)
  - `not-a-video.pdf` (for "non-video file" path)
- [ ] **Two browser windows side-by-side**: RelayRoom on the left, the demo Drive folder + YouTube channel on the right. Helps tell the story without alt-tabbing.
- [ ] **Sign out** of any logged-in state. You'll sign in on camera.
- [ ] **Mic check, screen at 1080p+, increase font/UI scaling so the dashboard is legible at recording resolution**.
- [ ] **Tabs ready**: RelayRoom, Drive folder, YouTube channel.
- [ ] **Run** `prisma migrate deploy` against prod if you haven't (Wave 8c migration).

## Timing target

| Minutes | Section |
|---|---|
| 0–2 | Intro & sign-in |
| 2–4 | Connect Drive + YouTube (multi-account) |
| 4–7 | Create pipeline, default templates, privacy |
| 7–12 | Rule builder with AND/OR nesting + rule tester |
| 12–17 | End-to-end: drop file → see it move → verify on YouTube |
| 17–20 | Dashboard tour: filters, detail view, failure paths |

---

## Scene 1 — Intro (0:00–1:00)

**On camera:** RelayRoom landing page.

> "This is RelayRoom — an authenticated operations platform that moves meeting recordings from Drive into YouTube, with a visual rule builder, full queue lifecycle, and recovery flows. I'll show the connection setup, the rule builder, an end-to-end recording flowing through, and the dashboard surfaces for exception handling."

Stay terse. Don't tour the README.

---

## Scene 2 — Sign-in (1:00–2:00)

1. Click **Sign in with Google** → Google consent → land on dashboard.
2. Briefly point out the empty state if no data, or the "Workspace" badge if you have other users' data visible.

> "Sign-in is Google OAuth, basic scope only. The first user — set by `INITIAL_ADMIN_EMAIL` — gets the owner role automatically; their access is for account management, not data visibility."

If you want to show owner powers, skip; covered in §4.1 — most reviewers don't need to see the disable-user flow live.

---

## Scene 3 — Connect Drive (2:00–3:00)

1. Navigate to **Connections**.
2. Click **Connect Drive** → Google consent screen appears.
3. **Pause on the consent screen** — point out:
   > "Note the scope on this screen — `drive.readonly` for the watched-folder listing flow. The reviewers approved that scope; `drive.file` only exposes Picker-opened files which made watched-folder detection miss existing recordings."
4. Approve → returned to Connections page → new connection row appears with account email, connected date, scopes, ACTIVE badge.

If you have time: click **Connect Drive** a second time with a different Google account to show multi-account.

---

## Scene 4 — Connect YouTube (3:00–3:45)

1. Click **Connect YouTube**, approve consent.
2. Point out the YouTube row showing **channel name + handle**, separate scopes (`youtube.upload`, `youtube`).
3. (Optional) Connect a second YouTube channel under the same Google account.

> "Each connection is a separate OAuth grant — sign-in and per-service are different flows. YouTube connections are keyed by channel ID so a Google account with multiple channels doesn't overwrite itself."

---

## Scene 5 — Create the pipeline (3:45–6:00)

1. **Pipelines → New pipeline**.
2. Name: `Engineering Recordings Demo`.
3. Source: click **Pick Drive folder** → Google Picker opens → select your Demo Recordings folder.
   > "Folder selection only happens through Google Picker — no raw URL paste. The OAuth grant is scoped to the picked folder."
4. Destination channel: pick the YouTube channel from the dropdown.
5. Mode: **Auto** (talk through what "Manual approval required" does without switching).
6. Pipeline default title template: `{rule_name} — {date}`
7. Pipeline default description template: `Recorded on {date} at {time}. Source: {source_folder_name}.`
8. Privacy: leave at **Unlisted**. Toggle to **Public** for half a second to show the **two-step confirmation prompt** that requires typing the pipeline name. Cancel.
9. Save → pipeline appears in the list, status DISABLED.

---

## Scene 6 — Rule builder (6:00–11:00) — *the centerpiece*

Spend real time here. The spec calls this out as the most-judged surface.

1. **Open the pipeline → Rules tab**.
2. Empty state copy: "No rules yet — every file will land in Needs Routing for manual handling."
3. **Add rule 1: "Engineering Standup"**
   - Add a group, set to AND.
   - Condition: filename **contains** "Engineering" (mention case-insensitive default + the visible toggle).
   - Condition: filename **contains** "Standup".
   - Action: playlist picker → pick an existing playlist OR click **+ Create new** to create one inline ("Engineering Standups"). Show the inline create flow.

4. **Add rule 2: "Friday Demos"** — *demonstrates AND/OR nesting*
   - Outer group: AND
   - Add nested group inside (OR):
     - filename contains "Demo"
     - filename contains "Showcase"
   - Sibling condition at outer level: day-of-week **is** Friday
   - Action: playlist "Friday Demos" (create inline)
   - **Pause on the visual — point out the indented AND/OR blocks**:
     > "That's the AND/OR nesting the spec asks for — one outer AND wrapping an inner OR group plus a day-of-week leaf."

5. **Add rule 3: "Acme Client Calls"** — quick, just to show priority ordering.
   - filename contains "Acme".

6. **Reorder rules** by drag-and-drop — show that first-match-wins ordering matters.

7. **Rule tester (bonus)** — open it, paste `Engineering-Standup-2026-05-19.mp4`, hit Test.
   > "The rule tester is the bonus the spec mentions — paste a sample filename, see which rule fires and which playlist it routes to. Makes authoring rules confidently a lot cheaper."
   - Test a second filename that matches "Friday Demos" — change the day-of-week input to a Friday so it lights up.
   - Test `random.mp4` — should report "no match → Needs Routing".

8. Click **Save** / close.

---

## Scene 7 — Enable the pipeline (11:00–11:30)

1. Back on Pipelines list → click **Enable** on your pipeline.
2. Confirm the status badge flips to ENABLED.

> "Enabling sets the cold-start watermark — any file already in the folder before this moment will NOT be processed. The pipeline also subscribes to Drive push notifications under the hood so detection latency is seconds, not minutes."

(If anyone asks: in your Drive folder, the pre-existing file from prep will *not* trigger processing.)

---

## Scene 8 — End-to-end flow (11:30–16:00)

This is where reviewers want to see *real* execution.

1. **Switch to Drive window** → upload `Engineering-Standup-2026-05-19.mp4` to the watched folder.
2. **Switch to RelayRoom dashboard.**
3. Within ~5 seconds (push) or ~1 minute (polling worst-case), a new queue item appears with status **detected** → **uploading** → **uploaded**.
4. Open the queue item's detail view → point out:
   - **Rule evaluation trace** showing which conditions matched which rule
   - **Upload attempt history** with timestamps and the resulting YouTube video ID
   - **Activity log** with each state transition
5. Click the YouTube link → verify the video appears in YouTube as **unlisted**, in the correct **Engineering Standups** playlist, with the templated title and description.

> "Look at the title — `Engineering Standup — 2026-05-19`. That's the rule's name plus the date from Drive's createdTime, rendered in my account timezone. The description below it comes from the pipeline default template."

6. **Drop a second file**: `Random-File-2026-05-19.mp4`.
7. Wait for detection → status appears as **needs_routing**.
8. Open the detail view → show the **rule trace** explaining *why* nothing matched (each rule's conditions evaluated to false, with the per-condition breakdown).
9. From the queue row, click the playlist dropdown → pick any playlist OR click **+ Create new** to make one inline ("Misc Recordings") → click **Route**.
10. Item moves to **needs_approval** → click **Approve** → upload runs → status becomes **uploaded**.

---

## Scene 9 — Failure & recovery surfaces (16:00–19:00)

Pick **2 of the 3** below depending on time:

**(a) Non-video file → flagged**
1. Drop `not-a-video.pdf` into Drive.
2. Queue item appears with a `not_video` failure reason — show the badge and reason text.

**(b) Mark as already uploaded → reversible**
1. Take any queued item, click **Mark as already uploaded** → paste a YouTube URL when prompted (host-locked to youtube.com / youtu.be).
2. Show the item moves to the **Externally Handled** tab; original queue tabs are clean.
3. From the externally-handled detail, click **Restore** → item flips back to its previous status, and the YouTube link state is cleared so it can't be mistaken for a real upload.

**(c) Failed upload → retry**
1. (If you can engineer one, e.g., temporarily revoke YouTube from the Connections page mid-flight — but be careful not to break the demo.)
2. Easier: point to a seeded `failed` row in the dashboard, show the **Retry** action.

End this scene by walking the **filter strip**: tabs (All / Uploaded / Failed / Needs Approval / Needs Routing / Skipped / Externally Handled), pipeline filter, status filter, sort by detected/filename/last-action. ~30 seconds.

---

## Scene 10 — Architecture closer (19:00–20:00)

Stay on the dashboard. Talk over it:

> "A few notes on what's under the hood. Detection runs three ways — Drive push notifications when latency matters, cron polling as the always-on backstop, and a signed HMAC webhook for external automation tools. They all share the same downstream pipeline so idempotency, cold-start, and rule evaluation are exactly one code path.
>
> Uploads stream Drive's response body directly into YouTube's resumable session in 8-megabyte chunks with Content-Range — no full-file buffering, so the only ceiling is YouTube's hard 256 GiB / 12-hour limit. A background worker drains DETECTED items independently of the detection cron so a slow upload chain doesn't block new detections.
>
> Stored refresh tokens are AES-256-GCM with AAD bound to the connection id, API keys are HMAC-peppered, and all mutations are owner-scoped even though the read surfaces are workspace-wide. Failures are classified — quota exceeded reads differently from auth revoked, which reads differently from playlist deleted — so the operator knows when waiting fixes it and when reconnecting does."

End. Stop recording.

---

## Don't-forget callouts to weave in naturally

- **§4.4 nesting**: explicitly say the words "AND group with an OR group nested inside" while it's on screen.
- **§4.7 unlisted by default**: when you open the YouTube video, the unlisted badge should be visible.
- **§4.5 cold-start**: mention it when enabling the pipeline.
- **§4.8 rule trace**: open at least one queue item's detail view so the reviewers see the per-condition breakdown.
- **§4.2 multi-account**: if you connect a second Drive or YouTube channel, mention "multi-account" explicitly — the rubric weights this.

## Things you can skip without losing points

- Reading the README on camera.
- Showing the settings page in detail.
- The Read-Only REST API (mention it exists; don't curl on camera unless you have headroom).
- Showing the database / Prisma anything.

## If you blow the timing

- Cut Scene 9(a) or (c).
- Don't cut Scene 6 (rule builder) or Scene 8 (end-to-end). Those are the load-bearing minutes.
