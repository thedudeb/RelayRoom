import type { ReactNode } from "react";

type Illustration = "queue" | "filter" | "pipeline" | "connection";

export function EmptyState({
  illustration = "queue",
  title,
  body,
  action
}: {
  illustration?: Illustration;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state empty-state-rich">
      <div className="empty-state-art" aria-hidden="true">
        <EmptyIllustration kind={illustration} />
      </div>
      <strong>{title}</strong>
      {body ? <p>{body}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}

function EmptyIllustration({ kind }: { kind: Illustration }) {
  switch (kind) {
    case "filter":
      return <FilterIllustration />;
    case "pipeline":
      return <PipelineIllustration />;
    case "connection":
      return <ConnectionIllustration />;
    case "queue":
    default:
      return <QueueIllustration />;
  }
}

function QueueIllustration() {
  return (
    <svg viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect x="14" y="44" width="38" height="32" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 50 L22 50 L26 46 L52 46" stroke="currentColor" strokeWidth="1.5" />
      <line x1="56" y1="60" x2="124" y2="60" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" opacity="0.45" />
      <rect x="72" y="44" width="36" height="32" rx="5" stroke="currentColor" strokeOpacity="0.38" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="90" cy="60" r="2.5" fill="currentColor" opacity="0.5" />
      <rect x="128" y="44" width="38" height="32" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M143 53 L153 60 L143 67 Z" fill="currentColor" />
    </svg>
  );
}

function FilterIllustration() {
  return (
    <svg viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <rect x="44" y="22" width="76" height="86" rx="6" transform="rotate(-6 82 65)" stroke="currentColor" strokeWidth="1.5" />
      <line x1="60" y1="44" x2="106" y2="38" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <line x1="62" y1="58" x2="108" y2="52" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <line x1="64" y1="72" x2="100" y2="66" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <circle cx="118" cy="80" r="18" stroke="currentColor" strokeWidth="2" />
      <line x1="131" y1="93" x2="146" y2="106" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="111" y1="80" x2="125" y2="80" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
    </svg>
  );
}

function PipelineIllustration() {
  return (
    <svg viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <circle cx="32" cy="60" r="10" stroke="currentColor" strokeWidth="1.5" />
      <rect x="62" y="34" width="56" height="18" rx="4" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="4 4" />
      <rect x="62" y="58" width="56" height="18" rx="4" stroke="currentColor" strokeOpacity="0.85" strokeWidth="1.5" />
      <rect x="62" y="82" width="56" height="18" rx="4" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="148" cy="60" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M145 56 L153 60 L145 64 Z" fill="currentColor" />
      <path d="M42 60 H62" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M118 67 H138" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    </svg>
  );
}

function ConnectionIllustration() {
  return (
    <svg viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
      <circle cx="56" cy="60" r="22" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="56" cy="60" r="6" fill="currentColor" opacity="0.55" />
      <circle cx="124" cy="60" r="22" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="124" cy="60" r="6" fill="currentColor" opacity="0.55" />
      <path d="M78 60 Q90 38 102 60" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.6" />
      <circle cx="90" cy="46" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
