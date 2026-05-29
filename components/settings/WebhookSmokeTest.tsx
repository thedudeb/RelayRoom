"use client";

import { RadioTower } from "lucide-react";
import { useState } from "react";

interface WebhookSmokeResponse {
  error?: string;
  message?: string;
  sample?: {
    body: string;
    signaturePreview: string;
    timestamp: string;
  };
}

// Settings control that triggers the server-side webhook HMAC self-test (see
// app/api/settings/webhook-smoke) and shows the signed sample on success, giving
// integrators a copyable example of the expected signature headers.
export function WebhookSmokeTest({ disabled = false }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WebhookSmokeResponse | null>(null);
  const [tone, setTone] = useState<"danger" | "success">("success");

  async function runSmokeTest() {
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch("/api/settings/webhook-smoke", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as WebhookSmokeResponse;
      setResult(payload);
      setTone(response.ok && !payload.error ? "success" : "danger");
    } catch (error) {
      setResult({
        message: error instanceof Error ? error.message : "Webhook smoke test failed."
      });
      setTone("danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" data-tour="webhook-smoke-test">
      <div className="section-header">
        <div>
          <h2>Signed webhook test</h2>
          <p className="muted">
            Checks the HMAC setup used by external detection automations.
          </p>
        </div>
        <RadioTower aria-hidden="true" size={20} />
      </div>
      <div className="actions">
        <button className="button primary" disabled={busy || disabled} onClick={runSmokeTest} type="button">
          {busy ? "Testing..." : "Run webhook smoke test"}
        </button>
        {disabled ? <span className="muted">Log in outside demo mode to test server secrets.</span> : null}
      </div>
      {result ? (
        <div className={`notice inline ${tone}`} role={tone === "danger" ? "alert" : "status"}>
          <strong>{result.message || result.error || "Webhook smoke test finished."}</strong>
          {result.sample ? (
            <dl className="webhook-smoke-sample">
              <div>
                <dt>Timestamp</dt>
                <dd>{result.sample.timestamp}</dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>{result.sample.signaturePreview}</dd>
              </div>
              <div>
                <dt>Body</dt>
                <dd>{result.sample.body}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
