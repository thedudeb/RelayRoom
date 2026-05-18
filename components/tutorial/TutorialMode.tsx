"use client";

import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TutorialStep {
  body: string;
  selector?: string;
  title: string;
}

const globalSteps: TutorialStep[] = [
  {
    selector: '[data-tour="nav-queue"]',
    title: "Queue",
    body: "This is the operations home. Every detected recording lands here, including approvals, failures, uploads, skips, and recovery actions."
  },
  {
    selector: '[data-tour="nav-pipelines"]',
    title: "Pipelines",
    body: "Pipelines connect a Drive folder to a YouTube destination and decide how files are routed, approved, and uploaded."
  },
  {
    selector: '[data-tour="nav-connections"]',
    title: "Connections",
    body: "Connections are the separate Google grants for Drive sources and YouTube destinations. Users can see the workspace, but only manage their own grants."
  },
  {
    selector: '[data-tour="nav-settings"]',
    title: "Settings",
    body: "Settings contains readiness checks, API key access, timezone preferences, and owner-only user controls."
  }
];

const pageSteps: Record<string, TutorialStep[]> = {
  dashboard: [
    {
      selector: '[data-tour="queue-summary"]',
      title: "Queue summary",
      body: "These cards show the live shape of the queue: approvals waiting, items needing routing, failures, and completed uploads."
    },
    {
      selector: '[data-tour="queue-filters"]',
      title: "Filters",
      body: "Use the status tabs and dropdowns to narrow the queue by state, pipeline, or sort order."
    },
    {
      selector: '[data-tour="queue-table"]',
      title: "Queue actions",
      body: "Each row has action buttons for details, approve/upload, route, open YouTube, retry, skip, or restore depending on the item state."
    }
  ],
  pipelines: [
    {
      selector: '[data-tour="pipeline-owner-filter"]',
      title: "Pipeline owner filter",
      body: "Switch between all workspace pipelines, your pipelines, and another user's pipelines without changing ownership."
    },
    {
      selector: '[data-tour="new-pipeline"]',
      title: "New pipeline",
      body: "Create a watched-folder automation by selecting Drive, YouTube, playlist, privacy, cadence, and title/description templates."
    },
    {
      selector: '[data-tour="routing-rules"]',
      title: "Routing rules",
      body: "Rules run top to bottom. The first matching rule assigns playlist, title, description, and upload path."
    },
    {
      selector: '[data-tour="pipeline-actions"]',
      title: "Pipeline controls",
      body: "Enable, disable, run detection, check Drive, duplicate, archive, or restore a pipeline from its controls."
    }
  ],
  connections: [
    {
      selector: '[data-tour="connection-actions"]',
      title: "Connect accounts",
      body: "Connect Drive and YouTube separately. RelayRoom can use different Google accounts for source folders and upload destinations."
    },
    {
      selector: '[data-tour="workspace-user-filter"]',
      title: "User filter",
      body: "Allowed users can see workspace connections, and this filter narrows the view by owner."
    },
    {
      selector: '[data-tour="connection-table"]',
      title: "Connection table",
      body: "This table shows connected accounts, scopes, status, where each grant is used, and owner-scoped reconnect/disconnect controls."
    }
  ],
  settings: [
    {
      selector: '[data-tour="readiness-panel"]',
      title: "Readiness",
      body: "Readiness checks make missing production configuration visible before a connection, cron, or upload flow surprises you."
    },
    {
      selector: '[data-tour="api-key-panel"]',
      title: "Read-only API key",
      body: "Generate a hashed bearer token for read-only queue and pipeline API access. The raw key is only shown once."
    },
    {
      selector: '[data-tour="owner-controls"]',
      title: "Owner controls",
      body: "The owner can enable, disable, or remove allowed users while keeping workspace data visible to the team."
    }
  ]
};

export function TutorialMode() {
  const pathname = usePathname();
  const pageKey = pageKeyForPath(pathname);
  const steps = useMemo(
    () => [...globalSteps, ...(pageSteps[pageKey] || [])],
    [pageKey]
  );
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const pointerHandledAt = useRef(0);
  const currentStep = steps[index] || steps[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    if (!open || !currentStep?.selector) {
      setTargetRect(null);
      return;
    }

    function updateRect() {
      const target = document.querySelector(currentStep.selector || "");
      setTargetRect(target ? target.getBoundingClientRect() : null);
    }

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, open]);

  function goToStep(nextIndex: number) {
    setIndex(Math.min(Math.max(nextIndex, 0), steps.length - 1));
  }

  function handlePointerAction(action: () => void) {
    return () => {
      pointerHandledAt.current = Date.now();
      action();
    };
  }

  function handleClickAction(action: () => void) {
    return () => {
      if (Date.now() - pointerHandledAt.current < 350) return;
      action();
    };
  }

  function nextStep() {
    if (index === steps.length - 1) {
      setOpen(false);
      return;
    }
    goToStep(index + 1);
  }

  const tutorialLayer = open ? (
    <div className="tutorial-layer" role="presentation">
      <button
        aria-label="Close tutorial"
        className="tutorial-scrim"
        onClick={() => setOpen(false)}
        type="button"
      />
      {targetRect ? <Spotlight rect={targetRect} /> : null}
      <section
        aria-label="RelayRoom tutorial"
        className="tutorial-card"
        role="dialog"
        style={tutorialCardStyle(targetRect)}
      >
        <div className="tutorial-card-header">
          <span>{index + 1} of {steps.length}</span>
          <button
            aria-label="Close tutorial"
            className="icon-button"
            onClick={() => setOpen(false)}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <h2>{currentStep.title}</h2>
        <p>{currentStep.body}</p>
        <div className="tutorial-progress" aria-hidden="true">
          <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="tutorial-actions">
          <button
            className="button"
            disabled={index === 0}
            onClick={handleClickAction(() => goToStep(index - 1))}
            onPointerUp={handlePointerAction(() => goToStep(index - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={16} />
            Back
          </button>
          <button
            className="button primary"
            onClick={handleClickAction(nextStep)}
            onPointerUp={handlePointerAction(nextStep)}
            type="button"
          >
            {index === steps.length - 1 ? "Done" : "Next"}
            {index === steps.length - 1 ? null : <ChevronRight aria-hidden="true" size={16} />}
          </button>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        className="button"
        data-tour="tutorial-button"
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        type="button"
      >
        <HelpCircle aria-hidden="true" size={16} />
        Tutorial
      </button>
      {mounted && tutorialLayer ? createPortal(tutorialLayer, document.body) : null}
    </>
  );
}

function Spotlight({ rect }: { rect: DOMRect }) {
  return (
    <div
      aria-hidden="true"
      className="tutorial-spotlight"
      style={{
        height: rect.height + 16,
        left: rect.left - 8,
        top: rect.top - 8,
        width: rect.width + 16
      }}
    />
  );
}

function tutorialCardStyle(rect: DOMRect | null): CSSProperties {
  if (!rect) {
    return {};
  }

  const cardWidth = Math.min(360, window.innerWidth - 32);
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - cardWidth - 16);
  const below = rect.bottom + 18;
  const above = rect.top - 260;
  const top = below < window.innerHeight - 240 ? below : Math.max(16, above);

  return {
    left,
    top,
    width: cardWidth
  };
}

function pageKeyForPath(pathname: string) {
  if (pathname.startsWith("/pipelines")) return "pipelines";
  if (pathname.startsWith("/connections")) return "connections";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}
