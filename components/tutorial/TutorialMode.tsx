"use client";

import { ChevronLeft, ChevronRight, HelpCircle, X } from "lucide-react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Guided product tour. A single ordered list of steps (global nav steps first,
// then per-page steps) walks the user through the app. Each step can target a
// DOM element via a `data-tour` selector, which is spotlighted with a floating
// card. Steps that live on another page prompt the user to navigate there before
// continuing. Progress is persisted in sessionStorage so the tour survives the
// page navigations it asks the user to make.

type TutorialPageKey = "dashboard" | "pipelines" | "connections" | "settings";

interface TutorialStep {
  body: string;
  // The page this step's target lives on; if it differs from the current page,
  // the tour pauses and offers a link to navigate there.
  page?: TutorialPageKey;
  // CSS selector (a data-tour attribute) for the element to spotlight.
  selector?: string;
  title: string;
}

const tutorialSessionKey = "relayroom:tutorial";

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

const pageSteps: Record<TutorialPageKey, TutorialStep[]> = {
  dashboard: [
    {
      page: "dashboard",
      selector: '[data-tour="queue-summary"]',
      title: "Queue summary",
      body: "These cards show the live shape of the queue: approvals waiting, items needing routing, failures, and completed uploads."
    },
    {
      page: "dashboard",
      selector: '[data-tour="queue-filters"]',
      title: "Filters",
      body: "Use the status tabs and dropdowns to narrow the queue by state, pipeline, or sort order."
    },
    {
      page: "dashboard",
      selector: '[data-tour="queue-table"]',
      title: "Queue actions",
      body: "Each row has action buttons for details, approve/upload, route, open YouTube, retry, skip, or restore depending on the item state."
    }
  ],
  pipelines: [
    {
      page: "pipelines",
      selector: '[data-tour="pipeline-owner-filter"]',
      title: "Pipeline owner filter",
      body: "Switch between all workspace pipelines, your pipelines, and another user's pipelines without changing ownership."
    },
    {
      page: "pipelines",
      selector: '[data-tour="new-pipeline"]',
      title: "New pipeline",
      body: "Create a watched-folder automation by selecting Drive, YouTube, playlist, privacy, cadence, and title/description templates."
    },
    {
      page: "pipelines",
      selector: '[data-tour="routing-rules"]',
      title: "Routing rules",
      body: "Rules run top to bottom. The first matching rule assigns playlist, title, description, and upload path."
    },
    {
      page: "pipelines",
      selector: '[data-tour="pipeline-actions"]',
      title: "Pipeline controls",
      body: "Enable, disable, run detection, check Drive, duplicate, archive, or restore a pipeline from its controls."
    }
  ],
  connections: [
    {
      page: "connections",
      selector: '[data-tour="connection-actions"]',
      title: "Connect accounts",
      body: "Connect Drive and YouTube separately. RelayRoom can use different Google accounts for source folders and upload destinations."
    },
    {
      page: "connections",
      selector: '[data-tour="workspace-user-filter"]',
      title: "User filter",
      body: "Allowed users can see workspace connections, and this filter narrows the view by owner."
    },
    {
      page: "connections",
      selector: '[data-tour="connection-table"]',
      title: "Connection table",
      body: "This table shows connected accounts, scopes, status, where each grant is used, and owner-scoped reconnect/disconnect controls."
    }
  ],
  settings: [
    {
      page: "settings",
      selector: '[data-tour="readiness-panel"]',
      title: "Readiness",
      body: "Readiness checks make missing production configuration visible before a connection, cron, or upload flow surprises you."
    },
    {
      page: "settings",
      selector: '[data-tour="api-key-panel"]',
      title: "Read-only API key",
      body: "Generate a hashed bearer token for read-only queue and pipeline API access. The raw key is only shown once."
    },
    {
      page: "settings",
      selector: '[data-tour="owner-controls"]',
      title: "Owner controls",
      body: "The owner can enable, disable, or remove allowed users while keeping workspace data visible to the team."
    }
  ]
};

