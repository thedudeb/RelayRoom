"use client";

import { useState } from "react";

interface ApiKeyPanelProps {
  activeKey?: {
    createdAt: string;
    lastUsedAt?: string | null;
    name: string;
  } | null;
}

export function ApiKeyPanel({ activeKey }: ApiKeyPanelProps) {
  const [generatedKey, setGeneratedKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);

  async function rotateKey() {
    if (
      activeKey &&
      !window.confirm(
        "Rotate the read-only API key? Existing scripts using the old key will stop working."
      )
    ) {
      return;
    }

    setIsRotating(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/api-key/rotate", {
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as {
        apiKey?: string;
        error?: string;
        message?: string;
      };

      if (!response.ok || payload.error || !payload.apiKey) {
        throw new Error(payload.error || "Unable to rotate API key.");
      }

      setGeneratedKey(payload.apiKey);
      setMessage(payload.message || "Read-only API key rotated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to rotate API key.");
    } finally {
      setIsRotating(false);
    }
  }

  return (
    <div className="stack">
      <div className="api-key-status">
        <strong>{activeKey ? "Read-only API key active" : "No read-only API key yet"}</strong>
        <p className="muted">
          {activeKey
            ? `Created ${activeKey.createdAt}. Last used ${activeKey.lastUsedAt || "never"}.`
            : "Generate a key for read-only queue and pipeline API access."}
        </p>
      </div>
      {generatedKey ? (
        <label className="stack">
          <span>New API key</span>
          <textarea
            className="input api-key-output"
            readOnly
            value={generatedKey}
            aria-label="New read-only API key"
          />
          <small className="field-hint">Store this key now. RelayRoom only shows it once.</small>
        </label>
      ) : null}
      {message ? (
        <div className="notice success inline" role="status">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="notice danger inline" role="alert">
          {error}
        </div>
      ) : null}
      <button className="button" disabled={isRotating} onClick={rotateKey} type="button">
        {isRotating ? "Rotating..." : activeKey ? "Rotate API key" : "Generate API key"}
      </button>
    </div>
  );
}
