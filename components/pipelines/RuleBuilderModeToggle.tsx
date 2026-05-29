"use client";

import { type ReactNode, useState } from "react";

// Tabbed switch between the two rule-editing UIs (visual builder vs. classic
// form). Both are always mounted; the inactive one is `hidden` AND `disabled` so
// its form fields don't submit — only the visible mode's inputs reach the action.
export function RuleBuilderModeToggle({
  classic,
  visual
}: {
  classic: ReactNode;
  visual: ReactNode;
}) {
  const [mode, setMode] = useState<"visual" | "classic">("visual");

  return (
    <div className="rule-builder-mode">
      <div className="rule-builder-toggle" aria-label="Rule builder mode">
        <button
          aria-pressed={mode === "visual"}
          className={mode === "visual" ? "button primary" : "button"}
          onClick={() => setMode("visual")}
          type="button"
        >
          Visual builder
        </button>
        <button
          aria-pressed={mode === "classic"}
          className={mode === "classic" ? "button primary" : "button"}
          onClick={() => setMode("classic")}
          type="button"
        >
          Classic form
        </button>
      </div>
      <fieldset className="rule-builder-mode-panel" disabled={mode !== "visual"} hidden={mode !== "visual"}>
        {visual}
      </fieldset>
      <fieldset
        className="rule-builder-mode-panel"
        disabled={mode !== "classic"}
        hidden={mode !== "classic"}
      >
        {classic}
      </fieldset>
    </div>
  );
}
