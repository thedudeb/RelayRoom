const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

const checks = [
  {
    label: "Landing page",
    path: "/",
    expectText: "RelayRoom"
  },
  {
    label: "Demo queue page",
    path: "/dashboard?demo=true",
    expectText: "Operations Queue"
  },
  {
    label: "Demo pipelines page",
    path: "/pipelines?demo=true",
    expectText: "Pipelines"
  },
  {
    label: "Demo connections page",
    path: "/connections?demo=true",
    expectText: "Connections"
  },
  {
    label: "Privacy page",
    path: "/privacy",
    expectText: "Privacy Policy"
  },
  {
    label: "Terms page",
    path: "/terms",
    expectText: "Terms of Service"
  },
  {
    label: "Demo queue API",
    path: "/api/queue?demo=true",
    jsonKey: "items"
  },
  {
    label: "Demo pipelines API",
    path: "/api/pipelines?demo=true",
    jsonKey: "pipelines"
  }
];

let failed = 0;

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (check.jsonKey) {
      const payload = await response.json();
      if (!Array.isArray(payload[check.jsonKey])) {
        throw new Error(`Missing JSON array "${check.jsonKey}"`);
      }
    } else {
      const text = await response.text();
      if (!text.includes(check.expectText)) {
        throw new Error(`Missing text "${check.expectText}"`);
      }
    }

    console.log(`ok - ${check.label}`);
  } catch (error) {
    failed += 1;
    console.error(`fail - ${check.label}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  process.exitCode = 1;
}
