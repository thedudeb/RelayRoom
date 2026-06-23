# RelayRoom Case Study

> **TL;DR** — RelayRoom turns a messy Google Drive folder of meeting recordings into a reliable, auditable YouTube publishing pipeline. I designed and built it solo, end to end — Next.js/TypeScript, Postgres/Prisma, Auth.js, and the Drive + YouTube APIs. The interesting problem wasn't uploading files; it was **accountable automation**: never lose a recording, never upload it twice, and always explain why something routed where it did. Built to a production-shaped architecture with a 51-test suite around the highest-risk logic.

## Overview

RelayRoom is a full-stack operations platform for moving meeting recordings from Google Drive into organized YouTube playlists. It turns a messy Drive folder into a reliable publishing queue with visual routing rules, approval flows, recovery actions, and a transparent audit trail for every file.

The project began from a product spec for a multi-user recording pipeline tool. I built the application end to end: authentication, OAuth connection management, Drive detection, rule evaluation, YouTube upload handling, operational dashboards, demo mode, and test coverage around the highest-risk workflows.

## The Problem

Teams often accumulate important recordings in shared Drive folders, but turning those files into a useful video library is still a manual operations job. Someone has to notice new recordings, identify what they are, pick the correct destination, upload them, add metadata, handle quota or token failures, and make sure nothing is lost or duplicated.

The hard part is not only uploading videos. The hard part is trust:

- No recording should silently disappear.
- No recording should upload twice because a webhook or cron job fired again.
- Operators need to know why a recording routed to a playlist.
- Failures should be recoverable without restarting the whole workflow.
- OAuth access should be separated, scoped, and revocable.

RelayRoom was designed around that trust problem.

## Product Goals

The core product goals were:

- Connect multiple Google Drive accounts and multiple YouTube channels.
- Watch selected Drive folders for new recordings.
- Let operators build visual routing rules for playlists.
- Upload matching videos to YouTube safely, unlisted by default.
- Surface every file in an operations queue with clear next actions.
- Make failures explainable and recoverable.
- Provide a demo mode so reviewers can inspect the product without configuring OAuth.

## My Role

I was the solo full-stack engineer and product designer — this was built end to end by one person. My responsibilities included:

- Translating the written spec into a working product architecture.
- Designing the data model and queue lifecycle.
- Implementing the Next.js app, server actions, route handlers, Prisma schema, and test suite.
- Building the rule builder, dashboard, queue details, recovery actions, and demo experience.
- Making security and reliability tradeoffs explicit in the README and architecture documentation.

## Solution

RelayRoom is organized around three main surfaces: Connections, Pipelines, and Queue.

### Connections

Users sign in with Google for identity, then authorize Drive and YouTube as separate OAuth grants. This separation matters because sign-in proves who the user is, while Drive and YouTube grants give the app specific operational capabilities.

Drive and YouTube connections are reusable across pipelines. YouTube connections are keyed by channel ID so multiple channels under one Google account do not overwrite each other. Refresh tokens are encrypted at rest, and disconnecting a connection wipes stored credentials and pauses dependent pipelines instead of deleting historical queue data.

### Pipelines

A pipeline connects one Drive folder to one YouTube channel. Each pipeline defines:

- Source Drive folder.
- Destination YouTube channel.
- Upload privacy, defaulting to unlisted.
- Automatic or manual-approval mode.
- Default title and description templates.
- Ordered playlist routing rules.

The rule builder supports nested AND/OR groups, filename matching, file type checks, day-of-week conditions, time-of-day conditions, regex validation, wildcard matching, and first-match-wins ordering.

### Queue

Every detected recording becomes a queue item. The queue covers the full lifecycle:

- Detected.
- Needs routing.
- Needs approval.
- Uploading.
- Uploaded.
- Failed.
- Skipped.
- Externally handled.

The detail panel shows the matched rule, playlist, title, description, per-condition rule trace, upload attempt history, and activity log. This lets an operator answer the two most important questions quickly: "What happened?" and "What should I do next?"

## Recent Product Expansion: Recording Intelligence

After the core routing workflow was working, I added a first slice of a larger "recording intelligence" direction. Queue details now include generated enrichment around each recording:

- Suggested title.
- Suggested description.
- Suggested chapters.
- Suggested tags.
- Confidence level.
- Review flags.
- Routing recommendation.

The first implementation is deterministic and based on filename, pipeline, source folder, matched rule, status, and MIME type. The API and UI contract are intentionally shaped so a future AI provider can fill the same object from transcripts or multimodal analysis without rewriting the dashboard.

This is the product direction that can move RelayRoom beyond "Drive to YouTube automation" into "video operations intelligence."

## Architecture

RelayRoom uses:

| Layer | Technology |
| --- | --- |
| App framework | Next.js App Router, React, TypeScript |
| Database | PostgreSQL through Prisma |
| Authentication | Auth.js with Google sign-in |
| OAuth integrations | Google Drive API, YouTube Data API v3 |
| Hosting model | Vercel route handlers and cron jobs |
| Testing | Vitest |

