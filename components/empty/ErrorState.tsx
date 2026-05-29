"use client";

import { useState } from "react";
import { Copy, RotateCcw } from "lucide-react";

// Recoverable error display used by the route/global error boundaries. Shows a
// retry button (when the boundary provides `reset` via onReset), a safe link
// home, and a copy-to-clipboard button for the error message/digest to ease bug
// reports.
export function ErrorState({
  title = "This route hit a dead end.",
  body = "Something failed while loading. You can retry, or jump back to a known good page.",
  error,
  onReset,
  homeHref = "/dashboard",
  homeLabel = "Open queue"
}: {
  title?: string;
  body?: string;
  error?: Error & { digest?: string };
  onReset?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const detail = error?.message || error?.digest;

  // Copy the error detail and briefly flip the label to "Copied" as feedback.
  function copyDetail() {
    if (!detail) return;
    navigator.clipboard.writeText(detail).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="error-state">
      <div className="error-state-art" aria-hidden="true">
        <ErrorIllustration />
      </div>
      <p className="error-state-eyebrow">Routing error</p>
      <strong>{title}</strong>
      <p>{body}</p>
      <div className="error-state-actions">
        {onReset ? (
          <button className="button primary" onClick={onReset} type="button">
            <RotateCcw aria-hidden="true" size={15} />
            Try again
          </button>
        ) : null}
        <a className="button" href={homeHref}>
          {homeLabel}
        </a>
      </div>
      {detail ? (
        <button className="error-state-detail" onClick={copyDetail} type="button" title="Copy error">
          <code>{detail}</code>
          <span>
            <Copy aria-hidden="true" size={13} />
            {copied ? "Copied" : "Copy"}
          </span>
        </button>
      ) : null}
    </div>
  );
}

function ErrorIllustration() {
  return (
    <svg viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect x="14" y="44" width="38" height="32" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 50 L22 50 L26 46 L52 46" stroke="currentColor" strokeWidth="1.5" />
      <line x1="56" y1="60" x2="90" y2="60" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.55" />
      <g stroke="var(--red)" strokeWidth="2" strokeLinecap="round">
        <line x1="96" y1="52" x2="112" y2="68" />
        <line x1="112" y1="52" x2="96" y2="68" />
      </g>
      <line x1="118" y1="60" x2="148" y2="60" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.35" />
      <rect x="150" y="44" width="38" height="32" rx="5" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M163 53 L173 60 L163 67 Z" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
