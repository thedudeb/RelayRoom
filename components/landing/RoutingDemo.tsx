"use client";

import { CheckCircle2, FileVideo, FolderTree, Youtube } from "lucide-react";
import { useEffect, useState } from "react";

type Scenario = {
  file: string;
  matchIndex: number;
  playlist: string;
};

const scenarios: Scenario[] = [
  {
    file: "Engineering Standup 2026-05-13.mp4",
    matchIndex: 0,
    playlist: "Engineering Standups"
  },
  {
    file: "Acme Roadmap Review.mp4",
    matchIndex: 1,
    playlist: "Client Calls"
  },
  {
    file: "Architecture Deep Dive.mov",
    matchIndex: 2,
    playlist: "Architecture Library"
  }
];

const rules = [
  { id: "eng", label: 'filename contains "Engineering"' },
  { id: "acme", label: 'filename contains "Acme"' },
  { id: "arch", label: 'filename contains "Architecture"' }
];

const stepDurationMs = 6000;

export function RoutingDemo() {
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [phase, setPhase] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase(3);
      return;
    }

    let cancelled = false;
    const timers = [
      window.setTimeout(() => !cancelled && setPhase(1), 1100),
      window.setTimeout(() => !cancelled && setPhase(2), 2600),
      window.setTimeout(() => !cancelled && setPhase(3), 4200),
      window.setTimeout(() => {
        if (!cancelled) setScenarioIndex((index) => (index + 1) % scenarios.length);
      }, stepDurationMs)
    ];

    setPhase(0);

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [scenarioIndex]);

  const scenario = scenarios[scenarioIndex];

  return (
    <div className="routing-demo" aria-hidden="true">
      <div className="routing-node" data-active={phase >= 0}>
        <div className="routing-node-label">
          <FolderTree size={14} aria-hidden="true" />
          Drive · Recordings
        </div>
        <div className={`routing-file ${phase >= 0 ? "is-arrived" : ""}`} key={scenario.file}>
          <FileVideo size={16} aria-hidden="true" />
          <span>{scenario.file}</span>
        </div>
      </div>

      <RoutingConnector active={phase >= 1} />

      <div className="routing-node" data-active={phase >= 1}>
        <div className="routing-node-label">
          <span className="routing-node-glyph">⌘</span>
          Routing rules
        </div>
        <div className="routing-rules">
          {rules.map((rule, index) => (
            <div
              className="routing-rule"
              data-matched={phase >= 2 && index === scenario.matchIndex}
              key={rule.id}
            >
              <span className="routing-rule-token">
                {index === scenario.matchIndex ? "MATCH" : "-"}
              </span>
              <span className="routing-rule-label">{rule.label}</span>
            </div>
          ))}
        </div>
      </div>

      <RoutingConnector active={phase >= 2} />

      <div className="routing-node" data-active={phase >= 3}>
        <div className="routing-node-label">
          <Youtube size={14} aria-hidden="true" />
          YouTube · {scenario.playlist}
        </div>
        <div className={`routing-landing ${phase >= 3 ? "is-landed" : ""}`} key={`${scenario.file}-dest`}>
          <FileVideo size={16} aria-hidden="true" />
          <span>{scenario.file}</span>
          <span className="badge uploaded">
            <CheckCircle2 size={11} aria-hidden="true" />
            Uploaded
          </span>
        </div>
      </div>
    </div>
  );
}

function RoutingConnector({ active }: { active: boolean }) {
  return (
    <div className="routing-connector" data-active={active} aria-hidden="true">
      <span className="routing-connector-line" />
      <span className="routing-connector-arrow" />
    </div>
  );
}