The system separates detection from upload processing:

1. Drive push notifications, polling, or signed external webhooks trigger detection.
2. Detection runs the shared pipeline/rule engine and creates or updates queue items.
3. Upload workers drain detected items separately.
4. Uploads stream Drive files into YouTube resumable sessions in chunks.
5. Queue details expose all routing, upload, and recovery state.

This separation keeps slow uploads from blocking new detections and lets each part of the system fail independently.

## Key Technical Decisions

### Separate OAuth Grants

Google sign-in, Drive access, and YouTube access are three different trust domains. RelayRoom treats them as separate flows and database records. Revoking YouTube upload access should not affect sign-in, and revoking Drive access should not erase queue history.

### One Shared Detection Pipeline

RelayRoom supports Drive push notifications, polling, and signed webhooks. All three routes use the same downstream detection and rule-evaluation path. That keeps deduplication, cold-start behavior, and trace generation consistent.

### Per-Pipeline Idempotency

Queue items are unique by `(pipelineId, driveFileId)`. The same Drive file can validly appear in multiple pipelines, but the same pipeline should not upload the same file twice just because a webhook and cron tick both saw it.

### Streaming Uploads

Uploads stream from Drive to YouTube using resumable upload sessions and 8 MiB chunks. RelayRoom avoids buffering entire videos in memory and handles YouTube's `308 Resume Incomplete` responses.

### Recovery-First Queue Design

Failures are classified so the UI can distinguish quota exhaustion from auth revocation, playlist deletion, unsupported files, network timeouts, and validation errors. Operators can retry, route manually, approve, skip, mark as externally handled, or restore.

### Demo Mode

Demo mode uses seeded data and client-side action simulation so someone can explore the product without connecting real Google accounts. This was important because the workflow depends on external OAuth, cron, Drive files, and YouTube quota.

## UX Decisions

The interface is designed as an operations tool, not a marketing site. The highest-value screens are dense, scannable, and action-oriented:

- Queue status cards make work-in-progress visible.
- Filters support pipeline, matched rule, date range, owner, and status.
- Rule traces explain why a file did or did not match a rule.
- Manual route and edit-and-route flows keep exceptions inside the queue.
- Public upload requires a two-step confirmation because it changes YouTube visibility.
- Mobile layouts preserve the core workflow rather than hiding essential actions.

## Security and Reliability

Security and reliability were treated as product requirements:

- Google sessions use secure cookie settings.
- Sign-in can be restricted by email or workspace domain.
- Per-service refresh tokens are encrypted at rest.
- Token encryption uses AAD bound to the connection ID.
- API keys are read-only and method-gated.
- Webhook signatures use HMAC verification and replay protection.
- Cron endpoints require bearer auth.
- Regex input is bounded to reduce denial-of-service risk.
- Unsupported files are skipped visibly instead of failing silently.

## Testing

The test suite covers the highest-risk business logic:

- Rule evaluation and regex validation.
- Queue state transitions.
- Token encryption and request guards.
- Webhook signature verification.
- Drive folder validation.
- Cron scheduling.
- Rule ordering.
- YouTube supported-format checks.
- Read-only API scoping.
- Recording intelligence generation.

At the time of this case study, the full suite passes with 51 tests.

## Outcome

RelayRoom is a working full-stack MVP. It hasn't been put in front of real teams yet, so the result here is about what the build *demonstrates* rather than usage metrics:

- A **production-shaped architecture**, not a prototype — detection and upload are decoupled so slow uploads never block new detections, and each subsystem can fail independently.
- **Reliability built in, not bolted on** — per-pipeline idempotency, classified failures, and recovery actions across all eight queue states.
- **Explainability as a feature** — every routing decision carries a per-condition trace, so an operator can always answer "what happened?" and "what next?"
- **Security treated as a requirement** — encrypted per-service tokens, HMAC-verified webhooks, scoped API keys, bounded regex.
- **Tested where it matters** — 51 tests covering rule evaluation, state transitions, token encryption, and webhook verification.
- **Reviewable without setup** — demo mode lets anyone explore the full workflow without configuring OAuth.

The product now has a credible operational foundation. The next strategic leap is to enrich recordings with transcripts, semantic tagging, AI-generated metadata, clip suggestions, and content-aware routing.

## What I Would Do Next

The next phase would focus on turning RelayRoom from a routing tool into a video operations intelligence platform:

1. Add transcript ingestion and AI-generated summaries.
2. Generate better titles, descriptions, chapters, and tags from recording content.
3. Suggest routing rules from repeated patterns.
4. Add outbound webhooks and Zapier/n8n integration.
5. Support more destinations beyond YouTube.
6. Add workspace-level analytics: time saved, recordings processed, failures recovered, and manual touches avoided.

## Reflection

The most interesting part of RelayRoom was designing for operational trust. A simple integration can upload a file, but a reliable product has to explain itself when something goes wrong. The queue, trace, idempotency model, and recovery actions became the real product.

That changed how I thought about the build. The goal was not just automation. The goal was accountable automation: every recording visible, every decision explainable, and every failure recoverable.
