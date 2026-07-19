const baseUrl = process.env.SMOKE_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 10_000);
const base = new URL(baseUrl);
const localBase = ["localhost", "127.0.0.1", "::1"].includes(base.hostname);

const checks = [
  {
    label: "Landing page",
    kind: "text",
    path: "/",
    expectText: "RelayRoom"
  },
  {
    label: "Demo queue page",
    kind: "text",
    path: "/dashboard?demo=true",
    expectText: "Operations Queue"
  },
  {
    label: "Demo pipelines page",
    kind: "text",
    path: "/pipelines?demo=true",
    expectText: "Pipelines"
  },
  {
    label: "Demo connections page",
    kind: "text",
    path: "/connections?demo=true",
    expectText: "Connections"
  },
  {
    label: "Demo settings page",
    kind: "text",
    path: "/settings?demo=true",
    expectText: "Settings"
  },
  {
    label: "Demo activity page",
    kind: "text",
    path: "/activity?demo=true",
    expectText: "Activity Timeline"
  },
  {
    label: "Demo health page",
    kind: "text",
    path: "/health?demo=true",
    expectText: "Pipeline Health"
  },
  {
    label: "Privacy page",
    kind: "text",
    path: "/privacy",
    expectText: "Privacy Policy"
  },
  {
    label: "Terms page",
    kind: "text",
    path: "/terms",
    expectText: "Terms of Service"
  },
  {
    label: "Health API",
    kind: "json",
    path: "/api/health",
    expectJson: (payload) => payload.ok === true && payload.service === "relayroom",
    jsonError: "Missing healthy service response"
  },
  {
    label: "Demo queue API",
    kind: "json",
    path: "/api/queue?demo=true",
    expectJson: (payload) => Array.isArray(payload.items),
    jsonError: 'Missing JSON array "items"'
  },
  {
    label: "Demo pipelines API",
    kind: "json",
    path: "/api/pipelines?demo=true",
    expectJson: (payload) => Array.isArray(payload.pipelines),
    jsonError: 'Missing JSON array "pipelines"'
  },
  {
    label: "Demo queue CSV export",
    kind: "csv",
    path: "/api/export/queue?demo=true",
    expectColumns: [
      "id",
      "filename",
      "status",
      "owner",
      "pipeline",
      "source_folder",
      "playlist",
      "matched_rule",
      "detected_at",
      "last_action_at",
      "failure_reason",
      "last_error",
      "youtube_url",
      "drive_file_id"
    ]
  },
  {
    label: "Demo activity CSV export",
    kind: "csv",
    path: "/api/export/activity?demo=true",
    expectColumns: [
      "id",
      "created_at",
      "actor",
      "message",
      "filename",
      "status",
      "owner",
      "pipeline",
      "bulk_batch_id",
      "bulk_action",
      "bulk_size"
    ]
  },
  {
    label: "Cron detect auth guard",
    kind: "guard",
    path: "/api/cron/detect",
    method: "GET"
  },
  {
    label: "Cron upload auth guard",
    kind: "guard",
    path: "/api/cron/process-uploads",
    method: "GET"
  },
  {
    label: "Detection webhook signature guard",
    kind: "guard",
    path: "/api/webhooks/detection",
    method: "POST",
    body: "{}"
  }
];

let failed = 0;

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  try {
    const response = await fetch(url, {
      body: check.body,
      method: check.method || "GET",
      signal: AbortSignal.timeout(timeoutMs)
    });

    await verifyCheck(check, response);

    console.log(`ok - ${check.label}`);
  } catch (error) {
    failed += 1;
    console.error(`fail - ${check.label}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  process.exitCode = 1;
}

async function verifyCheck(check, response) {
  if (check.kind === "guard") {
    await verifyGuardResponse(response);
    return;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (check.kind === "json") {
    const payload = await response.json();
    if (!check.expectJson(payload)) {
      throw new Error(check.jsonError);
    }
    return;
  }

  if (check.kind === "csv") {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/csv")) {
      throw new Error(`Expected CSV content type, got "${contentType || "missing"}"`);
    }

    const text = await response.text();
    const header = text.split(/\r?\n/, 1)[0];
    const expectedHeader = check.expectColumns.map((column) => `"${column}"`).join(",");
    if (header !== expectedHeader) {
      throw new Error(`Unexpected CSV header "${header}"`);
    }
    return;
  }

  const text = await response.text();
  if (!text.includes(check.expectText)) {
    throw new Error(`Missing text "${check.expectText}"`);
  }
}

async function verifyGuardResponse(response) {
  if (response.status === 401) {
    return;
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the clearer HTTP status error below if the body is not JSON.
  }

  if (response.status === 503 && payload?.error === "GoogleIntegrationsPaused") {
    return;
  }

  if (localBase && response.status === 500 && payload?.error === "MissingCronSecret") {
    return;
  }

  if (localBase && response.status === 500 && payload?.error === "MissingWebhookSecret") {
    return;
  }

  throw new Error(`Expected auth rejection, got HTTP ${response.status}`);
}