export function TutorialMode() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageKey = pageKeyForPath(pathname);
  const demoSuffix = searchParams.get("demo") === "true" ? "?demo=true" : "";
  const steps = useMemo(() => allTutorialSteps(), []);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const pointerHandledAt = useRef(0);
  const currentStep = steps[index] || steps[0];
  const stepPageMismatch = Boolean(currentStep?.page && currentStep.page !== pageKey);
  const stepPath = currentStep?.page ? pathForPage(currentStep.page) : undefined;
  const waitingForTarget = open && Boolean(currentStep?.selector) && (stepPageMismatch || targetMissing);
  const nextBlocked = stepPageMismatch;

  // On mount, resume an in-progress tour from sessionStorage (it may have been
  // started before a navigation). `mounted` also gates the portal so it only
  // renders client-side.
  useEffect(() => {
    const stored = restoreTutorialSession();
    if (stored) {
      setIndex(Math.min(Math.max(stored.index, 0), steps.length - 1));
      setOpen(true);
    }
    setHydrated(true);
    setMounted(true);
  }, [steps.length]);

  // Persist progress while the tour is open; clear it when closed. Gated on
  // `hydrated` so the initial mount doesn't clobber a stored session before it's
  // been read.
  useEffect(() => {
    if (!hydrated) return;
    if (open) {
      window.sessionStorage.setItem(tutorialSessionKey, JSON.stringify({ index }));
      return;
    }

    window.sessionStorage.removeItem(tutorialSessionKey);
  }, [hydrated, index, open]);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  // Track the spotlight target's position. Re-measures on scroll/resize so the
  // highlight and card stay glued to the element, and scrolls it into view once
  // if it's off-screen. `targetMissing` flags when the selector matches nothing
  // yet (e.g. a collapsed section), which the card surfaces as a "waiting" hint.
  useEffect(() => {
    if (!open || !currentStep?.selector || stepPageMismatch) {
      setTargetRect(null);
      setTargetMissing(false);
      return;
    }

    let animationFrame = 0;
    let scrolledToTarget = false;

    function updateRect() {
      const target = document.querySelector(currentStep.selector || "");
      if (target) {
        const rect = target.getBoundingClientRect();
        // Scroll the target into view at most once, then re-measure on the next
        // frame after the scroll settles.
        if (!scrolledToTarget && !isRectComfortablyVisible(rect)) {
          scrolledToTarget = true;
          target.scrollIntoView({ block: "center", inline: "nearest" });
          animationFrame = window.requestAnimationFrame(updateRect);
          return;
        }
        setTargetRect(rect);
      } else {
        setTargetRect(null);
      }
      setTargetMissing(!target);
    }

    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [currentStep, open, stepPageMismatch]);

  function goToStep(nextIndex: number) {
    setIndex(Math.min(Math.max(nextIndex, 0), steps.length - 1));
  }

  // The nav buttons listen on both onPointerUp and onClick so they feel
  // responsive on touch yet still work for keyboard/synthetic clicks. These two
  // wrappers de-dupe the pair: pointerUp records a timestamp, and the click
  // handler ignores a click that lands within 350ms of it (the browser's
  // pointer→click echo) so the action doesn't fire twice.
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
    if (nextBlocked) {
      return;
    }

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
        {waitingForTarget ? (
          <div className="tutorial-waiting" role="status">
            <strong>{stepPageMismatch ? `Go to ${labelForPage(currentStep.page)}` : "Waiting for this section"}</strong>
            <span>
              {stepPageMismatch
                ? `This step lives on the ${labelForPage(currentStep.page)} tab. Open that tab to continue.`
                : "This step is on the current page, but its target is not visible yet. Open the relevant section or adjust the current view, and the highlight will appear here."}
            </span>
            {stepPageMismatch && stepPath ? (
              <button
                className="button"
                onClick={handleClickAction(() => navigateToStepPage(stepPath, demoSuffix, router.push))}
                onPointerUp={handlePointerAction(() => navigateToStepPage(stepPath, demoSuffix, router.push))}
                type="button"
              >
                Open {labelForPage(currentStep.page)}
              </button>
            ) : null}
          </div>
        ) : null}
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
            disabled={nextBlocked}
            onClick={handleClickAction(nextStep)}
            onPointerUp={handlePointerAction(nextStep)}
            title={nextBlocked ? `Open ${labelForPage(currentStep.page)} to continue` : undefined}
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

// Renders the highlight ring around the target element, inflated 8px on each
// side so the element isn't flush against the cutout.
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

// Positions the tutorial card relative to its target: prefer just below the
// element, flip above when there isn't room, and clamp within a 16px viewport
// margin so the card is never cut off. Returns {} (centered via CSS) when there's
// no target.
function tutorialCardStyle(rect: DOMRect | null): CSSProperties {
  if (!rect) {
    return {};
  }

  const cardWidth = Math.min(360, window.innerWidth - 32);
  const cardHeight = Math.min(360, window.innerHeight - 32);
  const left = clamp(rect.left, 16, Math.max(16, window.innerWidth - cardWidth - 16));
  const below = rect.bottom + 18;
  const above = rect.top - cardHeight - 18;
  const preferredTop = below + cardHeight <= window.innerHeight - 16 ? below : above;
  const top = clamp(preferredTop, 16, Math.max(16, window.innerHeight - cardHeight - 16));

  return {
    left,
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
    top,
    width: cardWidth
  };
}

// True when the element sits clear of the top/bottom 72px (where fixed headers
// or the card might cover it), so we only auto-scroll when it's actually cramped.
function isRectComfortablyVisible(rect: DOMRect) {
  return rect.top >= 72 && rect.bottom <= window.innerHeight - 72;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Flattens the global + per-page steps into the single ordered tour sequence.
function allTutorialSteps() {
  return [
    ...globalSteps,
    ...pageSteps.dashboard,
    ...pageSteps.pipelines,
    ...pageSteps.connections,
    ...pageSteps.settings
  ];
}

// Maps the current pathname to a tutorial page key (defaulting to dashboard).
function pageKeyForPath(pathname: string) {
  if (pathname.startsWith("/pipelines")) return "pipelines";
  if (pathname.startsWith("/connections")) return "connections";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
}

function pathForPage(page: TutorialPageKey) {
  return {
    connections: "/connections",
    dashboard: "/dashboard",
    pipelines: "/pipelines",
    settings: "/settings"
  }[page];
}

function labelForPage(page?: TutorialPageKey) {
  if (!page) return "this tab";
  return {
    connections: "Connections",
    dashboard: "Queue",
    pipelines: "Pipelines",
    settings: "Settings"
  }[page];
}

function navigateToStepPage(
  stepPath: string | undefined,
  demoSuffix: string,
  push: (href: Route) => void
) {
  if (!stepPath) return;
  push(`${stepPath}${demoSuffix}` as Route);
}

// Reads the persisted tour position, tolerating missing/corrupt storage by
// returning null (no resume).
function restoreTutorialSession() {
  try {
    const stored = window.sessionStorage.getItem(tutorialSessionKey);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as { index?: unknown };
    return typeof parsed.index === "number" ? { index: parsed.index } : null;
  } catch {
    return null;
  }
}
